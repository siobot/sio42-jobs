# Dark Jewel-Tone Theme

Re-skin the job tracker with a dark base and vibrant jewel-tone accents. Purely visual — no logic or data changes.

## Palette (design tokens in `src/styles.css`)

- **Background**: near-black with a deep indigo undertone (`oklch(0.16 0.03 270)`)
- **Surface / cards**: raised panel (`oklch(0.21 0.035 270)`) with subtle border (`oklch(0.30 0.04 270)`)
- **Foreground**: soft ivory (`oklch(0.96 0.01 90)`); muted text (`oklch(0.72 0.02 270)`)
- **Jewel accents** (used across status chips, charts, source badges, buttons):
  - Emerald `oklch(0.72 0.17 155)` — applied / success
  - Sapphire `oklch(0.65 0.19 250)` — primary actions / links
  - Amethyst `oklch(0.66 0.21 305)` — interested
  - Ruby `oklch(0.66 0.22 20)` — rejected / destructive
  - Topaz `oklch(0.80 0.17 80)` — interview / warning
  - Aquamarine `oklch(0.78 0.13 195)` — info / new
- **Gradients & glow**: `--gradient-primary` (sapphire → amethyst), `--gradient-jewel` (emerald → aquamarine → sapphire) for headers and the dashboard hero, plus a `--shadow-glow` using the primary token.

## Where it shows up

1. **Global tokens** — update `:root` and `.dark` blocks in `src/styles.css`; map shadcn tokens (`--background`, `--card`, `--primary`, `--accent`, `--destructive`, `--border`, `--ring`, sidebar tokens, chart tokens) to the palette above. Force dark by default on `<html>`.
2. **App shell** (`src/components/app-shell.tsx`) — dark sidebar/topbar, jewel-gradient logo mark, active-nav item uses sapphire fill with glow.
3. **Dashboard** (`_app.index.tsx`) — stat cards each get a different jewel accent border + soft glow; "Run scan" button uses the primary gradient.
4. **Jobs feed** (`_app.jobs.tsx`) — status chips and source badges use the jewel set; row hover uses a faint sapphire wash.
5. **Applications** (`_app.applications.tsx`) — stage pills colored by jewel (applied=sapphire, screen=aquamarine, interview=topaz, offer=emerald, rejected=ruby).
6. **Checklist** (`_app.checklist.tsx`) — relative-time pill shifts emerald → topaz → ruby as it ages; company row hover glow.
7. **Settings & History** — themed inputs, code/JSON editor background tuned for dark, scan-run rows colored by outcome.
8. **Auth page** (`auth.tsx`) — full-bleed dark background with a jewel gradient orb behind the card.

## Out of scope

- No light-mode variant (dark only, per request).
- No layout, copy, or data-model changes.
- No new dependencies.

## Technical notes

- All colors stay as semantic tokens; components keep using `bg-card`, `text-primary`, `border-border`, etc. No hardcoded hex in JSX.
- Status/jewel colors exposed as `--color-emerald`, `--color-sapphire`, etc. under `@theme inline` so utilities like `bg-sapphire` / `text-ruby` work.
- Chart tokens (`--chart-1..5`) remapped to the jewel set so any future charts inherit the palette.
