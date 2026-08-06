# Store the secrets here instead of Build Secrets

Good news: your workspace has no Build Secrets screen, but the project already has runtime secrets configured, and I can manage those directly. They are available to server-side code at runtime, which is exactly what the scheduled scan needs.

Already present: `SB_URL`, `SB_SERVICE_ROLE_KEY`, `SB_PUBLISHABLE_KEY`, `VAPID_PRIVATE_KEY`.
Missing: `SCAN_CRON_SECRET`.

## Steps

1. **Add `SCAN_CRON_SECRET`** with the value already baked into `db/2026-08-06-cron-scan.sql`:
   `23e5a1b74db9b14c5e57aa71b2cd5c2581383effce820a08`
   I set this directly — no form for you to fill in.
2. **Confirm `SB_SERVICE_ROLE_KEY` holds your new `sb_secret_...` key.** It was saved before you switched to the new key format, so if you're unsure I'll open a secure form for you to paste the current value from Supabase → Project Settings → API Keys. Same for `SB_URL` if needed (`https://tidjygzrpsqyaznrlrhe.supabase.co`).
3. **Publish** so the deployed worker picks up the code change and the secret.
4. **Run `db/2026-08-06-cron-scan.sql`** in your Supabase SQL editor — it adds the pending `run_at_local` / `timezone` columns and creates the 15-minute `job-monitor-scan` pg_cron job.
5. **Verify** — I POST to `https://sio42-jobs.lovable.app/api/public/scan` with the cron secret header and confirm a 200 plus a fresh row on the Scan history page.

## Technical note

The scan endpoint reads `process.env.SCAN_CRON_SECRET`, and the server Supabase client reads `SB_URL` / `SB_SERVICE_ROLE_KEY`. Runtime secrets are injected under those exact names, so no code change is needed beyond the `apikey`-header fix already shipped for the `sb_secret_...` key format.
