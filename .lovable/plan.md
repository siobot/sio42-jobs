## What's actually in the app today

I checked the defaults against the `config.json` you uploaded — every entry is already wired up, identical to your Python project:

- **Greenhouse (6)**: GitLab, Customer.io, Aha!, Userflow, Remote.com, Calendly
- **Ashby (11)**: Linear, Buffer, Help Scout, Gorgias, Zapier, Close, Kit, Camunda, Loom, Ashby, Plain
- **Lever (4)**: AppFollow, Whereby, 15Five, Articulate
- **Manual checklist (13)**: Automattic, Doist, Basecamp, Tuple, Groove, ChartMogul, Chameleon, Perspective, Linear, SafetyWing, Xactly, Conveyor, Anomalo
- **Keyword groups, exclusions, non-English markers, remote terms, location excludes**: all copied verbatim from your config

These rows are inserted automatically the first time you sign in (the `seedDefaults` server function). You're only seeing empty lists right now because you're browsing the Preview unauthenticated, so seeding hasn't run for any account yet.

## What's missing from the UI

Your `sources.py` also has four aggregator/remote job boards that the scanner *does* call on every run but that are **not visible** in Sources & filters and can't be toggled:

- **Doist** (`doist.com/api/jobs`)
- **Remotive** (`remotive.com/api/remote-jobs`)
- **We Work Remotely** (RSS)
- **Working Nomads** (`workingnomads.com/api/exposed_jobs`)

(`Adzuna` from your config is paid + needs API keys, so I'll leave it off unless you want me to add a key-driven integration later.)

## Plan

1. **Extend the source type** — add a migration that expands the `source_type` enum to include `doist`, `remotive`, `weworkremotely`, `workingnomads`.
2. **Seed the four aggregators as default sources** — update `seedDefaults` so a fresh account gets them inserted alongside the ATS rows. They use `slug = ""` and the company name is the board name.
3. **Make scan.server.ts respect the toggle** — instead of hardcoding all four, look up enabled aggregator rows and only run those fetchers. Disabling Remotive in the UI will actually skip it.
4. **Update the Sources & filters UI**:
   - Group the list by source type (ATS vs Job boards) so it's easier to scan.
   - For aggregator types, hide the slug column and show "Aggregated board — no slug needed".
   - Restrict the "Add source" form to ATS types (Greenhouse / Ashby / Lever) since the aggregator boards are singletons.
   - Add a small **"Restore default sources"** button that re-runs `seedDefaults` for the signed-in user, so anyone who deleted rows can get them back without resetting the account.
5. **Sign-in note in the Preview** — once you sign in on your own URL the defaults will pour in; nothing more is needed on your end.

## Out of scope

- Adzuna (needs API key + paid quota).
- Adding more companies than what's in your `config.json` — happy to add a curated remote-CX-friendly list if you want; otherwise I'll keep it 1:1 with what you shared.
- Changing keyword/exclusion lists (already match exactly).

## Technical notes

- `source_type` enum change uses `ALTER TYPE ... ADD VALUE` per new label (Postgres requires one per statement, outside a transaction).
- `slug` is `NOT NULL`. The migration will allow empty string for aggregator rows; no schema change needed beyond the enum.
- `seedDefaults` already short-circuits when any sources exist, so the new "Restore defaults" button will call a separate server fn that inserts only the missing rows (matched by `(type, slug)`), leaving any user edits alone.
