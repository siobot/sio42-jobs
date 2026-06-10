# Job Tracker & Monitor

A single-user web app that mirrors your Python tool's behavior: pull listings from ATS APIs and remote job boards, filter by keyword/location rules, track applied / interested / dismissed jobs, and maintain a manual checklist for companies without scannable career pages.

## Stack & infrastructure

- TanStack Start (React) frontend + server functions
- Lovable Cloud (Postgres + auth) — single-user login so your data is private and persistent
- Scheduled scans via pg_cron hitting an internal `/api/public/scan` endpoint (token-protected)
- Greenhouse / Ashby / Lever / Doist / Remotive / WeWorkRemotely / WorkingNomads fetched server-side (same endpoints as your Python code, no keys needed)
- Adzuna left in as an optional source; turned on only if you add `ADZUNA_APP_ID` / `ADZUNA_APP_KEY`

## Data model

- `sources` — Greenhouse/Ashby/Lever/etc. company entries (slug + display name + type)
- `manual_companies` — name, url, `last_checked_at` (powers the checklist + "checked X ago")
- `jobs` — every job ever seen (stable id, source, company, title, location, url, date, matched_keywords, first_seen_at, is_new)
- `job_status` — per-job state: `new` | `interested` | `applied` | `dismissed` | `archived`, plus notes and timestamps (replaces `applied.json`, `interested.json`, `dismissed.json`)
- `applications` — richer tracker rows for applied jobs: stage (applied / screen / interview / offer / rejected), next action, dates, notes
- `keyword_config` — JSON blob mirroring your `keywords`, `exclusions`, `non_english_markers`, `location_exclude`, `remote_only`, `remote_terms`
- `scan_runs` — timestamp, source counts, errors, new-job count

Your existing `applied.json`, `interested.json`, `dismissed.json`, `jobs_state.json`, and `config.json` get imported on first load via a one-time upload screen.

## Pages

1. **Dashboard** — counts (new since last visit, interested, applied this week), last scan time, "Run scan now" button, recent new matches.
2. **Jobs feed** — filterable table of matched jobs (by source, company, keyword group, status). Row actions: Mark Interested / Applied / Dismiss / Open. New jobs badged.
3. **Applications tracker** — kanban or table view of `applications` with stages, next action date, notes.
4. **Manual checklist** — companies from `manual_companies`. Clicking the company name opens its career URL in a new tab AND updates `last_checked_at`. Each row shows "Checked Xd Yh ago" (live-updating relative time). Sortable by oldest-checked.
5. **Sources & keywords** — manage Greenhouse/Ashby/Lever/manual lists; edit keyword groups, exclusions, location filters, remote-only toggle.
6. **Scan history** — list of `scan_runs` with per-source counts and errors.

## Monitor behavior

- **On-demand:** "Run scan now" calls a server function that fetches all configured sources in parallel, runs the filter pipeline (ported 1:1 from `filters.py` including the short-term word-boundary regex and exception logic), diffs against `jobs` by stable id, inserts new ones with status `new`, and writes a `scan_runs` row.
- **Scheduled:** pg_cron runs daily (configurable) and hits `/api/public/scan` with a shared secret header. Same pipeline. New matches surface as in-app notifications (bell icon + badge on Jobs feed).
- Errors per source don't fail the whole run; they're recorded in `scan_runs.errors` and shown on the Scan history page.

## Manual checklist "last checked" detail

- Stored as a UTC timestamp; rendered via a `useRelativeTime` hook that re-renders every 60s so "5 minutes ago" → "6 minutes ago" without a refresh.
- Click on company name = `window.open(url)` + server function to update timestamp (optimistic UI update).
- Optional "Mark checked" button if you want to update the timestamp without opening the page.

## Import path for your existing data

First-run screen offers: "Upload your existing JSON files." Drag in `config.json`, `applied.json`, `interested.json`, `dismissed.json`, `jobs_state.json` — they get parsed and seeded into the new tables. You can skip and start fresh too.

## Out of scope (call out)

- Email notifications (you chose in-app only)
- Multi-user accounts
- Scraping career pages that don't expose an API (that's exactly what the manual checklist is for)

## Build order

1. Enable Lovable Cloud, auth, schema + RLS, seed default config
2. Port `sources.py` fetchers + `filters.py` pipeline to server functions
3. Jobs feed + status actions
4. Manual checklist with relative-time timestamps
5. Applications tracker
6. Sources & keywords admin
7. Scheduled scan endpoint + pg_cron + scan history
8. JSON import screen

Want me to proceed, or adjust scope first (e.g. simpler tracker, skip kanban, defer scheduling)?