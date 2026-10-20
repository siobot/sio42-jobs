// Server-only: tells a user about scan problems through the notification bell
// and a push notification, so they don't have to check Scan history.
import type { Json } from "@/integrations/supabase/types";
import { SOURCE_LABELS } from "./types";

type ScanError = { source: string; error: string };

// "greenhouse/Postman" -> "Postman (Greenhouse)"
function describeSource(label: string): string {
  const slash = label.indexOf("/");
  if (slash < 0) return label;
  const type = label.slice(0, slash);
  const name = label.slice(slash + 1);
  return `${name} (${SOURCE_LABELS[type] ?? type})`;
}

async function notify(userId: string, kind: string, title: string, body: string, data: { [key: string]: Json }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notifications").insert({ user_id: userId, kind, title, body, data });
  try {
    const { sendPushToUser } = await import("@/lib/push/server");
    const { count: unread } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    await sendPushToUser(supabaseAdmin, userId, {
      title, body, url: "/history", badgeCount: unread ?? undefined, tag: kind,
    });
  } catch (e) {
    console.warn("Push send failed:", e instanceof Error ? e.message : e);
  }
}

// Alerts only on sources that failed this run but not the run before, so a
// board that stays broken produces one alert rather than one per scan.
export async function alertNewScanErrors(userId: string, runId: string, errors: ScanError[]) {
  if (errors.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: prev } = await supabaseAdmin
    .from("scan_runs")
    .select("errors")
    .eq("user_id", userId)
    .neq("id", runId)
    .not("finished_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const before = new Set(((prev?.errors ?? []) as ScanError[]).map((e) => e.source));
  const fresh = errors.filter((e) => !before.has(e.source));
  if (fresh.length === 0) return;

  const names = fresh.map((e) => describeSource(e.source));
  const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "");
  await notify(
    userId,
    "scan_errors",
    `${fresh.length} source${fresh.length === 1 ? "" : "s"} failed to scan`,
    `${shown}: ${fresh[0].error}`,
    { runId, sources: fresh.map((e) => e.source) },
  );
}

export async function alertScanFailed(userId: string, message: string) {
  await notify(userId, "scan_failed", "Scheduled scan failed", message, {});
}
