## Plan: Create .env.local with external Supabase credentials

### Goal
Stop Lovable Cloud from silently reverting the project to the old Supabase credentials by moving the external project's values to `.env.local`, which Vite loads at higher precedence than `.env` and which Lovable Cloud does not manage.

### What will be created
**`.env.local`** (new file) with these values:
```
VITE_SUPABASE_URL=https://tidjygzrpsqyaznrlrhe.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ImT-V6uVIoOV1Kv3tZe6jg_4-dfTPQw
VITE_SUPABASE_PROJECT_ID=tidjygzrpsqyaznrlrhe
```

### Why this works
- `.env.local` is already ignored by the project's `.gitignore` (`*.local`), so it is not tracked in git.
- Vite loads `.env.local` after `.env` and overrides matching keys, so the client will always use the external Supabase project even if Cloud rewrites `.env`.
- Lovable Cloud only regenerates `.env`, not `.env.local`.

### What is intentionally left out of this file
- Server-side secrets (`SB_URL`, `SB_PUBLISHABLE_KEY`, `SB_SERVICE_ROLE_KEY`) will stay in **Workspace Settings → Build Secrets** for the deployed runtime, as previously discussed.
- `VAPID_PRIVATE_KEY` also stays in Build Secrets.

### Future protection
After this change, any Cloud-driven rewrite of `.env` is harmless because `.env.local` takes precedence. If the external credentials ever change, update `.env.local` — never rely on `.env` again.

### Note on full disconnection from Cloud
Lovable Cloud cannot be fully removed from this project once attached. The Connectors → Cloud → Disable toggle only affects future projects. `.env.local` is the supported workaround.