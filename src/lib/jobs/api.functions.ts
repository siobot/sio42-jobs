import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_ASHBY, DEFAULT_GREENHOUSE, DEFAULT_KEYWORD_CONFIG, DEFAULT_LEVER, DEFAULT_MANUAL,
  type KeywordConfig,
} from "./types";
import { parseAtsFromUrl, fetchPageTitle, cleanCompanyNameFromTitle } from "./detect";
import { fetchGreenhouse, fetchAshby, fetchLever } from "./sources";

// Manual scan
export const runScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runScanForUser } = await import("./scan.server");
    const isDemo = Boolean((context.claims.user_metadata as { is_demo?: boolean } | undefined)?.is_demo);
    return runScanForUser(context.supabase, context.userId, "manual", { pruneFailingSources: isDemo });
  });

// Default aggregator boards (no slug; one row per board)
const DEFAULT_AGGREGATORS = [
  { type: "remotive" as const, name: "Remotive" },
  { type: "weworkremotely" as const, name: "We Work Remotely" },
  { type: "workingnomads" as const, name: "Working Nomads" },
];

function buildDefaultSourceRows(userId: string) {
  return [
    ...DEFAULT_GREENHOUSE.map((c) => ({ user_id: userId, type: "greenhouse" as const, slug: c.slug, name: c.name })),
    ...DEFAULT_ASHBY.map((c) => ({ user_id: userId, type: "ashby" as const, slug: c.slug, name: c.name })),
    ...DEFAULT_LEVER.map((c) => ({ user_id: userId, type: "lever" as const, slug: c.slug, name: c.name })),
    ...DEFAULT_AGGREGATORS.map((a) => ({ user_id: userId, type: a.type, slug: "", name: a.name })),
  ];
}

// Seed defaults for a fresh account (no-op when sources already exist)
export const seedDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase.from("sources").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) > 0) return { seeded: false };

    await supabase.from("sources").insert(buildDefaultSourceRows(userId));
    await supabase.from("manual_companies").insert(
      DEFAULT_MANUAL.map((m) => ({ user_id: userId, name: m.name, url: m.url })),
    );
    await supabase.from("keyword_config").upsert({ user_id: userId, config: DEFAULT_KEYWORD_CONFIG });
    return { seeded: true };
  });

// Restore any default sources/manual companies that are missing without
// touching user-added or user-edited rows.
export const restoreDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("sources")
      .select("type, slug")
      .eq("user_id", userId);
    const have = new Set((existing ?? []).map((r) => `${r.type}::${r.slug}`));
    const missing = buildDefaultSourceRows(userId).filter(
      (r) => !have.has(`${r.type}::${r.slug}`),
    );
    if (missing.length) await supabase.from("sources").insert(missing);

    const { data: manualExisting } = await supabase
      .from("manual_companies")
      .select("name")
      .eq("user_id", userId);
    const haveNames = new Set((manualExisting ?? []).map((r) => r.name.toLowerCase()));
    const missingManual = DEFAULT_MANUAL
      .filter((m) => !haveNames.has(m.name.toLowerCase()))
      .map((m) => ({ user_id: userId, name: m.name, url: m.url }));
    if (missingManual.length) await supabase.from("manual_companies").insert(missingManual);

    return { addedSources: missing.length, addedManual: missingManual.length };
  });

// Touch a manual company's last_checked_at
export const markCompanyChecked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("manual_companies")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Update job status (interested / applied / dismissed / archived / new)
export const setJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["new", "interested", "applied", "dismissed", "archived"]),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("jobs")
      .update({ status: data.status, status_updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    // If applied, ensure an application row exists
    if (data.status === "applied") {
      const { data: job } = await context.supabase
        .from("jobs").select("id, company, title, url").eq("id", data.id).maybeSingle();
      if (job) {
        const { data: existing } = await context.supabase
          .from("applications").select("id").eq("job_id", job.id).maybeSingle();
        if (!existing) {
          await context.supabase.from("applications").insert({
            user_id: context.userId, job_id: job.id, company: job.company, title: job.title,
            url: job.url, stage: "applied",
          });
        }
      }
    }
    return { ok: true };
  });

