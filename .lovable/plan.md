Plan: Rename Supabase environment variables to use the SB_ prefix in the three server-side files so they work with Workspace Build Secrets (which blocks the SUPABASE_ prefix).

Affected files and changes:
1. `src/integrations/supabase/client.server.ts`
   - `process.env.SUPABASE_URL` → `process.env.SB_URL`
   - `process.env.SUPABASE_SERVICE_ROLE_KEY` → `process.env.SB_SERVICE_ROLE_KEY`
   - Update the local variable names and the error-message string accordingly.

2. `src/integrations/supabase/auth-middleware.ts`
   - `process.env.SUPABASE_URL` → `process.env.SB_URL`
   - `process.env.SUPABASE_PUBLISHABLE_KEY` → `process.env.SB_PUBLISHABLE_KEY`
   - Update the local variable names and the error-message string accordingly.

3. `src/routes/api.public.scan.ts`
   - `process.env.SUPABASE_PUBLISHABLE_KEY` → `process.env.SB_PUBLISHABLE_KEY`

4. `src/integrations/supabase/client.ts` is intentionally left untouched, as requested.

Note: `client.server.ts` and `auth-middleware.ts` are auto-generated integration files. Editing them is necessary here because the external Supabase setup is not managed by Lovable Cloud, but be aware that re-running the Supabase integration generator may overwrite these files.

After the renames, the corresponding Build Secrets must be named `SB_URL`, `SB_SERVICE_ROLE_KEY`, and `SB_PUBLISHABLE_KEY` for the deployed app to work.