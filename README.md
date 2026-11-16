# Job Search Helper

Job Search Helper collects job postings from company career pages and remote-job boards. It filters them against your keywords and locations and shows the matches in one feed. You can also track the jobs you apply to.

## What it does

### Scanning
- **Company job boards (ATS):** checks the job boards of the companies you add. Supported systems: Greenhouse, Ashby, Lever, Workable, Recruitee, Personio, BambooHR, Breezy, Pinpoint, SmartRecruiters, Teamtailor and Workday.
- **Remote-job boards:** Remotive, We Work Remotely and Working Nomads.
- **Adding a company:** paste the company's careers-page link. The app detects which job board it uses. Companies on unsupported systems go to **Other Career Pages** to check by hand.
- **Running scans:** press **Run scan now**, or set a schedule.

### Filtering (Settings → Keyword filters)
- **Keyword groups:** a job matches if its title contains any keyword.
- **Exclusions:** title terms that hide a job, with exceptions that allow it anyway.
- **Location excludes and search locations:** limit jobs by place.
- **Remote-only option.**
- **Non-English markers:** hide postings in other languages.
- **Excluded companies:** skipped by scans and Discover.

### Jobs Feed
- **New jobs:** marked **Interested**, **Applied** or **Not Interested**, or the company removed from your search.
- **Interested jobs:** pinned at the top, with notes.
- **Applied jobs:** move to the **Applications** tracker.

### Discover
- **What it finds:** new companies hiring for your keywords on Greenhouse, Ashby and Lever. It uses the [Fantastic Jobs](https://fantastic.jobs) API.
- **When it runs:** only when you press **Discover new**, because the free API plan has a fixed number of calls and jobs.
- **Quota per run:** at most 100 jobs. Each run continues where the previous one stopped, so no job is fetched twice.
- **Settings → Company discovery:** the lookback window (24 hours, 36 hours, 48 hours or 7 days) and a **Diagnose** button. Diagnose counts matching jobs for each filter without using job quota.
- **Results:** shown in a banner, along with the remaining Fantastic Jobs quota. **Track** adds a found company to your sources.

### Other pages
- **Applications:** the jobs you have applied to.
- **Other Career Pages:** companies on unsupported systems. Opening a careers page records when you last checked it.
- **Scan history:** past scans, with counts and errors per source. Also lists the 10 jobs most recently marked Not Interested, so you can restore one.
- **Push notifications:** alerts for new matches and failed sources (Settings).

## How it runs

- **Web app:** [TanStack Start](https://tanstack.com/start) (React), deployed to Netlify from the `main` branch.
- **Database and sign-in:** Supabase.
- **Discover:** runs as the Supabase Edge Function `supabase/functions/discover-companies`. It is deployed separately from the web app:
  ```
  supabase functions deploy discover-companies --remote=<project-ref>
  ```
  It needs the secret `FANTASTIC_JOBS_API_KEY`.
- **Database changes:** live in `supabase/migrations/` and are applied manually.

## Local development

```
npm install
npm run dev
```