// Manual companies
export const addManualCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: z.string().min(1).max(200), url: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("manual_companies")
      .insert({ user_id: context.userId, name: data.name, url: data.url });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateManualCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), url: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("manual_companies")
      .update({ url: data.url })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteManualCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("manual_companies").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

// Detect whether a pasted careers URL is a supported ATS board; route it
// into `sources` if so, otherwise into the manual `manual_companies` checklist.
export const detectAndAddCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      url: z.string().url(),
      name: z.string().min(1).max(200).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const parsed = parseAtsFromUrl(data.url);

    if (parsed) {
      try {
        if (parsed.type === "greenhouse") await fetchGreenhouse(parsed.slug, "");
        else if (parsed.type === "ashby") await fetchAshby(parsed.slug, "");
        else await fetchLever(parsed.slug, "");

        const name = data.name ?? cleanCompanyNameFromTitle((await fetchPageTitle(data.url)) ?? "") ?? undefined;
        if (!name) return { status: "needs_name" as const };

        const { data: existing } = await supabase.from("sources")
          .select("id").eq("user_id", userId).eq("type", parsed.type).eq("slug", parsed.slug).maybeSingle();
        if (existing) return { status: "already_added" as const, name, type: parsed.type as string };

        const { error } = await supabase.from("sources")
          .insert({ user_id: userId, type: parsed.type, slug: parsed.slug, name });
        if (error) throw new Error(error.message);
        return { status: "added_ats" as const, name, type: parsed.type as string };
      } catch {
        // Matched a known ATS domain but the board didn't resolve (bad/removed slug) —
        // fall through and file it under the manual checklist instead.
      }
    }

    const name = data.name ?? cleanCompanyNameFromTitle((await fetchPageTitle(data.url)) ?? "") ?? undefined;
    if (!name) return { status: "needs_name" as const };

    const { data: existingManual } = await supabase.from("manual_companies")
      .select("id").eq("user_id", userId).ilike("name", name).maybeSingle();
    if (existingManual) return { status: "already_added" as const, name, type: null };

    const { error } = await supabase.from("manual_companies")
      .insert({ user_id: userId, name, url: data.url });
    if (error) throw new Error(error.message);
    return { status: "added_manual" as const, name };
  });

// Sources
export const addSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      type: z.enum(["greenhouse", "ashby", "lever"]),
      slug: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sources")
      .insert({ user_id: context.userId, ...data });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("sources").update({ enabled: data.enabled })
      .eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

export const deleteSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("sources").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

// Keyword config
export const saveKeywordConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ config: z.any() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("keyword_config")
      .upsert({ user_id: context.userId, config: data.config as KeywordConfig, updated_at: new Date().toISOString() });
    return { ok: true };
  });

// Applications
export const updateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      stage: z.enum(["applied", "screen", "interview", "offer", "rejected", "withdrawn"]).optional(),
      next_action: z.string().max(500).nullable().optional(),
      next_action_at: z.string().nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
      company: z.string().min(1).max(200).optional(),
      title: z.string().min(1).max(300).optional(),
      url: z.string().url().nullable().optional().or(z.literal("")),
      applied_at: z.string().optional(),
      linkedin_easy_apply: z.boolean().optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    if (patch.url === "") patch.url = null;
    await context.supabase.from("applications").update(patch).eq("id", id).eq("user_id", context.userId);
    return { ok: true };
  });

export const addManualApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      company: z.string().min(1).max(200),
      title: z.string().min(1).max(300),
      url: z.string().url().optional().or(z.literal("")),
      linkedin_easy_apply: z.boolean().optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("applications").insert({
      user_id: context.userId, company: data.company, title: data.title,
      url: data.url || null, stage: "applied",
      linkedin_easy_apply: data.linkedin_easy_apply ?? false,
    });
    return { ok: true };
  });


