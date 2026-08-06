-- Run this whole file in the Supabase SQL editor of your project
-- (tidjygzrpsqyaznrlrhe). It:
--   1. adds the pending scheduled-scan columns
--   2. installs a pg_cron job that pings the app every 15 minutes
--
-- Prerequisite: publish the app and add these Build Secrets first:
--   SB_URL                = https://tidjygzrpsqyaznrlrhe.supabase.co
--   SB_SERVICE_ROLE_KEY   = <service role key from Supabase, API settings>
--   SCAN_CRON_SECRET      = 23e5a1b74db9b14c5e57aa71b2cd5c2581383effce820a08

-- 0. See whether a job already exists (an old Lovable Cloud one won't be here).
select jobid, jobname, schedule, active from cron.job;

-- 1. Pending schedule columns (time-of-day support).
alter table public.scan_schedules
  add column if not exists run_at_local time without time zone,
  add column if not exists timezone text;

-- 2. Extensions.
create schema if not exists extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 3. (Re)create the 15-minute trigger.
select cron.unschedule('job-monitor-scan')
where exists (select 1 from cron.job where jobname = 'job-monitor-scan');

select cron.schedule(
  'job-monitor-scan',
  '*/15 * * * *',
  $$
  select extensions.http_post(
    url     := 'https://sio42-jobs.lovable.app/api/public/scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '23e5a1b74db9b14c5e57aa71b2cd5c2581383effce820a08'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 4. Verify: the job is listed, and after ~15 min this shows the HTTP result.
select jobid, jobname, schedule, active from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 5;
-- select id, status_code, content from extensions._http_response order by created desc limit 5;
