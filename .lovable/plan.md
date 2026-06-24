## Goal

Improve the Applications page: better add-form, prominent company names, full-width notes, status-change timeline, and search.

## Changes

### 1. Add-application form → 3 rows + LinkedIn Easy Apply
Restructure the form in `src/routes/_app.applications.tsx`:
- Row 1: Company
- Row 2: Role
- Row 3: URL
- Plus a "LinkedIn Easy Apply" checkbox + the Log button on a final row.

Submit sends `linkedin_easy_apply: boolean` to `addManualApplication`.

### 2. Application card layout
- Company name becomes the visual lead: large, bold (e.g. `text-lg font-semibold`); role title shown as secondary text underneath. URL link moves to the role/title.
- Remove the "Next action" input entirely.
- Notes textarea expands to full width below the header.
- Show an "Easy Apply" badge when the flag is set.

### 3. Status-change timestamps
Add a new table `public.application_events` to record every stage change:

```
id uuid pk
application_id uuid fk → applications(id) on delete cascade
user_id uuid (for RLS)
stage app_stage
changed_at timestamptz default now()
```

With the standard GRANT block + RLS policy (`auth.uid() = user_id`).

A DB trigger on `applications`:
- AFTER INSERT → insert initial event (stage = new.stage, changed_at = new.applied_at)
- AFTER UPDATE OF stage (when stage changed) → insert new event

Backfill: one event per existing application using its current stage and `applied_at`.

In the card, render a compact timeline ("applied → screen → interview" with relative timestamps) fetched per application or eagerly via a single query keyed by user.

### 4. Search box
Top of the page, above the preset/date filter row: an `Input` with placeholder "Search company or role…". Search state stored as `q` in URL search params (validated via existing zod schema). Filters the list client-side via case-insensitive match on `company` or `title`. Counts/stats continue to reflect date+stage filters (search only narrows the list, not the stat cards — keeps stats stable while searching).

### Server-fn updates (`src/lib/jobs/api.functions.ts`)
- `addManualApplication` accepts optional `linkedin_easy_apply: boolean`.
- (No change needed to `updateApplication` — trigger handles event logging.)

### Schema additions to `applications`
- `linkedin_easy_apply boolean not null default false`

## Technical notes
- Search param schema gains `q: z.string().optional()`.
- Timeline query: `application_events` selected with `application_id in (...)` for visible apps; grouped client-side.
- Invalidate `["applications"]` and `["application-events"]` together after mutations.

## Out of scope
- Editing/deleting individual timeline events.
- Server-side full-text search (client filter is sufficient at current volume).