export const deleteApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("applications").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

async function resyncApplicationStage(
  supabase: any,
  userId: string,
  applicationId: string,
) {

  const { data: latest } = await supabase
    .from("application_events")
    .select("stage")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .order("changed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return;
  await supabase
    .from("applications")
    .update({ stage: latest.stage })
    .eq("id", applicationId)
    .eq("user_id", userId);
}

export const updateApplicationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), changed_at: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("application_events")
      .update({ changed_at: data.changed_at })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("application_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (row?.application_id) {
      await resyncApplicationStage(context.supabase, context.userId, row.application_id);
    }
    return { ok: true };
  });

export const deleteApplicationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase.from("application_events")
      .select("application_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await context.supabase.from("application_events")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (existing?.application_id) {
      await resyncApplicationStage(context.supabase, context.userId, existing.application_id);
    }
    return { ok: true };
  });


// Import legacy JSON
export const importLegacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      config: z.any().optional(),
      applied: z.record(z.string(), z.any()).optional(),
      interested: z.record(z.string(), z.any()).optional(),
      dismissed: z.record(z.string(), z.any()).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const summary = { sources: 0, manual: 0, configSaved: false, jobs: 0 };

    if (data.config && typeof data.config === "object") {
      const c = data.config as Record<string, unknown>;
      // Sources
      const rows: Array<{ user_id: string; type: "greenhouse"|"ashby"|"lever"; slug: string; name: string }> = [];
      const arr = (k: string) => (Array.isArray(c[k]) ? c[k] as Array<{slug: string; name: string}> : []);
      for (const x of arr("greenhouse_companies")) rows.push({ user_id: userId, type: "greenhouse", slug: x.slug, name: x.name });
      for (const x of arr("ashby_companies")) rows.push({ user_id: userId, type: "ashby", slug: x.slug, name: x.name });
      for (const x of arr("lever_companies")) rows.push({ user_id: userId, type: "lever", slug: x.slug, name: x.name });
      if (rows.length) {
        await supabase.from("sources").upsert(rows, { onConflict: "user_id,type,slug" });
        summary.sources = rows.length;
      }
      const manual = Array.isArray(c.manual_companies) ? c.manual_companies as Array<{name: string; url: string}> : [];
      if (manual.length) {
        const existing = await supabase.from("manual_companies").select("name").eq("user_id", userId);
        const have = new Set((existing.data ?? []).map((r) => r.name));
        const toInsert = manual.filter((m) => !have.has(m.name)).map((m) => ({ user_id: userId, name: m.name, url: m.url }));
        if (toInsert.length) await supabase.from("manual_companies").insert(toInsert);
        summary.manual = toInsert.length;
      }
      // Keyword config (everything except company lists)
      const cfg: KeywordConfig = {
        keywords: (c.keywords as KeywordConfig["keywords"]) ?? DEFAULT_KEYWORD_CONFIG.keywords,
        exclusions: (c.exclusions as KeywordConfig["exclusions"]) ?? DEFAULT_KEYWORD_CONFIG.exclusions,
        non_english_markers: (c.non_english_markers as string[]) ?? DEFAULT_KEYWORD_CONFIG.non_english_markers,
        remote_only: typeof c.remote_only === "boolean" ? c.remote_only : false,
        remote_terms: (c.remote_terms as string[]) ?? DEFAULT_KEYWORD_CONFIG.remote_terms,
        location_exclude: (c.location_exclude as string[]) ?? DEFAULT_KEYWORD_CONFIG.location_exclude,
      };
      await supabase.from("keyword_config").upsert({ user_id: userId, config: cfg, updated_at: new Date().toISOString() });
      summary.configSaved = true;
    }

    // Helper to upsert legacy jobs into the jobs table
    const importJobs = async (
      records: Record<string, Record<string, unknown>> | undefined,
      status: "applied" | "interested" | "dismissed",
      tsField: string,
    ) => {
      if (!records) return 0;
      const entries = Object.entries(records);
      const rows = entries.map(([extId, v]) => ({
        user_id: userId,
        external_id: extId,
        source: extId.split("-")[0] || "legacy",
        company: String(v.company ?? ""),
        title: String(v.title ?? ""),
        location: "",
        url: String(v.url ?? ""),
        job_date: "",
        matched_keywords: String(v.keywords ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        matched_groups: [],
        status,
        status_updated_at: String(v[tsField] ?? new Date().toISOString()),
        first_seen_at: String(v[tsField] ?? new Date().toISOString()),
        last_seen_at: new Date().toISOString(),
      }));
      const chunk = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += chunk) {
        const slice = rows.slice(i, i + chunk);
        const { error, count } = await supabase.from("jobs")
          .upsert(slice, { onConflict: "user_id,external_id", count: "exact" });
        if (!error) inserted += count ?? slice.length;
      }
      return inserted;
    };
    summary.jobs += await importJobs(data.dismissed, "dismissed", "dismissed_at");
    summary.jobs += await importJobs(data.interested, "interested", "added_at");
    summary.jobs += await importJobs(data.applied, "applied", "applied_at");

    // Seed applications from applied entries
    if (data.applied) {
      for (const [extId, v] of Object.entries(data.applied)) {
        const { data: job } = await supabase.from("jobs").select("id").eq("user_id", userId).eq("external_id", extId).maybeSingle();
        const company = String((v as Record<string, unknown>).company ?? "");
        const title = String((v as Record<string, unknown>).title ?? "");
        const url = String((v as Record<string, unknown>).url ?? "");
        const appliedAt = String((v as Record<string, unknown>).applied_at ?? new Date().toISOString());
        if (job) {
          const { data: existing } = await supabase.from("applications").select("id").eq("job_id", job.id).maybeSingle();
          if (!existing) {
            await supabase.from("applications").insert({
              user_id: userId, job_id: job.id, company, title, url, stage: "applied", applied_at: appliedAt,
            });
          }
        } else {
          await supabase.from("applications").insert({
            user_id: userId, company, title, url, stage: "applied", applied_at: appliedAt,
          });
        }
      }
    }
    return summary;
  });

