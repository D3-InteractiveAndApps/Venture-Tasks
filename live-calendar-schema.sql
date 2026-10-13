-- Venture Tasks — live calendar feed
--
-- Backs the "Live calendar" section in Settings → Your data: a
-- webcal/https subscribe link (served by the ics-feed Edge Function,
-- see supabase/functions/ics-feed/index.ts) instead of the one-time
-- .ics download. One opaque token per account — the Edge Function has
-- no signed-in user to check RLS against (a calendar app just fetches a
-- URL, it doesn't log in), so the token itself IS the credential.
--
-- Run this in the SQL Editor alongside shared-lists-schema.sql — this
-- one doesn't depend on it, but both are part of this round of work.

create table calendar_tokens (
  token text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table calendar_tokens enable row level security;

-- The client only ever needs to read/create its OWN token (to build the
-- subscribe link to show the user). The Edge Function itself bypasses
-- this entirely by using the service role key, which is what lets it
-- look up a token's owner with no logged-in user on the request at all.
create policy "Users manage their own calendar token"
  on calendar_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
