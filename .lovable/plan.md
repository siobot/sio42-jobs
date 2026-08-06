# Fix: scheduled scans never run

## What I verified

- Calling the live scheduled-scan endpoint (`POST https://sio42-jobs.lovable.app/api/public/scan`) with the publishable key returns **401 Unauthorized**. So even a correctly configured scheduler would be rejected today.
- The endpoint authorizes by comparing the incoming `apikey` header to `process.env.SUPABASE_PUBLISHABLE_KEY`. That name is not set in the deployed app's build secrets (you reported earlier that Build Secrets rejects the `SUPABASE_` prefix), so the check fails for every request.
- `src/integrations/supabase/client.server.ts` reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — same prefix problem, so the scan would also fail to reach the database even if auth passed.
- No scheduler definition exists in the repo. The old 15-minute job lived in the previous Lovable Cloud database, so after the move to your own Supabase project there is very likely no job calling the endpoint at all. (I can't query your project's job list with only the publishable key — step 3 confirms it.)
- The `run_at_local` / `timezone` columns from `db/2026-07-19-scan-schedule-time-of-day.sql` may still be unapplied; the cron path reads them.

Net: three independent breakages. All three need fixing for automatic scans to run.

## Plan

**1. Use a dedicated, build-secret-safe cron token**
- `src/routes/api.public.scan.ts`: authorize on `process.env.SCAN_CRON_SECRET` (accept it via an `x-cron-secret` header, keeping the existing `apikey` comparison as a fallback so nothing breaks mid-migration). Return a clearer 401 body distinguishing "secret not configured" from "wrong secret".
- I'll generate the secret value and store it, then give you the exact header/value to paste into the scheduler.

**2. Make server credentials readable in the deployed worker**
- `client.server.ts`: read `SB_URL` / `SB_SERVICE_ROLE_KEY` first, falling back to `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and `VITE_SUPABASE_URL` for the URL. You then add `SB_URL` and `SB_SERVICE_ROLE_KEY` in Workspace settings → Build Secrets (values: your project URL and service role key).
- Same fallback added for the publishable key in `auth-middleware.ts` for consistency.

**3. Recreate the schedule trigger on your Supabase project**
- Ship a SQL file (`db/…-cron-scan.sql`) you run in the Supabase SQL editor that enables `pg_cron`, and schedules a job every 15 minutes doing an HTTP POST via `pg_net` to `https://sio42-jobs.lovable.app/api/public/scan` with the `x-cron-secret` header.
- It also includes `select * from cron.job;` so you can confirm whether a job already existed.

**4. Apply the pending schedule columns**
- Fold `run_at_local` / `timezone` from `db/2026-07-19-scan-schedule-time-of-day.sql` into the same SQL file so one paste covers everything.

**5. Verify end to end**
- After publish + secrets + SQL, I call the endpoint with the new secret and confirm a 200 plus a fresh row on the Scan history page.

## Notes

- Steps that require you: adding the two build secrets, running the SQL, and publishing. Everything else is code I change.
- The manual "Run scan now" button keeps working throughout — it uses your logged-in session, not these secrets.
