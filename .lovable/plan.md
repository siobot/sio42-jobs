# Use the new-format `sb_secret_...` key for the server client

## Where the key lives

Supabase dashboard → project `tidjygzrpsqyaznrlrhe` → Project Settings → API Keys. The **secret key** (`sb_secret_...`) is the service-role equivalent in the new key format. Reveal and copy it — that's the value for the `SB_SERVICE_ROLE_KEY` build secret.

(There is also a "Legacy API keys" tab with the old `service_role` JWT starting `eyJ...`. Either works, but the new secret key is fine once the code change below is in.)

## Why a code change is needed

New-format keys (`sb_publishable_...`, `sb_secret_...`) are opaque strings, not JWTs. The Supabase JS client sends them as `Authorization: Bearer <key>`, and the database API rejects that with `Expected 3 parts in JWT; got 1`. The fix is to send the key only in the `apikey` header.

This affects two places that build server-side clients:
- `src/integrations/supabase/client.server.ts` (service-role/admin client)
- `src/integrations/supabase/auth-middleware.ts` (publishable key; already receives a real user JWT in `Authorization`, so only the `apikey` header needs to be set explicitly)

## Changes

1. **`src/integrations/supabase/client.server.ts`** — add a `global.fetch` wrapper: if the key starts with `sb_`, strip an `Authorization: Bearer <key>` header and always set `apikey: <key>`. No other behaviour changes; legacy JWT keys keep working unchanged.
2. **`src/integrations/supabase/auth-middleware.ts`** — same wrapper, but preserve the incoming user bearer token and only add/overwrite the `apikey` header with the publishable key.

## Your steps

1. Copy the `sb_secret_...` key from Project Settings → API Keys.
2. Workspace settings → Git → Build Secrets, add/confirm:
   - `SB_URL` = `https://tidjygzrpsqyaznrlrhe.supabase.co`
   - `SB_SERVICE_ROLE_KEY` = the `sb_secret_...` key
   - `SCAN_CRON_SECRET` = `23e5a1b74db9b14c5e57aa71b2cd5c2581383effce820a08`
3. Publish.
4. Run `db/2026-08-06-cron-scan.sql` in the Supabase SQL editor (adds the pending schedule columns and the 15-minute cron job).

Then I'll POST to `/api/public/scan` with the cron secret and confirm a 200 plus a fresh Scan history row.
