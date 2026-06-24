
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS linkedin_easy_apply boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  stage public.application_stage NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_events_app_idx
  ON public.application_events (application_id, changed_at);
CREATE INDEX IF NOT EXISTS application_events_user_idx
  ON public.application_events (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_events TO authenticated;
GRANT ALL ON public.application_events TO service_role;

ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own application_events" ON public.application_events;
CREATE POLICY "Users manage their own application_events"
  ON public.application_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.log_application_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.application_events (application_id, user_id, stage, changed_at)
    VALUES (NEW.id, NEW.user_id, NEW.stage, COALESCE(NEW.applied_at, now()));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.application_events (application_id, user_id, stage, changed_at)
    VALUES (NEW.id, NEW.user_id, NEW.stage, now());
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS applications_log_stage_insert ON public.applications;
CREATE TRIGGER applications_log_stage_insert
  AFTER INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.log_application_stage_change();

DROP TRIGGER IF EXISTS applications_log_stage_update ON public.applications;
CREATE TRIGGER applications_log_stage_update
  AFTER UPDATE OF stage ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.log_application_stage_change();

INSERT INTO public.application_events (application_id, user_id, stage, changed_at)
SELECT a.id, a.user_id, a.stage, COALESCE(a.applied_at, a.created_at, now())
FROM public.applications a
WHERE NOT EXISTS (
  SELECT 1 FROM public.application_events e WHERE e.application_id = a.id
);
