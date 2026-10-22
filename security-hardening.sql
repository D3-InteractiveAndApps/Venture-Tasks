-- security-hardening.sql — run once in the Supabase SQL editor, after the
-- other schema files (including v9-upgrade.sql). Safe to run again.
--
-- What it tightens:
--   1. Invite codes can't be guessed by brute force. Joining a shared list
--      now requires being signed in, and an account gets at most 10 wrong
--      codes per hour. Without this, a script could try codes over and over
--      until it landed in someone's list (and saw its items and members'
--      emails).
--   2. Signed-out visitors (the public "anon" role) can't call any of the
--      app's server functions at all. Supabase lets anon call every function
--      in the public schema by default, and the app never needs it to.
--   3. The owner of a shared list can rename it but can't hand
--      "ownership" of it to some other account.

-- ------------------------------------------------- 1. invite-code guessing
create table if not exists public.share_code_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists share_code_attempts_user_time_idx on public.share_code_attempts(user_id, attempted_at);
-- Server-only bookkeeping: RLS on, no policies, so no one can read or edit it from the app.
alter table public.share_code_attempts enable row level security;

-- Same job as before (join a shared list by its code), with two changes:
-- it refuses signed-out callers, and a wrong code is recorded and answered
-- with NULL instead of an error. Raising an error would roll back the record
-- of the attempt, which is what the hourly limit counts. The app shows
-- "That invite code doesn't match any shared list." for a NULL answer.
create or replace function public.redeem_share_code(code text)
returns shared_pages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  found_page shared_pages;
  caller_email text;
  recent_misses int;
begin
  if v_uid is null then
    raise exception 'Sign in first — shared lists need an account.';
  end if;

  select count(*) into recent_misses
  from share_code_attempts
  where user_id = v_uid and attempted_at > now() - interval '1 hour';
  if recent_misses >= 10 then
    raise exception 'Too many wrong invite codes. Please wait an hour and try again.';
  end if;

  select * into found_page from shared_pages where invite_code = upper(trim(code));
  if found_page.id is null then
    insert into share_code_attempts (user_id) values (v_uid);
    delete from share_code_attempts where attempted_at < now() - interval '1 day';
    return null;
  end if;

  select email into caller_email from auth.users where id = v_uid;
  insert into shared_page_members (shared_page_id, user_id, role, member_email)
  values (found_page.id, v_uid, 'editor', caller_email)
  on conflict (shared_page_id, user_id) do update set member_email = excluded.member_email;
  return found_page;
end;
$$;

-- ------------------------------------------------- 2. no anon access to functions
revoke execute on function public.redeem_share_code(text) from public, anon;
grant execute on function public.redeem_share_code(text) to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.add_shared_members_from(uuid, uuid)',
    'public.set_calendar_linked_lists(uuid, uuid[])',
    'public.delete_my_account()',
    'public.is_shared_page_member(uuid)',
    'public.save_push_subscription(text, text, text, text, jsonb, text)'
  ] loop
    -- Skip any function this project doesn't have (e.g. push not set up).
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;

-- ------------------------------------------------- 3. owner can't give a list away
drop policy if exists "Owner can rename their shared page" on public.shared_pages;
create policy "Owner can rename their shared page"
  on public.shared_pages for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
