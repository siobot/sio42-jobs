-- Discover resumes where the previous run stopped (Fantastic Jobs cursor
-- pagination). Shape: { "<pass>": { "key": "<time_frame + query>", "cursor": <last job id> } }
ALTER TABLE public.discovery_config
  ADD COLUMN IF NOT EXISTS cursors JSONB NOT NULL DEFAULT '{}'::jsonb;
