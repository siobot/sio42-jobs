-- Weekly company discovery cron job.
-- Run this in the Supabase SQL editor after deploying the discover-companies edge function.
--
-- Prerequisites:
--   1. Set secrets on the edge function:
--      supabase secrets set FANTASTIC_JOBS_API_KEY=<your key>
--      supabase secrets set DISCOVERY_CRON_SECRET=<generate a random string>
--   2. Deploy: supabase functions deploy discover-companies
--   3. pg_cron + pg_net already enabled (from 2026-08-06-cron-scan.sql)
--
-- Replace <YOUR_DISCOVERY_CRON_SECRET> below with the same value you set above.

-- Unschedule if it already exists
SELECT cron.unschedule('job-monitor-discover')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-monitor-discover');

-- Schedule weekly on Mondays at 06:00 UTC
SELECT cron.schedule(
  'job-monitor-discover',
  '0 6 * * 1',
  $$
  SELECT extensions.http_post(
    url     := 'https://tidjygzrpsqyaznrlrhe.supabase.co/functions/v1/discover-companies',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<YOUR_DISCOVERY_CRON_SECRET>'
    ),
    body    := jsonb_build_object('triggered_by', 'cron')
  );
  $$
);

-- Verify
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'job-monitor-discover';
