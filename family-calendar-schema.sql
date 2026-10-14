-- Venture Tasks — Family Calendar
--
-- Adds a third page type, "calendar", that renders as a month grid instead
-- of a checklist — a dedicated shareable calendar page for freestanding
-- events, which can also have one or more to-do/grocery lists "linked" to
-- it so their due dates show up on the grid too (see sync.js's
-- shareListWithCalendarMembers / addSharedMembersFrom). This is layered on
-- top of shared-lists-schema.sql — run that one first.
--
-- Three small changes to what's already there, plus one new function:

-- 1. A calendar page needs to be shareable like any other page, so
-- shared_pages' type check has to allow it.
alter table shared_pages drop constraint if exists shared_pages_type_check;
alter table shared_pages add constraint shared_pages_type_check check (type in ('tasks', 'grocery', 'calendar'));

-- 1b. Which other shared lists' due dates should show up on this
-- calendar's grid — only meaningful when type = 'calendar'. An array of
-- shared_pages.id values (not local page ids, which differ per account —
-- this has to be something every member resolves the same way). Members
-- translate each id back to their own local page via its sharedPageId
-- when rendering (see sync.js); one they haven't been given access to
-- yet just doesn't show anything until they are.
alter table shared_pages add column if not exists linked_shared_page_ids jsonb not null default '[]'::jsonb;

-- 2. Calendar events can optionally carry a time of day (events on a
-- to-do/grocery page never set this — it's always null there). Stored as
-- plain "HH:MM" text, same spirit as due_date being a plain date: no time
-- zone math, just what the person typed.
alter table shared_tasks add column if not exists event_time text;

-- 3. A readable label for who's on a shared page — without this there's
-- no way to show "share this list with Jamie too?" because nothing else
-- here can read another account's email address. Each member writes their
-- OWN email into their OWN row (see redeem_share_code below, and
-- createSharedList in sync.js for the owner's row) — never looked up for
-- someone else directly, only ever self-reported at join/create time.
alter table shared_page_members add column if not exists member_email text;

-- Every join already went through here; now it also records the joiner's
-- email, so later features (like the cross-share prompt below) have
-- something readable to show. Re-running this (CREATE OR REPLACE, same
-- signature) is all that's needed — no separate migration step for
-- existing members, since there aren't any live members yet.
create or replace function redeem_share_code(code text)
returns shared_pages
language plpgsql
security definer
set search_path = public
as $$
declare
  found_page shared_pages;
  caller_email text;
begin
  select * into found_page from shared_pages where invite_code = code;
  if found_page.id is null then
    raise exception 'That invite code doesn''t match any shared list.';
  end if;

  select email into caller_email from auth.users where id = auth.uid();

  insert into shared_page_members (shared_page_id, user_id, role, member_email)
  values (found_page.id, auth.uid(), 'editor', caller_email)
  on conflict (shared_page_id, user_id) do update set member_email = excluded.member_email;

  return found_page;
end;
$$;

-- Lets someone who's already sharing a calendar with people also share a
-- newly-linked list with that same group, with no new invite code — the
-- "would you like to also share this list with them?" prompt in Settings.
-- Deliberately narrow: the caller must already be a member of BOTH the
-- source (the calendar) and the target (the list) — it copies membership
-- between two things the caller can already see, never membership into
-- something they can't.
create or replace function add_shared_members_from(source_shared_page_id uuid, target_shared_page_id uuid)
returns table(added_email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from shared_page_members
    where shared_page_id = source_shared_page_id and user_id = auth.uid()
  ) then
    raise exception 'You are not a member of that calendar.';
  end if;
  if not exists (
    select 1 from shared_page_members
    where shared_page_id = target_shared_page_id and user_id = auth.uid()
  ) then
    raise exception 'You are not a member of that list.';
  end if;

  return query
  insert into shared_page_members (shared_page_id, user_id, role, member_email)
  select target_shared_page_id, m.user_id, 'editor', m.member_email
  from shared_page_members m
  where m.shared_page_id = source_shared_page_id
    and m.user_id <> auth.uid()
    and not exists (
      select 1 from shared_page_members existing
      where existing.shared_page_id = target_shared_page_id and existing.user_id = m.user_id
    )
  returning member_email;
end;
$$;

grant execute on function add_shared_members_from(uuid, uuid) to authenticated;

-- Updates which lists feed a shared calendar's grid. This is its own
-- function (rather than relying on the plain row-update policy, which is
-- owner-only — see "Owner can rename their shared page" in
-- shared-lists-schema.sql) on purpose: linking a list is something ANY
-- member of a shared calendar should be able to do, not just whoever
-- happened to create it, same as either half of a couple should be able
-- to add their own list to a family calendar.
create or replace function set_calendar_linked_lists(calendar_shared_page_id uuid, linked_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from shared_page_members
    where shared_page_id = calendar_shared_page_id and user_id = auth.uid()
  ) then
    raise exception 'You are not a member of that calendar.';
  end if;

  update shared_pages
  set linked_shared_page_ids = to_jsonb(linked_ids)
  where id = calendar_shared_page_id;
end;
$$;

grant execute on function set_calendar_linked_lists(uuid, uuid[]) to authenticated;
