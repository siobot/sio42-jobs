-- Moves applications still at "applied" to "no_response" once their last
-- stage change (or applied_at, if no events were logged) is more than 30
-- days old. The existing stage-change trigger logs a "no_response" event.
CREATE OR REPLACE FUNCTION public.mark_stale_applications_no_response()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  moved integer;
BEGIN
  UPDATE public.applications a
     SET stage = 'no_response'
   WHERE a.stage = 'applied'
     AND COALESCE(
           (SELECT max(e.changed_at) FROM public.application_events e WHERE e.application_id = a.id),
           a.applied_at
         ) < now() - interval '30 days';
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END $$;

REVOKE ALL ON FUNCTION public.mark_stale_applications_no_response() FROM PUBLIC, anon, authenticated;

-- Backfill existing applications.
SELECT public.mark_stale_applications_no_response();

-- Re-check daily at 03:15 UTC.
SELECT cron.schedule(
  'mark-stale-applications-no-response',
  '15 3 * * *',
  $$SELECT public.mark_stale_applications_no_response()$$
);
