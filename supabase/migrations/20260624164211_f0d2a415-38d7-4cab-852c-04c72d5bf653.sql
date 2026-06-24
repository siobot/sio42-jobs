CREATE OR REPLACE FUNCTION public.log_application_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_stage public.application_stage;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.application_events (application_id, user_id, stage, changed_at)
    VALUES (NEW.id, NEW.user_id, NEW.stage, COALESCE(NEW.applied_at, now()));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    SELECT stage INTO latest_stage
    FROM public.application_events
    WHERE application_id = NEW.id
    ORDER BY changed_at DESC, created_at DESC
    LIMIT 1;
    IF latest_stage IS DISTINCT FROM NEW.stage THEN
      INSERT INTO public.application_events (application_id, user_id, stage, changed_at)
      VALUES (NEW.id, NEW.user_id, NEW.stage, now());
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;