// Server-only scan orchestrator. Import only from .server.ts modules or inside handlers.
import { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAshby, fetchGreenhouse, fetchLever,
  fetchRemotive, fetchWeWorkRemotely, fetchWorkingNomads,
} from "./sources";
import { filterJobs } from "./filters";
import { DEFAULT_KEYWORD_CONFIG, type KeywordConfig, type RawJob } from "./types";

export type ScanResult = {
  runId: string;
  fetched: number;
  matched: number;
  newCount: number;
  sourceCounts: Record<string, number>;
  errors: Array<{ source: string; error: string }>;
};

export async function runScanForUser(
  supabase: SupabaseClient,
  userId: string,
  triggeredBy: "manual" | "cron" = "manual",
  // Demo accounts: delete any source that fails and leave it out of the
  // run's record, so a visitor never sees errors from boards they didn't
  // pick. Real accounts keep failures visible in Scan history.
  { pruneFailingSources = false }: { pruneFailingSources?: boolean } = {},
): Promise<ScanResult> {
  // Insert run row
  const { data: runRow, error: runErr } = await supabase
    .from("scan_runs")
    .insert({ user_id: userId, triggered_by: triggeredBy })
    .select("id")
    .single();
  if (runErr || !runRow) throw new Error(`scan_runs insert failed: ${runErr?.message}`);
  const runId = runRow.id as string;

  const errors: Array<{ source: string; error: string }> = [];
  const sourceCounts: Record<string, number> = {};
  const all: RawJob[] = [];

  // Load user config + sources in parallel
  const [{ data: cfgRow }, { data: sourceRows }] = await Promise.all([
    supabase.from("keyword_config").select("config").eq("user_id", userId).maybeSingle(),
    supabase.from("sources").select("id, type, slug, name, enabled").eq("user_id", userId).eq("enabled", true),
  ]);
  const config: KeywordConfig = (cfgRow?.config as KeywordConfig | undefined) ?? DEFAULT_KEYWORD_CONFIG;

  // Build fetcher tasks
  type Task = { label: string; sourceId: string; run: () => Promise<RawJob[]> };
  const tasks: Task[] = [];

  for (const s of sourceRows ?? []) {
    const label = `${s.type}/${s.name}`;
    const sourceId = s.id as string;
    if (s.type === "greenhouse") tasks.push({ label, sourceId, run: () => fetchGreenhouse(s.slug, s.name) });
    else if (s.type === "ashby") tasks.push({ label, sourceId, run: () => fetchAshby(s.slug, s.name) });
    else if (s.type === "lever") tasks.push({ label, sourceId, run: () => fetchLever(s.slug, s.name) });
    else if (s.type === "remotive") tasks.push({ label, sourceId, run: () => fetchRemotive() });
    else if (s.type === "weworkremotely") tasks.push({ label, sourceId, run: () => fetchWeWorkRemotely() });
    else if (s.type === "workingnomads") tasks.push({ label, sourceId, run: () => fetchWorkingNomads() });
  }

  const failedSourceIds: string[] = [];
  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  settled.forEach((res, i) => {
    const { label, sourceId } = tasks[i];
    if (res.status === "fulfilled") {
      sourceCounts[label] = res.value.length;
      all.push(...res.value);
    } else if (pruneFailingSources) {
      failedSourceIds.push(sourceId);
    } else {
      const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      errors.push({ source: label, error: msg });
      sourceCounts[label] = 0;
    }
  });
  if (failedSourceIds.length > 0) {
    await supabase.from("sources").delete().eq("user_id", userId).in("id", failedSourceIds);
  }

  const matchedRaw = filterJobs(all, config);
  // Dedupe by external_id (same posting can appear from multiple sources)
  const dedupeIds = new Set<string>();
  const matched = matchedRaw.filter((j) => {
    if (dedupeIds.has(j.external_id)) return false;
    dedupeIds.add(j.external_id);
    return true;
  });
  const now = new Date().toISOString();

  // Diff against existing rows
  let newCount = 0;
  if (matched.length > 0) {
    const externalIds = matched.map((j) => j.external_id);
    // Pull existing IDs (in chunks to avoid huge IN lists)
    const existing = new Set<string>();
    const chunkSize = 500;
    for (let i = 0; i < externalIds.length; i += chunkSize) {
      const chunk = externalIds.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("jobs")
        .select("external_id")
        .eq("user_id", userId)
        .in("external_id", chunk);
      for (const r of data ?? []) existing.add(r.external_id as string);
    }

    const newRows = matched
      .filter((j) => !existing.has(j.external_id))
      .map((j) => ({
        user_id: userId,
        external_id: j.external_id,
        source: j.source,
        company: j.company,
        title: j.title,
        location: j.location,
        url: j.url,
        job_date: j.job_date,
        matched_keywords: j.matched_keywords,
        matched_groups: j.matched_groups,
        first_seen_at: now,
        last_seen_at: now,
        status: "new" as const,
      }));
    newCount = newRows.length;

    if (newRows.length > 0) {
      for (let i = 0; i < newRows.length; i += chunkSize) {
        const chunk = newRows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("jobs")
          .upsert(chunk, { onConflict: "user_id,external_id", ignoreDuplicates: true });
        if (error && !pruneFailingSources) errors.push({ source: "db_insert", error: error.message });
      }
    }

    // Touch last_seen_at on existing rows (bulk update via in())
    const seenIds = matched.filter((j) => existing.has(j.external_id)).map((j) => j.external_id);
    for (let i = 0; i < seenIds.length; i += chunkSize) {
      const chunk = seenIds.slice(i, i + chunkSize);
      await supabase.from("jobs").update({ last_seen_at: now })
        .eq("user_id", userId).in("external_id", chunk);
    }
  }

  await supabase.from("scan_runs").update({
    finished_at: now,
    source_counts: sourceCounts,
    errors,
    fetched_count: all.length,
    matched_count: matched.length,
    new_count: newCount,
  }).eq("id", runId);

  return { runId, fetched: all.length, matched: matched.length, newCount, sourceCounts, errors };
}
