-- Run this against your external Supabase project (e.g. `supabase db push`
-- with this file placed under supabase/migrations/, or paste into the SQL
-- editor). Adds time-of-day + timezone to scheduled scans so daily/weekly
-- schedules fire at a specific local time chosen by the user.
alter table public.scan_schedules
  add column if not exists run_at_local time without time zone,
  add column if not exists timezone text;
