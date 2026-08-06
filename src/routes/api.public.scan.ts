// Public endpoint hit by pg_cron every 15 minutes.
// Runs scans for users whose schedule is due, then writes an in-app notification.
import { createFileRoute } from "@tanstack/react-router";
import { computeNextRun, type Frequency } from "@/lib/jobs/schedule";

export const Route = createFileRoute("/api/public/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Preferred: dedicated cron token (build-secret friendly name).
        // Fallback: legacy `apikey` == publishable key check, for old pg_cron jobs.
        const cronSecret = process.env.SCAN_CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        const apiKey = request.headers.get("apikey");
        const publishable =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SB_PUBLISHABLE_KEY;

        const okCron = Boolean(cronSecret) && provided === cronSecret;
        const okLegacy = Boolean(publishable) && apiKey === publishable;
        if (!okCron && !okLegacy) {
          if (!cronSecret && !publishable) {
            return new Response("Unauthorized: no cron secret configured on the server", { status: 401 });
          }
          return new Response("Unauthorized: invalid cron secret", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runScanForUser } = await import("@/lib/jobs/scan.server");

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("scan_schedules")
          .select("*")
          .eq("enabled", true)
          .lte("next_run_at", nowIso);
        if (error) return new Response(error.message, { status: 500 });

        const results: Array<{ userId: string; newCount?: number; error?: string }> = [];
        for (const raw of due ?? []) {
          const row = raw as unknown as Record<string, unknown>;
          const userId = row.user_id as string;
          const frequency = row.frequency as Frequency;
          const runAtLocal = (row.run_at_local as string | null) ?? "09:00";
          const timezone = (row.timezone as string | null) ?? "UTC";
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
              try {
                const { sendPushToUser } = await import("@/lib/push/server");
                const { count: unread } = await supabaseAdmin
                  .from("notifications")
                  .select("id", { count: "exact", head: true })
                  .eq("user_id", userId)
                  .is("read_at", null);
                await sendPushToUser(supabaseAdmin, userId, {
                  title: `${r.newCount} new job${r.newCount === 1 ? "" : "s"} found`,
                  body: `Scanned ${r.fetched} listing${r.fetched === 1 ? "" : "s"}.`,
                  url: "/",
                  badgeCount: unread ?? r.newCount,
                  tag: "scan_complete",
                });
              } catch (e) {
                console.warn("Push send failed:", e instanceof Error ? e.message : e);
              }
            }
          } catch (e) {
            results.push({ userId, error: e instanceof Error ? e.message : String(e) });
          } finally {
            const now = new Date();
            const next = computeNextRun(frequency, { from: now, runAtLocal, timezone });
            const patch = {
              last_run_at: now.toISOString(),
              next_run_at: next.toISOString(),
            } as unknown as never;
            await supabaseAdmin.from("scan_schedules").update(patch).eq("user_id", userId);
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
