-- Venture Tasks — shared lists
--
-- Adds the ability for two (or more) Supabase accounts to co-own and
-- live-edit a single page — the "share a grocery list with my partner"
-- feature. This is entirely additive and opt-in per page:
--   - A page that's never been shared behaves exactly as it does today:
--     it lives only in that one account's app_state JSON blob.
--   - A page the owner turns into a shared list gets its sections/tasks
--     mirrored into the tables below, where every member (not just the
--     owner) can read and write them, enforced by Postgres row level
--     security — not by anything the app's JavaScript has to get right.
--
-- Run this in the SQL Editor AFTER the app_state setup from the main
-- README. It doesn't touch app_state or its policy at all.

-- One row per shared list. invite_code is how a second account finds it —
-- see redeem_share_code() below.
create table shared_pages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'tasks' check (type in ('tasks', 'grocery')),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

-- Who's allowed into a given shared list. The owner is a member too
-- (added automatically when the list is created) so one "members" check
-- covers everyone, owner included.
create table shared_page_members (
  shared_page_id uuid not null references shared_pages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (shared_page_id, user_id)
);

-- Mirrors of a shared page's sections/tasks. Deliberately plain columns
-- (not a jsonb blob like app_state) so Realtime can broadcast row-level
-- changes and two members' simultaneous edits to different rows don't
-- clobber each other the way two whole-blob pushes would.
--
-- IMPORTANT: the client always gives these rows the SAME id as the
-- matching local section/task object (see sync.js). That's what lets a
-- local edit map straight onto an upsert here with no separate id table.
create table shared_sections (
  id uuid primary key,
  shared_page_id uuid not null references shared_pages(id) on delete cascade,
  name text not null,
  "order" double precision not null default 0,
  color text,
  created_at timestamptz not null default now()
);

create table shared_tasks (
  id uuid primary key,
  shared_page_id uuid not null references shared_pages(id) on delete cascade,
  shared_section_id uuid not null references shared_sections(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  "order" double precision not null default 0,
  color text,
  due_date date,
  recurrence text,
  is_someday boolean not null default false,
  client text,
  value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table shared_pages enable row level security;
alter table shared_page_members enable row level security;
alter table shared_sections enable row level security;
alter table shared_tasks enable row level security;

-- Membership check used by every policy below. It runs with the table
-- owner's rights (security definer), so it isn't itself subject to these
-- policies — a policy on shared_page_members that queried
-- shared_page_members directly would re-trigger itself forever ("infinite
-- recursion detected in policy"). It only ever answers for the signed-in
-- user (auth.uid()), so it can't be used to probe anyone else's access.
create or replace function public.is_shared_page_member(page_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.shared_page_members
    where shared_page_id = page_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_shared_page_member(uuid) from public;
grant execute on function public.is_shared_page_member(uuid) to authenticated;

-- --- shared_pages ---
-- The owner can always read their own page (the app reads it straight
-- back right after creating it, before adding itself as a member).
create policy "Members can read a shared page"
  on shared_pages for select
  using (owner_user_id = auth.uid() or public.is_shared_page_member(id));

create policy "A user can create a shared page they own"
  on shared_pages for insert
  with check (owner_user_id = auth.uid());

create policy "Owner can rename their shared page"
  on shared_pages for update
  using (owner_user_id = auth.uid());

create policy "Owner can stop sharing (delete) their shared page"
  on shared_pages for delete
  using (owner_user_id = auth.uid());

-- --- shared_page_members ---
create policy "Members can see who else is on a shared page"
  on shared_page_members for select
  using (user_id = auth.uid() or public.is_shared_page_member(shared_page_id));

-- The owner adding themself as the first member happens directly from the
-- client (there's no invite code yet at creation time). Anyone else joins
-- through redeem_share_code() below instead, which runs with elevated
-- privileges precisely so this policy doesn't have to allow arbitrary
-- inserts from people who merely know a shared_page_id.
create policy "Owner can add themself as a member"
  on shared_page_members for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from shared_pages p where p.id = shared_page_id and p.owner_user_id = auth.uid())
  );

create policy "A member can leave a shared page on their own"
  on shared_page_members for delete
  using (user_id = auth.uid());

-- --- shared_sections / shared_tasks: any member can read and write ---
create policy "Members can manage sections"
  on shared_sections for all
  using (public.is_shared_page_member(shared_page_id))
  with check (public.is_shared_page_member(shared_page_id));

create policy "Members can manage tasks"
  on shared_tasks for all
  using (public.is_shared_page_member(shared_page_id))
  with check (public.is_shared_page_member(shared_page_id));

-- Joining a shared list by invite code. Runs as the function owner
-- (security definer), not the calling user, so it can look up a page by
-- code and insert a membership row for the caller even before RLS would
-- otherwise let them see that page exists. This is the ONLY way a non-owner
-- ever gets into shared_page_members.
create or replace function redeem_share_code(code text)
returns shared_pages
language plpgsql
security definer
set search_path = public
as $$
declare
  found_page shared_pages;
begin
  select * into found_page from shared_pages where invite_code = code;
  if found_page.id is null then
    raise exception 'That invite code doesn''t match any shared list.';
  end if;

  insert into shared_page_members (shared_page_id, user_id, role)
  values (found_page.id, auth.uid(), 'editor')
  on conflict (shared_page_id, user_id) do nothing;

  return found_page;
end;
$$;

grant execute on function redeem_share_code(text) to authenticated;

-- Realtime: lets both members see each other's edits within a second or
-- two, the same way app_state already does for your own multiple devices.
alter publication supabase_realtime add table shared_sections;
alter publication supabase_realtime add table shared_tasks;
alter publication supabase_realtime add table shared_page_members;
