// MAMA Cafe offline cache service worker.
// Strategy:
//   - Network-first for /api/public/* (menu/business settings) — falls back to cache when offline.
//   - Cache-first for static assets (JS/CSS/fonts).
//   - Pass-through for everything else.

const CACHE_VERSION = "mama-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const PRECACHE_URLS = ["/", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // API: network-first, cache fallback
  if (url.pathname.startsWith("/api/public/")) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // Static: cache-first
  if (
    url.pathname.startsWith("/assets/") ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Navigation requests: try network, fall back to cached "/"
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match("/")) || Response.error();
      })
    );
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    return cached || Response.error();
  }
}
