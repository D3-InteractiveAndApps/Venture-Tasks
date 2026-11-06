-- Venture Tasks heartbeat: keeps the free Supabase project from pausing.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- A one-row table that nobody can read or change directly, and one function that
-- stamps the time on it. The GitHub keep-alive calls the function every 4 hours,
-- so the database sees a real write several times a day.

create table if not exists public.venturetasks_heartbeat (
  id      int primary key default 1 check (id = 1),
  beat_at timestamptz not null default now(),
  beats   bigint      not null default 0
);
insert into public.venturetasks_heartbeat (id) values (1) on conflict (id) do nothing;

-- Row-level security on with no policies: the table is invisible through the API.
alter table public.venturetasks_heartbeat enable row level security;

create or replace function public.venturetasks_ping()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  update public.venturetasks_heartbeat
     set beat_at = now(), beats = beats + 1
   where id = 1
  returning beat_at;
$$;

-- The function can only stamp the time. It reads and returns nothing else.
-- It's the one function signed-out callers may use (security-hardening.sql
-- closes all the others), because the GitHub keep-alive isn't signed in.
revoke all on function public.venturetasks_ping() from public;
grant execute on function public.venturetasks_ping() to anon, authenticated;

-- Check it worked: this should show the current date and time.
select public.venturetasks_ping() as last_beat, beats from public.venturetasks_heartbeat;
