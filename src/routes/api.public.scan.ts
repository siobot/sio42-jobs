// Public endpoint hit by pg_cron to run a scheduled scan for every user.
// Auth: requires the project anon `apikey` header (pg_cron sends it).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runScanForUser } = await import("@/lib/jobs/scan.server");

        const { data: users, error } = await supabaseAdmin.from("profiles").select("id");
        if (error) return new Response(error.message, { status: 500 });

        const results: Array<{ userId: string; newCount?: number; error?: string }> = [];
        for (const u of users ?? []) {
          try {
            const r = await runScanForUser(supabaseAdmin, u.id, "cron");
            results.push({ userId: u.id, newCount: r.newCount });
          } catch (e) {
            results.push({ userId: u.id, error: e instanceof Error ? e.message : String(e) });
          }
        }
        return new Response(JSON.stringify({ ok: true, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("ok"),
    },
  },
});
