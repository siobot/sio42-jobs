# Add 22 new companies to automatic scanning

I probed every company's public job board API. 15 of them are on an ATS the scanner already supports, so they can be scanned automatically. 6 have no public job feed and belong on the Other Career Pages checklist instead.

## Automatic ATS sources (15)

Greenhouse: Postman, PlanetScale, Typeform, Bitwarden, Klaviyo, Braze, Datadog, PagerDuty

Ashby: Pleo, Iterable, Float, 1Password, ClickUp, Snyk, Spendesk

Lever: ActiveCampaign

Notes from the probe:
- Snyk and Spendesk have valid Ashby boards that currently return zero postings — they'll start appearing as soon as they post again.
- Iterable runs both Greenhouse and Ashby; the Ashby board is the live one (it has a current Lisbon listing), so I'll use Ashby only to avoid duplicates.

## Other Career Pages instead (6)

No public API or feed available, so these go on the manual checklist with their careers URLs:
- Fly.io — https://fly.io/jobs/
- Neon — https://job-boards.greenhouse.io/neondatabase (board returns 404; Neon's board looks retired)
- beehiiv — https://www.beehiiv.com/careers
- Harvest — https://www.getharvest.com/careers
- Toggl — https://toggl.com/jobs/
- Rippling — https://www.rippling.com/careers

## Technical details

- Add the new entries to `DEFAULT_GREENHOUSE`, `DEFAULT_ASHBY`, and `DEFAULT_LEVER` in `src/lib/jobs/types.ts` using the verified slugs (e.g. `postman`, `planetscale`, `typeform`, `bitwarden`, `klaviyo`, `braze`, `datadog`, `pagerduty`; `pleo`, `iterable`, `float`, `1password`, `clickup`, `snyk`, `spendesk`; `activecampaign`).
- Add the 6 manual companies to `DEFAULT_MANUAL` in the same file.
- Because your account already has saved sources, the new defaults won't appear until you either use "Restore default sources" in Settings or I insert the new rows into your `job_sources` / `manual_companies` tables. I'll do the insert so nothing you've customised gets wiped.
- No changes needed to the scanner or filters — existing keyword and location filters apply as-is.
