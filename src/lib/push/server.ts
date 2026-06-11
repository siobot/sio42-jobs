// Server-only helper: send a web push to all of a user's subscriptions.
// Removes subscriptions that return 404/410.
import webpush from "web-push";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "./config";

let configured = false;
function configure() {
  if (configured) return;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) throw new Error("VAPID_PRIVATE_KEY not configured");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, priv);
  configured = true;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  badgeCount?: number;
  tag?: string;
};

type AdminLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function sendPushToUser(
  supabaseAdmin: AdminLike,
  userId: string,
  payload: PushPayload,
) {
  try {
    configure();
  } catch (e) {
    console.warn("Push not configured:", e instanceof Error ? e.message : e);
    return { sent: 0, removed: 0 };
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      const sub = {
        endpoint: s.endpoint as string,
        keys: { p256dh: s.p256dh as string, auth: s.auth as string },
      };
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 });
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id as string);
          removed++;
        } else {
          console.warn("Push send error:", err);
        }
      }
    }),
  );
  return { sent, removed };
}
