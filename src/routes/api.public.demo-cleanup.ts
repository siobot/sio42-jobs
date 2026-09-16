// Public endpoint hit by pg_cron once a month.
// Deletes demo accounts (user_metadata.is_demo === true) — each one is
// single-use, created fresh per "Try the demo" click, so nothing about them
// needs to survive. Deleting the auth user cascades to all of its rows
// (sources, jobs, applications, etc. all have ON DELETE CASCADE on
// user_id), so no per-table cleanup is needed here.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/demo-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.SCAN_CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!cronSecret || provided !== cronSecret) {
          return new Response("Unauthorized: invalid or missing cron secret", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Small safety margin so a demo session mid-use right as the
        // monthly job fires isn't yanked out from under someone.
        const cutoff = Date.now() - 24 * 3600 * 1000;
        const deleted: string[] = [];
        const errors: Array<{ id: string; error: string }> = [];

        for (let page = 1; page <= 50; page++) {
          const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
          if (error || !data) break;
          for (const u of data.users) {
            const isDemo = Boolean((u.user_metadata as Record<string, unknown> | null)?.is_demo);
            if (!isDemo) continue;
            if (new Date(u.created_at).getTime() > cutoff) continue;
            const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
            if (delErr) errors.push({ id: u.id, error: delErr.message });
            else deleted.push(u.id);
          }
          if (data.users.length < 200) break;
        }

        return new Response(JSON.stringify({ ok: true, deleted: deleted.length, errors }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("ok"),
    },
  },
});
