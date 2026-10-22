import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// The visitor's country as Netlify detects it, for demo usage stats. Netlify
// sends it base64-encoded in x-nf-geo; x-country and Cloudflare's
// cf-ipcountry are fallbacks for other hosts.
function visitorCountry(): { country?: string; country_name?: string } {
  try {
    const headers = getRequest().headers;
    const geo = headers.get("x-nf-geo");
    if (geo) {
      let parsed: { country?: { code?: string; name?: string } };
      try { parsed = JSON.parse(atob(geo)); } catch { parsed = JSON.parse(geo); }
      if (parsed.country?.code) return { country: parsed.country.code, country_name: parsed.country.name };
    }
    const code = headers.get("x-country") ?? headers.get("cf-ipcountry");
    return code ? { country: code } : {};
  } catch {
    return {};
  }
}

// A fresh, isolated demo account per "Try the demo" click — no shared state
// or lookup/reuse logic, so no risk of colliding with another visitor or
// with Supabase Auth's own duplicate-email check. These accumulate over
// time; see api.public.demo-cleanup.ts for the periodic sweep that removes
// them.
export const createDemoAccount = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      DEFAULT_ASHBY, DEFAULT_GREENHOUSE, DEFAULT_LEVER, DEFAULT_MANUAL, DEMO_KEYWORD_CONFIG,
    } = await import("@/lib/jobs/types");

    const id = crypto.randomUUID();
    const email = `demo+${id}@demo.local`;
    const password = `Demo!${crypto.randomUUID()}`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { is_demo: true, ...visitorCountry() },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create demo account");
    }
    const userId = created.user.id;

    // Sources
    const DEFAULT_AGGREGATORS = [
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

    await supabaseAdmin.from("keyword_config").upsert({ user_id: userId, config: DEMO_KEYWORD_CONFIG });

    // Deliberately not running a live scan here: this handler runs
    // synchronously before the client can sign in, and a scan across every
    // seeded ATS board can take long enough to risk the hosting platform's
    // request timeout. The client triggers the scan itself (via the
    // existing `runScan`) right after signing in instead — see auth.tsx.

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

    return { email, password };
  });
