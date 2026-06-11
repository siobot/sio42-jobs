## Goal
Add a "Try the demo" button on the sign-in page that drops the visitor straight into the app with a pre-populated account — no signup, no password.

## Approach
Each visitor gets their own **ephemeral demo account** (random email + password), seeded with placeholder data. This keeps demos isolated so one visitor's clicks don't pollute another's view.

## Changes

### 1. Server function — `src/lib/demo.functions.ts` (new)
- `createDemoAccount` — no auth required.
  - Uses admin client (`supabaseAdmin`, imported inside the handler) to:
    - Generate `demo+<uuid>@demo.local` and a random password.
    - Create the auth user with `email_confirm: true` and `user_metadata: { is_demo: true }`.
    - Insert placeholder rows into `jobs` (a handful of varied statuses: new / interested / applied / dismissed), `applications` (a few across stages: applied / screen / interview / rejected), `sources` (default sources), and `keyword_config` (a sensible starter config).
  - Returns `{ email, password }`.

### 2. Auth page — `src/routes/auth.tsx`
- Add a "Try the demo" button below the form.
- On click: call `createDemoAccount`, then `supabase.auth.signInWithPassword` with the returned credentials, then navigate to `/`.

### 3. App shell — `src/components/app-shell.tsx`
- When the signed-in user has `user_metadata.is_demo === true`, show a small "Demo account" badge in the header with a "Sign out" affordance (the existing sign out already works; just label the state).

## Out of scope
- No cleanup cron for old demo accounts (can be added later).
- No schema changes — `is_demo` lives in auth `user_metadata`.
- No changes to seeding for real accounts (`seedDefaults` still runs as today).
- No changes to the Jobs / Applications / Dashboard pages.

## Placeholder data (rough shape)
- ~6 jobs across the four statuses, varied companies/titles/locations.
- ~4 applications across stages with notes + next actions.
- Default sources enabled.
- Starter keyword config (a few groups like "frontend", "remote", etc.).
