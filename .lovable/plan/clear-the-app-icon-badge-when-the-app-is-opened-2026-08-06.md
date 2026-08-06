# Clear the app icon badge when the app is opened

## Problem

The push notification sets a badge count on the home-screen icon, but nothing ever clears it. The badge used to be kept in sync by the notification bell component, and that was removed from the sidebar — so the count now only ever goes up.

## Fix

When you open (or return to) the app, treat the notifications as seen:

1. Clear the home-screen icon badge.
2. Mark unread notifications as read on the server, so a later push doesn't recompute a stale count and re-badge the icon.
3. Do the same when the app is re-focused or brought back from the background, not just on first load.
4. Clear the badge when a push notification itself is tapped, so the icon is clean even before the page finishes loading.

No new UI — this is silent behavior on app open.

## Technical details

- `src/components/app-shell.tsx`: on mount and on `visibilitychange` / `focus` (when visible), call `ensureServiceWorker()`, `updateAppBadge(0)`, and the existing `markAllNotificationsRead` server function. Guard so the server call only fires when there is a signed-in session, and debounce so rapid focus events don't spam it.
- Reuse `updateAppBadge` from `src/lib/push/register.ts` and `markAllNotificationsRead` from `src/lib/jobs/api.functions.ts` — both already exist; nothing new server-side.
- `public/sw.js`: in the `notificationclick` handler, call `self.navigator.clearAppBadge()` before focusing/opening the window.
- `src/components/notification-bell.tsx` stays unused/unreferenced; no changes there.

## Verification

Badge clearing only works in the installed (Add to Home Screen) app on a supported browser, not in the editor preview. After publishing: trigger a scan that finds jobs, confirm the badge appears, open the app, confirm the badge disappears and does not come back on the next scan unless new jobs are found.
