## Plan: Add `.env.local` fallback to `auth-middleware.ts`

### What will change
Update `src/integrations/supabase/auth-middleware.ts` so it reads Supabase URL and publishable key with the same fallback pattern as `src/integrations/supabase/client.ts`:

- `process.env.SB_URL` → `import.meta.env.VITE_SUPABASE_URL || process.env.SB_URL`
- `process.env.SB_PUBLISHABLE_KEY` → `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SB_PUBLISHABLE_KEY`

### Why
This lets the auth middleware pick up the external Supabase credentials from the public `.env.local` file (which Vite exposes via `import.meta.env.VITE_*`) without requiring Build Secrets. The `SB_*` Build Secrets remain the fallback for deployed runtime.

### What is untouched
- `src/integrations/supabase/client.ts` remains unchanged, as requested previously.
- `src/integrations/supabase/client.server.ts` remains unchanged (service role key is server-only and has no Vite fallback).
- `src/routes/api.public.scan.ts` remains unchanged (it uses `SB_PUBLISHABLE_KEY` intentionally).

### Note
`auth-middleware.ts` is an auto-generated integration file. This edit may be overwritten if the Supabase integration is regenerated, but it is necessary for the current external-Supabase setup.