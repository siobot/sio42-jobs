## Goal
Filter the Applications page by date so you can see how many you applied to in a given week/month. Quick presets plus a custom date range. Both stat cards and the list reflect the selected range.

## UX

Add a date-filter row above the stat grid on `/applications`:

- Preset chips: **All time**, **This week**, **Last week**, **This month**, **Last month**, **Custom…**
- Picking **Custom…** opens a popover with two calendar inputs (from / to) using the shadcn Calendar in a Popover.
- Selected range is shown next to the chips (e.g. "Jun 1 – Jun 12") with a small "Clear" button when not "All time".
- Calendar periods: weeks are Monday→Sunday, months are 1st→last day, all in the user's local timezone.

The stat cards (Total / Applied / Screen / Interview / Offer / Rejected / Withdrawn) recompute against the filtered set so e.g. "Total" shows applications in that period. The list below is filtered identically (still further narrowed by the clicked stage chip).

## Implementation

All frontend, no schema or server-function changes.

**`src/routes/_app.applications.tsx`**
- Extend `validateSearch` with:
  - `range`: `"all" | "this_week" | "last_week" | "this_month" | "last_month" | "custom"` (default `"all"`)
  - `from`, `to`: optional ISO date strings (`YYYY-MM-DD`), only meaningful when `range === "custom"`
- Compute `[fromDate, toDate]` from `range` (or `from`/`to` for custom). Helper lives inline; Monday-start week via `getDay()` math, month via `new Date(y, m, 1)` / `new Date(y, m+1, 0)`.
- Apply the date window to `apps.data` once → `inRange`. Derive both `counts`/`total` and `filtered` from `inRange` (stage filter applied after).
- Render a filter bar:
  - Preset buttons that call `navigate({ search: prev => ({ ...prev, range: key, from: undefined, to: undefined }) })`.
  - "Custom…" button opens a `Popover` containing a shadcn `Calendar` in `mode="range"`; on select, navigate with `range: "custom"`, `from`, `to` (ISO date strings).
  - Active preset is visually highlighted; a "Clear" button resets to `range: "all"`.
- Empty-state copy updates to mention the active range when filtered to zero.

No other files change. The existing `Unauthorized` runtime noise on `/` is unrelated to this request and out of scope here.