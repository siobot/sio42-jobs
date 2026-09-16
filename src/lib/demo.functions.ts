import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// A single, fixed demo account shared by every visitor. Every "Try the
// demo" click wipes it back to a clean slate and reseeds it — there's no
// per-visitor isolation, so two people demoing at once could see each
// other's changes, but that's an accepted tradeoff for now.
const DEMO_EMAIL = "demo@demo.local";

export const createDemoAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ region: z.enum(["all", "us", "uk", "eu", "apac"]).default("all") }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      DEFAULT_ASHBY, DEFAULT_GREENHOUSE, DEFAULT_LEVER, DEFAULT_MANUAL,
      DEMO_KEYWORD_CONFIG, REGION_LOCATION_EXCLUDES,
    } = await import("@/lib/jobs/types");
    const { runScanForUser } = await import("@/lib/jobs/scan.server");

    const password = `Demo!${crypto.randomUUID()}`;

    // Find the fixed demo user (via its auto-created profile row) or create it.
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles").select("id").eq("email", DEMO_EMAIL).maybeSingle();

    let userId: string;
    if (existingProfile) {
      userId = existingProfile.id as string;
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (updateErr) throw new Error(updateErr.message);
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: DEMO_EMAIL,
        password,
        email_confirm: true,
        user_metadata: { is_demo: true },
      });
      if (createErr || !created.user) {
        throw new Error(createErr?.message ?? "Failed to create demo account");
      }
      userId = created.user.id;
    }

    // Wipe everything from the previous demo session so this one starts clean.
    await Promise.all([
      supabaseAdmin.from("applications").delete().eq("user_id", userId),
      supabaseAdmin.from("jobs").delete().eq("user_id", userId),
      supabaseAdmin.from("sources").delete().eq("user_id", userId),
      supabaseAdmin.from("manual_companies").delete().eq("user_id", userId),
      supabaseAdmin.from("scan_runs").delete().eq("user_id", userId),
      supabaseAdmin.from("scan_schedules").delete().eq("user_id", userId),
      supabaseAdmin.from("notifications").delete().eq("user_id", userId),
      supabaseAdmin.from("push_subscriptions").delete().eq("user_id", userId),
    ]);

    // Sources
    const DEFAULT_AGGREGATORS = [
      { type: "doist" as const, name: "Doist" },
      { type: "remotive" as const, name: "Remotive" },
      { type: "weworkremotely" as const, name: "We Work Remotely" },
      { type: "workingnomads" as const, name: "Working Nomads" },
    ];
    const sourceRows = [
      ...DEFAULT_GREENHOUSE.map((c) => ({ user_id: userId, type: "greenhouse" as const, slug: c.slug, name: c.name })),
      ...DEFAULT_ASHBY.map((c) => ({ user_id: userId, type: "ashby" as const, slug: c.slug, name: c.name })),
      ...DEFAULT_LEVER.map((c) => ({ user_id: userId, type: "lever" as const, slug: c.slug, name: c.name })),
      ...DEFAULT_AGGREGATORS.map((a) => ({ user_id: userId, type: a.type, slug: "", name: a.name })),
    ];
    await supabaseAdmin.from("sources").insert(sourceRows);
    await supabaseAdmin.from("manual_companies").insert(
      DEFAULT_MANUAL.map((m) => ({ user_id: userId, name: m.name, url: m.url })),
    );

    const keywordConfig = {
      ...DEMO_KEYWORD_CONFIG,
      location_exclude: REGION_LOCATION_EXCLUDES[data.region],
    };
    await supabaseAdmin.from("keyword_config").upsert({ user_id: userId, config: keywordConfig });

    // Run a real scan against the live ATS boards so the demo shows genuine
    // current postings instead of fabricated ones.
    await runScanForUser(supabaseAdmin, userId, "manual");

    // Mark a couple of the freshest matches as "interested" to show the workflow.
    const { data: freshJobs } = await supabaseAdmin
      .from("jobs").select("id")
      .eq("user_id", userId)
      .order("first_seen_at", { ascending: false })
      .limit(2);
    if (freshJobs?.length) {
      await supabaseAdmin.from("jobs")
        .update({ status: "interested", status_updated_at: new Date().toISOString() })
        .in("id", freshJobs.map((j) => j.id));
    }

    // Illustrative application-pipeline examples — not tied to live postings,
    // since these exist to show off every stage (screen/interview/rejected),
    // which a live scan can't fabricate on demand.
    const now = new Date();
    const isoDays = (d: number) => new Date(now.getTime() - d * 24 * 3600 * 1000).toISOString();
    const apps = [
      {
        company: "Notion", title: "Software Engineer, Platform", url: "https://example.com/jobs/5",
        stage: "applied" as const, applied_at: isoDays(5),
        notes: "Submitted via Greenhouse. Referral from a friend.",
        next_action: "Follow up in 1 week", next_action_at: isoDays(-2),
      },
      {
        company: "Linear", title: "Senior Frontend Engineer", url: "https://example.com/apps/linear",
        stage: "screen" as const, applied_at: isoDays(10),
        notes: "Recruiter screen scheduled.",
        next_action: "Prep behavioral questions", next_action_at: isoDays(-1),
      },
      {
        company: "Vercel", title: "Staff Software Engineer", url: "https://example.com/apps/vercel",
        stage: "interview" as const, applied_at: isoDays(18),
        notes: "Technical round next. System design focus.",
        next_action: "Review system design notes", next_action_at: isoDays(-3),
      },
      {
        company: "MegaCo", title: "Frontend Engineer", url: "https://example.com/apps/megaco",
        stage: "rejected" as const, applied_at: isoDays(30),
        notes: "Rejection after onsite. Feedback: stronger on backend needed.",
        next_action: null, next_action_at: null,
      },
    ].map((a) => ({ ...a, user_id: userId }));
    await supabaseAdmin.from("applications").insert(apps);

    return { email: DEMO_EMAIL, password };
  });
