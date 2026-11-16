-- Discovery is manual-only (free-plan Fantastic Jobs quota is finite and does
-- not reset). Remove the weekly 'job-monitor-discover' pg_cron job if present.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'job-monitor-discover';
  END IF;
END
$$;
