## 1. Dashboard — Recently added hides triaged jobs

In `src/routes/_app.index.tsx`:
- Filter the `dashboard-recent` query to `status = 'new'` so a job disappears from "Recently added" the moment it's marked Interested, Applied, Dismissed, or Archived.
- Also invalidate `["dashboard-recent"]` and `["dashboard-stats"]` from `JobActions` so the row vanishes immediately after tapping (today it already invalidates `["jobs"]` — extend to include the dashboard keys).

## 2. Jobs feed — Applied tab navigates to Applications

In `src/routes/_app.jobs.tsx`:
- Remove "Applied" from the in-page filter tabs and render it as a `<Link to="/applications">` styled like the other tabs, so tapping it goes to the Applications page instead of filtering the jobs feed.
- Leave New / Interested / Dismissed / Archived / All as filter tabs.

## 3. Applications page — stage tabs + stats

In `src/routes/_app.applications.tsx`:
- Add a stats strip at the top: small cards for Total, Applied, Screen, Interview, Offer, Rejected, Withdrawn (counts derived from the existing `applications` query, no new server work).
- Add tabs: All, Applied, Screen, Interview, Offer, Rejected, Withdrawn. Tab state lives in the URL via `validateSearch` (`stage` param) so it survives reload and is linkable.
- Filter the rendered application list by the selected stage; "All" shows everything. The existing per-row stage `<Select>` still works for moving items between stages.

## Out of scope

- No schema changes, no new server functions, no changes to scanning or `JobActions` behavior beyond the extra invalidation keys.
