// Browser side of push notifications: support checks, subscribing this device, the icon badge.
// Browser-only; call from effects and event handlers.

export type PushSupport = "supported" | "needs-install" | "unsupported";

export function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// iPhone and iPad only offer push to the app opened from the Home Screen.
export function pushSupport(): PushSupport {
  const hasApis =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIos() && !isStandalone()) return "needs-install";
  return hasApis ? "supported" : "unsupported";
}

// The VAPID public key (URL-safe base64) as the bytes PushManager.subscribe wants.
export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export class PushSetupError extends Error {}

// Must run straight from a tap: iOS only shows the permission prompt for a user gesture, so the
// permission request comes first, before anything else is awaited.
export async function subscribeThisDevice(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushSetupError(
      permission === "denied"
        ? "Notifications are blocked. Turn them on in your device or browser settings."
        : "Notifications were not allowed."
    );
  }
  // The worker registers in production builds only (components/pwa-setup.tsx).
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    throw new PushSetupError("The app is still getting ready. Reload the page and try again.");
  }
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }));
  return subscription;
}

// The parts of a PushSubscription the server stores.
export function subscriptionJson(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }
  };
}

// The app icon's count (Badging API). 0 clears it. No-op where unsupported.
export function setIconBadge(count: number) {
  try {
    if (!("setAppBadge" in navigator)) return;
    const done = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    done.catch(() => {});
  } catch {
    // Not allowed here (e.g. not installed): nothing to show.
  }
}