// ---------- Scheduled scans ----------
import { FREQUENCIES, computeNextRun, type Frequency } from "./schedule";

export const getSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("scan_schedules")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      enabled: Boolean(row.enabled ?? false),
      frequency: (row.frequency as Frequency) ?? ("daily" as Frequency),
      last_run_at: (row.last_run_at as string | null) ?? null,
      next_run_at: (row.next_run_at as string | null) ?? null,
      run_at_local: (row.run_at_local as string | null) ?? "09:00",
      timezone: (row.timezone as string | null) ?? null,
    };
  });

export const saveSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      enabled: z.boolean(),
      frequency: z.enum(FREQUENCIES),
      run_at_local: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      timezone: z.string().min(1).max(100).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const runAtLocal = data.run_at_local ?? "09:00";
    const timezone = data.timezone ?? "UTC";
    const next = computeNextRun(data.frequency, { runAtLocal, timezone }).toISOString();
    const row = {
      user_id: context.userId,
      enabled: data.enabled,
      frequency: data.frequency,
      run_at_local: runAtLocal,
      timezone,
      next_run_at: next,
    } as unknown as never;
    const { error } = await context.supabase.from("scan_schedules").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Notifications ----------
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("notifications")
      .select("id, kind, title, body, data, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId).is("read_at", null);
    return { ok: true };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("notifications")
      .delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

// ---------- Push subscriptions ----------
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      endpoint: z.string().url().max(2000),
      p256dh: z.string().min(1).max(500),
      auth: z.string().min(1).max(500),
      user_agent: z.string().max(500).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert({
      user_id: context.userId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      user_agent: data.user_agent ?? null,
    }, { onConflict: "user_id,endpoint" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ endpoint: z.string().url().max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_subscriptions")
      .delete().eq("user_id", context.userId).eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const hasPushSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    return { count: count ?? 0 };
  });

