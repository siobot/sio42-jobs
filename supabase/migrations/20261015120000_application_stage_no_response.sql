-- New application stage. Kept in its own migration: Postgres won't let a
-- newly added enum value be used until the transaction that added it commits.
ALTER TYPE public.application_stage ADD VALUE IF NOT EXISTS 'no_response' AFTER 'applied';
