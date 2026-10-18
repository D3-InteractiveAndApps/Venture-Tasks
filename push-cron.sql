-- push-cron.sql — the LAST push-reminders setup step. Run it in the Supabase
-- SQL editor after v9-upgrade.sql and after deploying the push-reminders
-- function.
--
-- It tells Supabase to call the push-reminders function once a minute.
-- Each call checks every device that turned push on and sends whatever
-- is due.
--
-- BEFORE RUNNING: replace YOUR-PROJECT-REF below with your project's ref.
-- That's the part of SUPABASE_URL in supabase-config.js between
-- "https://" and ".supabase.co".
--
-- Nothing secret needs pasting. The call carries a random secret that
-- v9-upgrade.sql generated and stored in push_config, and it reads that
-- secret at run time.
-- Safe to run again (e.g. after fixing the URL): it replaces the old schedule.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'venture-tasks-push';

select cron.schedule(
  'venture-tasks-push',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select cron_secret from public.push_config where id = 1)
    ),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- To check it's running:  select * from cron.job_run_details order by start_time desc limit 5;
-- To see what the function answered:  select status_code, content from net._http_response order by created desc limit 5;
-- To stop push reminders entirely:  select cron.unschedule('venture-tasks-push');
