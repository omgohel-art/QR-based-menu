const CACHE = "mama-cafe-v2";
const PRECACHE_URLS = [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== location.origin) return;

  if (
    request.method === "GET" &&
    (url.pathname.startsWith("/api/public/") || url.pathname.startsWith("/assets/"))
  ) {
    if (url.pathname === "/api/public/menu-items" || url.pathname === "/api/public/categories") {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          event.waitUntil(
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res);
            }).catch(() => {})
          );
          return cached;
        }
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
  }
});
