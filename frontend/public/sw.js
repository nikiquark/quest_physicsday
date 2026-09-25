// Service worker: keeps the app shell and the 13 MB opencv.js available offline / instantly.
const VERSION = "v1";
const STATIC_CACHE = `pq-static-${VERSION}`;
const PAGES_CACHE = `pq-pages-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put("/index.html", response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match("/index.html");
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(api|ws|django-admin|django-static)\//.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (/^\/(assets|opencv)\//.test(url.pathname) || url.pathname === "/cv-worker.js") {
    event.respondWith(cacheFirst(request));
  }
});
