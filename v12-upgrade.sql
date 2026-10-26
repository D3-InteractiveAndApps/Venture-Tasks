-- v12-upgrade.sql: run once in the Supabase SQL editor. Safe to run again.
--
-- Lets a Meal plan page be shared like any other list. It allows the new
-- page type, and gives shared items an ingredients list so everyone on a
-- shared meal plan sees what each meal needs.
-- Without this, meal plans work fine on your own devices; only sharing one
-- is blocked.

alter table public.shared_pages drop constraint if exists shared_pages_type_check;
alter table public.shared_pages add constraint shared_pages_type_check
  check (type in ('tasks', 'grocery', 'calendar', 'meals'));

alter table public.shared_tasks add column if not exists ingredients jsonb;
