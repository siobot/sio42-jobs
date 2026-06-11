## Goal

Let each user opt into running the job scan periodically and get an in-app notification when a scan finds new jobs.

## What the user sees

**Settings → new "Scheduled scans" tab**
- Toggle: "Run scans automatically"
- Frequency dropdown: Hourly / Every 6 hours / Daily / Weekly
- Read-only line: "Last automatic scan: …"

**Top nav → bell icon**
- Badge with unread count
- Click opens a dropdown listing recent results: "12 new jobs found · 2h ago"; clicking jumps to `/jobs` filtered to new. "Mark all read" + per-item dismiss.

A toast also fires the moment a scan completes in the foreground with new results.

## What changes under the hood

1. **New table `scan_schedules`** (one row per user) — `enabled`, `frequency` (`hourly`/`6h`/`daily`/`weekly`), `last_run_at`, `next_run_at`. RLS scoped to `auth.uid()`.
2. **New table `notifications`** — `user_id`, `kind` (`scan_complete`), `title`, `body`, `data` (jsonb with `newCount`, `runId`), `read_at`, `created_at`. RLS scoped to `auth.uid()`.
3. **Cron job** changes from once-daily to **every 15 minutes**, hitting the existing `/api/public/scan` route.
4. **Scan route** (`api.public.scan.ts`) updates:
   - Selects users whose `scan_schedules.enabled=true` AND `next_run_at <= now()` (instead of all profiles).
   - After each user's scan, updates `last_run_at` + computes `next_run_at` from frequency.
   - If `newCount > 0`, inserts a `notifications` row.
5. **Server fns** in `src/lib/jobs/api.functions.ts`: `getSchedule`, `saveSchedule`, `listNotifications`, `markNotificationRead`, `markAllNotificationsRead`.
6. **`NotificationBell` component** in `src/components/` — polls `listNotifications` every 30s via TanStack Query while signed in, renders in `_app.tsx` header.
7. **Foreground toast** — the existing manual "Scan now" mutation already shows a toast; nothing new needed there. The bell handles background runs.

## Out of scope

- Email notifications (no email domain configured; user picked in-app only).
- Push/browser notifications.
- Per-user time-of-day or timezone (frequency only, per chosen scope).
