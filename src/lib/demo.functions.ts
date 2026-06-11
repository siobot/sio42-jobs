import { createServerFn } from "@tanstack/react-start";

export const createDemoAccount = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { DEFAULT_ASHBY, DEFAULT_GREENHOUSE, DEFAULT_KEYWORD_CONFIG, DEFAULT_LEVER, DEFAULT_MANUAL } =
      await import("@/lib/jobs/types");

    const id = crypto.randomUUID();
    const email = `demo+${id}@demo.local`;
    const password = `Demo!${crypto.randomUUID()}`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { is_demo: true },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create demo account");
    }
    const userId = created.user.id;

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
    await supabaseAdmin
      .from("keyword_config")
      .upsert({ user_id: userId, config: DEFAULT_KEYWORD_CONFIG });

    // Placeholder jobs across statuses
    const now = new Date();
    const isoDays = (d: number) =>
      new Date(now.getTime() - d * 24 * 3600 * 1000).toISOString();
    const dateStr = (d: number) => isoDays(d).slice(0, 10);
    const jobs = [
      {
        external_id: "demo-1", source: "greenhouse", title: "Senior Frontend Engineer",
        company: "Linear", location: "Remote (Worldwide)", url: "https://example.com/jobs/1",
        job_date: dateStr(0), status: "new" as const,
        matched_groups: ["frontend"], matched_keywords: ["react", "typescript"],
      },
      {
        external_id: "demo-2", source: "ashby", title: "Staff Software Engineer, Product",
        company: "Vercel", location: "Remote (US)", url: "https://example.com/jobs/2",
        job_date: dateStr(1), status: "new" as const,
        matched_groups: ["frontend", "remote"], matched_keywords: ["next.js"],
      },
      {
        external_id: "demo-3", source: "lever", title: "Full-Stack Engineer",
        company: "Figma", location: "Remote (EU)", url: "https://example.com/jobs/3",
        job_date: dateStr(2), status: "interested" as const,
        matched_groups: ["fullstack"], matched_keywords: ["node", "react"],
      },
      {
        external_id: "demo-4", source: "remotive", title: "Frontend Engineer, Design Systems",
        company: "Stripe", location: "Remote", url: "https://example.com/jobs/4",
        job_date: dateStr(3), status: "interested" as const,
        matched_groups: ["frontend"], matched_keywords: ["design systems"],
      },
      {
        external_id: "demo-5", source: "greenhouse", title: "Software Engineer, Platform",
        company: "Notion", location: "Remote", url: "https://example.com/jobs/5",
        job_date: dateStr(5), status: "applied" as const,
        matched_groups: ["backend"], matched_keywords: ["typescript"],
      },
      {
        external_id: "demo-6", source: "weworkremotely", title: "Junior Backend Engineer",
        company: "Acme Corp", location: "Onsite NYC", url: "https://example.com/jobs/6",
        job_date: dateStr(4), status: "dismissed" as const,
        matched_groups: [], matched_keywords: [],
      },
    ].map((j) => ({ ...j, user_id: userId }));
    await supabaseAdmin.from("jobs").insert(jobs);

    // Placeholder applications across stages
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
  },
);
