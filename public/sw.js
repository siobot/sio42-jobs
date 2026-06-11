// Messaging-only service worker for Pursuit Bot.
// Handles web push notifications and home-screen badge updates.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "New activity", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Pursuit Bot";
  const body = payload.body || "";
  const badgeCount = typeof payload.badgeCount === "number" ? payload.badgeCount : undefined;
  const url = payload.url || "/jobs";

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url },
        tag: payload.tag || "pursuit-bot",
      });
      if (badgeCount !== undefined && "setAppBadge" in self.navigator) {
        try {
          if (badgeCount > 0) await self.navigator.setAppBadge(badgeCount);
          else await self.navigator.clearAppBadge();
        } catch {}
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          try { await client.navigate(url); } catch {}
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
