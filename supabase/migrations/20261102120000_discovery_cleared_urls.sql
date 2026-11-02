-- Job URLs hidden with "Dismiss all", so later discovery runs don't re-add them
-- while still adding that company's new jobs.
ALTER TABLE public.discovery_suggestions
  ADD COLUMN IF NOT EXISTS cleared_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
