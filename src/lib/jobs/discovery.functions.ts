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
      time_frame: z.enum(["1h", "24h", "7d"]),
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
    const { data } = await context.supabase
      .from("discovery_suggestions")
      .select("*")
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .order("discovered_at", { ascending: false });
    return data ?? [];
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
