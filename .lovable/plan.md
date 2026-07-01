## Problem

Scan history shows `db_insert: duplicate key value violates unique constraint "jobs_user_id_external_id_key"` on recent runs. When that error hits, the whole insert chunk is aborted by Postgres, so the "N new" counter is reported but zero rows actually reach the `jobs` table — which is why the feed stays empty even though scans report new matches.

Two root causes in `src/lib/jobs/scan.server.ts`:

1. **Intra-batch duplicates.** `matched` can contain the same `external_id` more than once (same posting surfaced by multiple aggregator sources, or listed twice by one source). The existing-ID lookup filters against the DB but not against the batch itself, so two "new" rows with the same `external_id` go into one `insert()` and Postgres rejects the whole chunk.
2. **No conflict handling on insert.** Any single duplicate (from a race with a prior run, or the case above) aborts the entire 500-row chunk instead of skipping just that row.

## Fix

Edit `src/lib/jobs/scan.server.ts` only:

- Before diffing against existing IDs, dedupe `matched` by `external_id` (keep first occurrence). Use the deduped list for both the "existing" lookup and `newCount`.
- Replace the chunked `supabase.from("jobs").insert(chunk)` with `.upsert(chunk, { onConflict: "user_id,external_id", ignoreDuplicates: true })` so any straggler duplicate is silently skipped instead of failing the batch.
- Keep `newCount` as the count of rows we attempted to insert as new (post-dedupe, pre-existing filter), matching current UX.

## Out of scope

- The `greenhouse/Userflow: 404 Not Found` source error — unrelated to jobs missing from the feed; that source is just returning 404 and contributes 0 rows.
- Any schema changes; the unique constraint stays as-is.
