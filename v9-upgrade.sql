-- v9-upgrade.sql — run once in the Supabase SQL editor (after the earlier
-- schema files). Safe to run again; it only adds what's missing.
--
-- 1. Notes (and the "Daily task" flag) on shared lists and calendars, so
--    everyone on a shared calendar sees an event's note.
-- 2. The tables behind push reminders: which devices want push, which
--    reminders already went to each, and the server's push keys.
--    (The once-a-minute schedule that actually sends them is in
--    push-cron.sql, the last setup step.)

-- ---------------------------------------------------------------- 1. notes
alter table public.shared_tasks add column if not exists note text;
alter table public.shared_tasks add column if not exists is_daily boolean not null default false;

-- ---------------------------------------------------------------- 2. push
-- One row per device (browser) that turned on "Push to this device".
-- endpoint/p256dh/auth come from the browser's push subscription; time_zone
-- and prefs (daily summary time, default event lead, ...) are that device's
-- Settings → Reminders choices, so the server can work out "now" the way
-- the person sees it.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  time_zone text not null default 'UTC',
  prefs jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: read own" on public.push_subscriptions;
create policy "push_subscriptions: read own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "push_subscriptions: delete own" on public.push_subscriptions;
create policy "push_subscriptions: delete own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
-- No insert/update policies: saving goes through save_push_subscription()
-- below, which always files the row under the caller's own account.

-- Which reminders have already gone to which device (so each goes once).
-- Server-only: RLS on with no policies means signed-in users can't see it.
create table if not exists public.push_sent (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, key)
);
alter table public.push_sent enable row level security;

-- The server's own settings: its VAPID key pair (created automatically by
-- the push-reminders function the first time it runs) and the secret the
-- once-a-minute job must present. Server-only, like push_sent.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public_key text,
  vapid_private_jwk jsonb,
  cron_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.push_config enable row level security;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

-- Register (or refresh) this device for push. A browser has one push
-- address; if someone else was signed in on it before, it moves to the
-- account that's signed in now.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text,
  p_time_zone text default 'UTC', p_prefs jsonb default '{}'::jsonb, p_user_agent text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2000 then
    raise exception 'That push address doesn''t look right.';
  end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'The push subscription is missing its keys.';
  end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, time_zone, prefs, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, coalesce(nullif(p_time_zone, ''), 'UTC'),
          coalesce(p_prefs, '{}'::jsonb), left(p_user_agent, 300))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    time_zone = excluded.time_zone, prefs = excluded.prefs, user_agent = excluded.user_agent,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.save_push_subscription(text, text, text, text, jsonb, text) from public;
grant execute on function public.save_push_subscription(text, text, text, text, jsonb, text) to authenticated;
