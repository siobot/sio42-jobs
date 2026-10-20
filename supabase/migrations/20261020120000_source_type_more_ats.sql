-- Job boards beyond Greenhouse, Ashby, and Lever that publish open job lists.
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'workable';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'recruitee';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'personio';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'bamboohr';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'breezy';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'pinpoint';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'smartrecruiters';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'teamtailor';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'workday';
