import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Discovery config
export const getDiscoveryConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("discovery_config")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? { user_id: context.userId, time_frame: "7d", enabled: false };
  });

export const saveDiscoveryConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      time_frame: z.enum(["24h", "7d"]),
      enabled: z.boolean(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("discovery_config").upsert({
      user_id: context.userId,
      time_frame: data.time_frame,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Suggestions
export const listDiscoverySuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data }, { data: importedJobs }, { data: kwRow }] = await Promise.all([
      context.supabase
        .from("discovery_suggestions")
        .select("*")
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .order("discovered_at", { ascending: false }),
      context.supabase
        .from("jobs")
        .select("external_id")
        .eq("user_id", context.userId)
        .like("external_id", "discovered:%"),
      context.supabase.from("keyword_config").select("config").eq("user_id", context.userId).maybeSingle(),
    ]);
    // Companies removed with "Remove company" on a tracked job.
    const excluded = new Set(
      (((kwRow?.config ?? {}) as { company_exclude?: string[] }).company_exclude ?? [])
        .map((c) => c.trim().toLowerCase()),
    );
    const importedUrls = new Set(
      (importedJobs ?? []).map((j: { external_id: string }) => j.external_id.replace("discovered:", "")),
    );
    return (data ?? []).filter((s) => !excluded.has((s.company_name || s.slug).trim().toLowerCase())).map((s) => {
      const roles = (s.matching_roles ?? []) as Array<{ title: string; url: string; location: string }>;
      return { ...s, matching_roles: roles.filter((r) => !importedUrls.has(r.url)) };
    }).filter((s) => (s.matching_roles as unknown[]).length > 0);
  });

export const approveSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: suggestion, error: fetchErr } = await context.supabase
      .from("discovery_suggestions")
      .select("ats_type, slug, company_name")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (fetchErr || !suggestion) throw new Error("Suggestion not found");

    const { error: insertErr } = await context.supabase.from("sources").upsert({
      user_id: context.userId,
      type: suggestion.ats_type as "greenhouse" | "ashby" | "lever",
      slug: suggestion.slug,
      name: suggestion.company_name || suggestion.slug,
    }, { onConflict: "user_id,type,slug" });
    if (insertErr) throw new Error(insertErr.message);

    await context.supabase.from("discovery_suggestions")
      .update({ status: "approved", resolved_at: new Date().toISOString() })
      .eq("id", data.id);

    return { ok: true };
  });

export const dismissSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("discovery_suggestions")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", data.id);

    return { ok: true };
  });

export const importDiscoveredJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      title: z.string(),
      url: z.string(),
      company: z.string(),
      location: z.string().default(""),
      ats_type: z.string(),
      slug: z.string(),
      status: z.enum(["interested", "applied", "dismissed"]),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("sources").upsert({
      user_id: context.userId,
      type: data.ats_type as "greenhouse" | "ashby" | "lever",
      slug: data.slug,
      name: data.company,
    }, { onConflict: "user_id,type,slug" });

    const externalId = `discovered:${data.url}`;
    const { data: existing } = await context.supabase
      .from("jobs")
      .select("id")
      .eq("user_id", context.userId)
      .eq("external_id", externalId)
      .maybeSingle();

    if (existing) {
      await context.supabase.from("jobs")
        .update({ status: data.status, status_updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return { ok: true, jobId: existing.id };
    }

    const { data: row, error } = await context.supabase.from("jobs").insert({
      user_id: context.userId,
      external_id: externalId,
      source: data.ats_type,
      company: data.company,
      title: data.title,
      location: data.location,
      url: data.url,
      status: data.status,
      matched_groups: ["discovered"],
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, jobId: row.id };
  });

// "Dismiss all" clears the jobs currently listed but keeps each company open,
// so later discovery runs still bring in that company's new jobs. Use
// "Exclude company" to stop a company appearing at all.
export const dismissAllSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("discovery_suggestions")
      .select("id, matching_roles, cleared_urls")
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    for (const s of data ?? []) {
      const roles = (s.matching_roles ?? []) as Array<{ url: string }>;
      const cleared = (s.cleared_urls ?? []) as string[];
      const { error: updErr } = await context.supabase
        .from("discovery_suggestions")
        .update({ matching_roles: [], cleared_urls: [...new Set([...cleared, ...roles.map((r) => r.url)])] })
        .eq("id", s.id);
      if (updErr) throw new Error(updErr.message);
    }
    return { ok: true };
  });

// Trigger discovery run manually
export const triggerDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.SB_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SB_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase config missing");

    const res = await fetch(`${supabaseUrl}/functions/v1/discover-companies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: context.userId, triggered_by: "manual" }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Discovery function failed: ${res.status} ${text.slice(0, 200)}`);
    }

    return res.json();
  });

// Usage stats
export const getDiscoveryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ count: pendingCount }, { data: lastRun }] = await Promise.all([
      context.supabase
        .from("discovery_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("status", "pending"),
      context.supabase
        .from("discovery_runs")
        .select("*")
        .eq("user_id", context.userId)
        .order("started_at", { ascending: false })
        .limit(1),
    ]);

    return {
      pendingCount: pendingCount ?? 0,
      lastRun: lastRun?.[0] ?? null,
    };
  });
