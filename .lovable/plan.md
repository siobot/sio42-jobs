## Plan: Add Attio, Duvo, and Wundergraph to automatic scan

All three companies host their job boards on Ashby (confirmed via `https://api.ashbyhq.com/posting-api/job-board/{attio|duvo|wundergraph}` returning 200), so they can go straight into the automated scanner — no manual checklist needed.

### Change

**`src/lib/jobs/types.ts`** — append three entries to `DEFAULT_ASHBY`:

```ts
{ slug: "attio", name: "Attio" },
{ slug: "duvo", name: "Duvo" },
{ slug: "wundergraph", name: "WunderGraph" },
```

That's the only edit. The existing `fetchAshby` source in `src/lib/jobs/sources.ts` and the cron scan pipeline pick them up automatically on the next run.