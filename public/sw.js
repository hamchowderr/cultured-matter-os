// Cultured Matter service worker.
//
// One file on purpose: the offline cache at the top, push notifications (cmos-73k) at the bottom.
//
// What it caches:
// - The offline page and the app icons, at install.
// - Hashed build assets under /_next/static/ (immutable, no user data), on first use.
// - Page HTML only when the server allows it to be stored. Every signed-in page is rendered per
//   request and sent with `Cache-Control: no-store` / `private`, so signed-in pages are never stored.
//
// What it never touches: anything under /api, non-GET requests, other origins, and React Server
// Component payloads (the data behind client-side navigation). Those go straight to the network.

const VERSION = "v1";
const SHELL_CACHE = `cm-shell-${VERSION}`;
const ASSET_CACHE = `cm-assets-${VERSION}`;
const PAGE_CACHE = `cm-pages-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, PAGE_CACHE];

const OFFLINE_URL = "/offline";
const SHELL_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/icon/192", "/icon/512", "/apple-icon"];

// Decides how one request is handled: "network-only" means the worker stays out of the way.
function strategyFor(request) {
  const url = new URL(request.url);
  if (request.method !== "GET") return "network-only";
  if (url.origin !== self.location.origin) return "network-only";
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return "network-only";
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return "network-only";
  if (request.mode === "navigate") return "page";
  if (url.pathname.startsWith("/_next/static/")) return "asset";
  if (SHELL_URLS.includes(url.pathname)) return "asset";
  return "network-only";
}

// Only pages the server says may be stored, and never a redirect (a sign-in bounce).
function isStorablePage(response) {
  if (!response || !response.ok || response.redirected || response.type !== "basic") return false;
  const cacheControl = (response.headers.get("Cache-Control") || "").toLowerCase();
  return !cacheControl.includes("no-store") && !cacheControl.includes("private");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("cm-") && !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function handlePage(request) {
  try {
    const response = await fetch(request);
    if (isStorablePage(response)) {
      const copy = response.clone();
      caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch {
    const cached = await caches.match(request, { cacheName: PAGE_CACHE });
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return (
      offline ||
      new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}

async function handleAsset(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const strategy = strategyFor(event.request);
  if (strategy === "page") event.respondWith(handlePage(event.request));
  else if (strategy === "asset") event.respondWith(handleAsset(event.request));
  // "network-only": no respondWith, so the browser handles the request as if no worker existed.
});

// ---------------------------------------------------------------- Push notifications
//
// The server (lib/push.ts, web-push) sends JSON: { title, body, url, tag, badge }.
// iOS rules: every push must show a notification (a silent push can cost the app its
// permission), so the worker always calls showNotification, even for an unreadable payload.
// `badge` is the bell's unread count; the app icon shows it (Badging API, installed app only).

const DEFAULT_URL = "/today";

// Only paths on this site; anything else opens Today.
function safeUrl(url) {
  try {
    const target = new URL(url || DEFAULT_URL, self.location.origin);
    return target.origin === self.location.origin
      ? target.pathname + target.search + target.hash
      : DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

// Turns a push payload into what showNotification and the badge need.
function pushNotification(data) {
  const d = data && typeof data === "object" ? data : {};
  const badge = Number.isFinite(d.badge) && d.badge >= 0 ? Math.floor(d.badge) : null;
  const options = {
    body: typeof d.body === "string" ? d.body : "",
    icon: "/icon/192",
    data: { url: safeUrl(d.url) }
  };
  if (typeof d.tag === "string" && d.tag) options.tag = d.tag;
  return {
    title: typeof d.title === "string" && d.title ? d.title : "Cultured Matter",
    options,
    badge
  };
}

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

// 0 clears the icon badge. Skipped where the Badging API is missing.
function setBadge(count) {
  const nav = self.navigator;
  if (count === null || !nav || !("setAppBadge" in nav)) return Promise.resolve();
  const done = count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge();
  return Promise.resolve(done).catch(() => {});
}

self.addEventListener("push", (event) => {
  const { title, options, badge } = pushNotification(readPayload(event));
  event.waitUntil(
    Promise.all([self.registration.showNotification(title, options), setBadge(badge)])
  );
});

// Opens the notification's page: in the app window if one is open, else a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        try {
          const moved = "navigate" in open ? await open.navigate(url) : null;
          return (moved || open).focus();
        } catch {
          // Fall through to a new window.
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
