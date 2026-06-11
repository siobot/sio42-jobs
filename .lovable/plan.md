## Goal

Make Dismiss / Interested / Applied easy to act on from both the Dashboard and the Jobs feed, using plain text buttons (no icons).

## Changes

### 1. Reusable `JobActions` component
Create `src/components/job-actions.tsx`:
- Props: `jobId`, `status`, optional `compact` flag, optional `onChange` callback.
- Renders three text buttons in a row: **Interested**, **Applied**, **Dismiss**.
- A small overflow link/button **Archive** (less common, kept out of the way).
- Highlights the current status (e.g. the matching button uses `variant="default"`, others `variant="outline"`); clicking the active one again reverts the job to **New**.
- Internally uses `useServerFn(setJobStatus)` + `useMutation` and invalidates `["jobs"]` and `["dashboard-stats"]` query keys, with a toast on success/error — same behaviour as today.

### 2. Jobs feed (`src/routes/_app.jobs.tsx`)
- Replace the four icon-only buttons in each row with `<JobActions />`.
- Keep the filter tabs (New / Interested / Applied / Dismissed / Archived / All) exactly as they are — that's how the user reviews each bucket.
- On mobile, the action row wraps under the title/meta so taps are large and labels stay readable.

### 3. Dashboard (`src/routes/_app.index.tsx`)
- In "Recently added", show the same `<JobActions />` next to each row so the user can triage the latest matches without leaving the page.
- Keep the existing status badge so the current state is visible at a glance.
- Mobile: stack the actions below the title/meta in the same way as the Jobs feed.

### 4. No new server work
`setJobStatus` already updates the job and (for `applied`) inserts an `applications` row, so the Application tracker continues to receive jobs marked Applied. No DB or server-function changes needed. Filtering by status on `/jobs` already provides the "see the postings I've put into these states" view the user asked for.

## Out of scope

- No new tables, migrations, or server functions.
- No changes to the Applications tracker UI.
- Keyword/source/scan logic untouched.