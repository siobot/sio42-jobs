## What the "Mark checked" button does today

It calls the same action as clicking the company name: stamps `last_checked_at = now()` on that row in the `manual_companies` table. The list is currently sorted by `last_checked_at` ascending (oldest/never-checked first), which is why a row jumps to the bottom right after you check it.

## Changes

1. **Stable order** — Sort the checklist by company name (A→Z) instead of by `last_checked_at`. Checking a row no longer moves it.

2. **Freshness color indicator** — Add a small colored dot + tinted "Checked …" label next to each row, based on how long ago it was checked:
   - Never checked → neutral gray
   - ≤ 7 days → green
   - 8–30 days → orange
   - > 30 days → red

   Colors use existing semantic tokens (no hardcoded hex). The dot sits to the left of the company name so the status is scannable down the list.

3. **"Mark checked" button** stays — it's useful when you've already checked a company in another tab and just want to update the timestamp without re-opening the link. No behavior change beyond the new color refresh.

## Technical notes

- File: `src/routes/_app.checklist.tsx` only. No schema or server-function changes.
- Replace the `.order("last_checked_at", …)` clause with `.order("name", { ascending: true })`.
- Add a small `freshness(lastCheckedAt)` helper returning `{ tone: 'never'|'fresh'|'stale'|'old', label }` and map tones to Tailwind classes built from theme tokens (e.g. `bg-emerald-500`, `bg-amber-500`, `bg-red-500` dots; matching `text-*` for the label). If you'd prefer these mapped through the design-system tokens instead of Tailwind palette classes, say so and I'll wire them through `index.css`.
