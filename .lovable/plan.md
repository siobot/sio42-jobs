# Home-screen install + push badge notifications

Add two layers so Safari "Add to Home Screen" gets a real app icon and an unread badge when new jobs are found in the background.

## 1. Installability (manifest only)

- Add `public/manifest.webmanifest` with name "Pursuit Bot", short name, theme + background colors, `display: "standalone"`, `start_url: "/"`, and icon entries (192, 512, maskable).
- Generate app icons (192, 512, 180 apple-touch) into `public/icons/`.
- Add `<link rel="manifest">`, `<meta name="theme-color">`, and `<link rel="apple-touch-icon">` in `src/routes/__root.tsx` head.

This gives a real icon + standalone window on iOS/Android home screen.

## 2. Push + badge

Use the Web Push standard (works on iOS 16.4+ once the app is installed to home screen; works on Android Chrome anytime). No third-party service needed.

**Backend**
- New table `push_subscriptions` (user_id, endpoint, p256dh, auth, created_at) with RLS scoped to `auth.uid()`.
- Generate VAPID keys once and store as secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Server fns: `getVapidPublicKey`, `savePushSubscription`, `deletePushSubscription`.
- In `api.public.scan.ts`, after inserting a `scan_complete` notification with `newCount > 0`, also send a web push to all of that user's subscriptions using `web-push` package. Payload includes title, body, and `badgeCount` (= unread notifications count).
- On 404/410 from push endpoint, delete that subscription row.

**Frontend**
- New `public/sw.js` service worker (messaging-only — exempt from PWA preview ban per skill rules):
  - `push` handler: `self.registration.showNotification(...)` and `navigator.setAppBadge(badgeCount)`.
  - `notificationclick` handler: focus/open the app at `/`.
- Register `/sw.js` from a small client wrapper only in production (skip preview/dev/iframe).
- In Settings → "Scheduled scans" tab, add an "Enable push notifications" toggle that:
  - Requests `Notification.requestPermission()`.
  - Subscribes via `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey })`.
  - Saves the subscription via server fn.
  - Toggling off unsubscribes and deletes the row.
- When the app is foreground and the bell polls show unread notifications, also call `navigator.setAppBadge(unreadCount)` / `clearAppBadge()` so the home-screen badge stays in sync.

## Platform notes

- **iOS Safari**: Push + badge only works after the user uses "Add to Home Screen" and then opens the installed app once to grant permission. Plain Safari bookmarks do not support push.
- **Android Chrome**: Works whether installed or just in browser.
- **Desktop Safari/Chrome**: Works after permission grant.

## Out of scope

- Email notifications (no email domain configured).
- Custom notification sounds / actions.
- Offline app-shell caching (this is a messaging-only SW, not an offline PWA).