// Service worker registration — production only, never in Lovable preview/dev.
function isAllowedContext(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  if (window.self !== window.top) return false;
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return false;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return false;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return false;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return false;
  if (new URL(window.location.href).searchParams.get("sw") === "off") return false;
  return true;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isAllowedContext()) {
    // Best-effort cleanup if user previously registered
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        for (const r of regs) {
          if (r.active?.scriptURL.endsWith("/sw.js")) r.unregister().catch(() => {});
        }
      }).catch(() => {});
    }
    return Promise.resolve(null);
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((e) => {
        console.error("SW register failed", e);
        return null;
      });
  }
  return registrationPromise;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
  const reg = await ensureServiceWorker();
  if (!reg) return null;
  if (Notification.permission === "denied") return null;
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return null;
  }
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const key = urlBase64ToUint8Array(vapidPublicKey);
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
  });
}

export async function unsubscribeFromPush(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = (await reg?.pushManager.getSubscription()) ?? null;
  if (sub) await sub.unsubscribe();
  return sub;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function updateAppBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {}
}
