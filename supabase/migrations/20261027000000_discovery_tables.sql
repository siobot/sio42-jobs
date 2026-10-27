-- Company discovery feature: tables for Fantastic Jobs API-based discovery

-- Discovery keywords (broad search terms for the Fantastic Jobs API)
CREATE TABLE public.discovery_keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, term)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_keywords TO authenticated;
GRANT ALL ON public.discovery_keywords TO service_role;
ALTER TABLE public.discovery_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own discovery_keywords" ON public.discovery_keywords
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Discovery runs (one row per execution)
CREATE TABLE public.discovery_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  jobs_fetched INTEGER NOT NULL DEFAULT 0,
  companies_found INTEGER NOT NULL DEFAULT 0,
  companies_suggested INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_runs TO authenticated;
GRANT ALL ON public.discovery_runs TO service_role;
ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own discovery_runs" ON public.discovery_runs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX discovery_runs_user_started_idx ON public.discovery_runs(user_id, started_at DESC);

-- Suggested companies queue
CREATE TABLE public.discovery_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ats_type TEXT NOT NULL,
  slug TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  matching_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_suggestions TO authenticated;
GRANT ALL ON public.discovery_suggestions TO service_role;
ALTER TABLE public.discovery_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own discovery_suggestions" ON public.discovery_suggestions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX discovery_suggestions_user_status_idx ON public.discovery_suggestions(user_id, status);

-- Discovery config (per-user settings)
CREATE TABLE public.discovery_config (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  time_frame TEXT NOT NULL DEFAULT '7d',
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_config TO authenticated;
GRANT ALL ON public.discovery_config TO service_role;
ALTER TABLE public.discovery_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own discovery_config" ON public.discovery_config
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
