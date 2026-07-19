## Changes

**1. Sidebar cleanup** (`src/components/app-shell.tsx`)
- Remove the "Jobs feed" nav entry.
- Remove the `NotificationBell` from the mobile top header (and drop its import). Header stays for the hamburger button.

**2. Rename Checklist → Other Career Pages**
- `src/components/app-shell.tsx`: nav label "Checklist" → "Other Career Pages".
- `src/routes/_app.checklist.tsx`: update the page `<h1>` and `head()` title. Keep the route path `/checklist` to avoid breaking bookmarks/links.

**3. Dashboard: show Interested list** (`src/routes/_app.index.tsx`)
- Below the existing "Recently added" (new) section, add a second card "Interested" that queries jobs with `status = 'interested'`, ordered by most recently updated, using the same `JobActions` row layout so users can move them to Applied/Dismissed from there.
- Invalidate both queries on action.

**4. Scheduled scan time-of-day** (`src/routes/_app.settings.tsx` + backing schema/server fn)
- Add a "Time of day" field (HH:MM, user's local timezone) to the Scheduled Scans card, shown for `daily` / `weekly` cadences (hidden/ignored for hourly).
- Schema: add `run_at_local time` and `timezone text` columns to `scan_schedules` (migration). Update the server-side "is this schedule due?" logic in the cron path (`src/routes/api.public.scan.ts` / scan scheduler code) to only fire a daily/weekly schedule when the current time in the user's timezone matches the chosen hour/minute (within the 15-min cron tick window), rather than firing on any tick after `next_run_at`.
- Update the `upsertScanSchedule` server fn + form types to accept and persist the new fields.

**5. Route + nav references**
- Scan for any stale `<Link to="/jobs">` in Dashboard / Applications header buttons — keep the route file itself (`_app.jobs.tsx`) so existing deep links still work, just remove the sidebar entry and internal cross-links that duplicate the Dashboard.

## Out of scope
- Not deleting the `/jobs` route file (avoids breaking bookmarks). If you'd prefer a hard delete + redirect to `/`, say the word.
- Not removing push-notification wiring (`sw.js`, `push_subscriptions`); only the bell UI is hidden. Say if you want the whole push stack removed.
