-- Venture Tasks — account deletion
--
-- Backs the "Delete my account and data" button in Settings → Account &
-- sync. The actual cleanup work is almost entirely already done FOR us —
-- every table added across the main setup and the shared-lists/live-
-- calendar/family-calendar schemas references auth.users(id) with
-- `on delete cascade`:
--   app_state.user_id              -> cascades
--   calendar_tokens.user_id        -> cascades
--   shared_pages.owner_user_id     -> cascades (deletes every shared list
--                                     or calendar this account OWNS,
--                                     which in turn cascades to THAT
--                                     page's members/sections/tasks —
--                                     same end result as hitting "Stop
--                                     sharing" first, just automatic)
--   shared_page_members.user_id    -> cascades (drops this account's
--                                     membership on anything owned by
--                                     someone ELSE, without touching that
--                                     list for its other members)
--
-- So the only thing actually missing is deleting the auth.users row
-- itself — which a plain client-side call can't do (auth.users isn't
-- writable by the normal authenticated role), hence this one function.
-- Same pattern as Shiny Ledger's delete-account.sql.
--
-- Run this in the SQL Editor any time after the main app_state setup —
-- it doesn't depend on shared-lists/live-calendar/family-calendar being
-- installed, it just cascades through whichever of those tables exist.

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function delete_my_account() to authenticated;
