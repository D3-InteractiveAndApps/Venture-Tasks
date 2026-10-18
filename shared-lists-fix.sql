-- Venture Tasks — fix for sharing a list
--
-- Fixes the error:  infinite recursion detected in policy for relation
--                   "shared_page_members"
-- shown when tapping "Generate invite code".
--
-- Run this ONCE in the Supabase SQL Editor (it's safe to run again —
-- every statement replaces what it's fixing). It doesn't touch any data;
-- it only replaces five row-level security rules and adds one helper.
--
-- What was wrong:
-- 1. The rule controlling who can SEE rows in shared_page_members ("are
--    you a member of this page?") answered that question by looking IN
--    shared_page_members — which re-applies the same rule, which looks in
--    shared_page_members again, forever. Postgres stops and reports
--    infinite recursion. Every other sharing rule (pages, sections,
--    tasks) also looks in shared_page_members, so all of sharing failed.
-- 2. Behind that: creating a shared list reads the new row straight back
--    before the owner has been added as a member, and only members were
--    allowed to read it — so even without (1), "Generate invite code"
--    would have failed next with a row-level security error.
--
-- The fix: one small helper function, is_shared_page_member(), that does
-- the membership check with the table owner's rights (security definer),
-- so it isn't subject to the rules itself and can't recurse. Every rule
-- calls the helper instead of querying the table directly, and the owner
-- of a shared list can always read it.

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

-- Who's on a shared page: you can always see your own membership rows,
-- and every member row of any page you belong to.
drop policy if exists "Members can see who else is on a shared page" on public.shared_page_members;
create policy "Members can see who else is on a shared page"
  on public.shared_page_members for select
  using (user_id = auth.uid() or public.is_shared_page_member(shared_page_id));

-- A shared page: its owner and its members can read it.
drop policy if exists "Members can read a shared page" on public.shared_pages;
create policy "Members can read a shared page"
  on public.shared_pages for select
  using (owner_user_id = auth.uid() or public.is_shared_page_member(id));

-- Sections and tasks: any member can read and write.
drop policy if exists "Members can manage sections" on public.shared_sections;
create policy "Members can manage sections"
  on public.shared_sections for all
  using (public.is_shared_page_member(shared_page_id))
  with check (public.is_shared_page_member(shared_page_id));

drop policy if exists "Members can manage tasks" on public.shared_tasks;
create policy "Members can manage tasks"
  on public.shared_tasks for all
  using (public.is_shared_page_member(shared_page_id))
  with check (public.is_shared_page_member(shared_page_id));
