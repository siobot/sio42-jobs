-- Fantastic Jobs quota remaining after each Discover run (from x-api-* response headers).
ALTER TABLE public.discovery_runs
  ADD COLUMN IF NOT EXISTS jobs_remaining INTEGER,
  ADD COLUMN IF NOT EXISTS requests_remaining INTEGER;
