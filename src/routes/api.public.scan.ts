// Public endpoint hit by pg_cron every 15 minutes.
// Runs scans for users whose schedule is due, then writes an in-app notification.
import { createFileRoute } from "@tanstack/react-router";

function nextRunAt(frequency: string, from: Date): Date {
  const d = new Date(from);
  switch (frequency) {
    case "hourly": d.setUTCHours(d.getUTCHours() + 1); break;
    case "6h": d.setUTCHours(d.getUTCHours() + 6); break;
    case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
    case "daily":
    default: d.setUTCDate(d.getUTCDate() + 1); break;
  }
  return d;
}

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

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("scan_schedules")
          .select("user_id, frequency")
          .eq("enabled", true)
          .lte("next_run_at", nowIso);
        if (error) return new Response(error.message, { status: 500 });

        const results: Array<{ userId: string; newCount?: number; error?: string }> = [];
        for (const row of due ?? []) {
          const userId = row.user_id as string;
          const frequency = row.frequency as string;
          try {
            const r = await runScanForUser(supabaseAdmin, userId, "cron");
            results.push({ userId, newCount: r.newCount });
            if (r.newCount > 0) {
              await supabaseAdmin.from("notifications").insert({
                user_id: userId,
                kind: "scan_complete",
                title: `${r.newCount} new job${r.newCount === 1 ? "" : "s"} found`,
                body: `Scanned ${r.fetched} listing${r.fetched === 1 ? "" : "s"}.`,
                data: { newCount: r.newCount, runId: r.runId, matched: r.matched },
              });
            }
          } catch (e) {
            results.push({ userId, error: e instanceof Error ? e.message : String(e) });
          } finally {
            const now = new Date();
            await supabaseAdmin.from("scan_schedules").update({
              last_run_at: now.toISOString(),
              next_run_at: nextRunAt(frequency, now).toISOString(),
            }).eq("user_id", userId);
          }
        }
        return new Response(JSON.stringify({ ok: true, ran: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("ok"),
    },
  },
});
