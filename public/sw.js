/* SyncCinema service worker — minimal app-shell cache.
 * The app itself is a live room experience: we never cache API or WebSocket
 * traffic, only the static shell, so an installed PWA opens instantly and
 * gracefully offline (rooms still require connectivity, by design). */
const CACHE = "synccinema-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never intercept live traffic (Next.js RSC/prefetches, APIs, sockets).
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api") || url.search.includes("XTransformPort")) return;

  // Static assets: cache-first. Navigations: network-first with shell fallback.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }
  if (url.origin === location.origin && (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons"))) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => undefined);
            return res;
          })
      )
    );
  }
});
