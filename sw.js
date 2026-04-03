const CACHE_NAME = "routee-shell-v103";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.html",
  "./chooser.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./css/mobile.css",
  "./css/auth.css",
  "./js/app-entry.js",
  "./js/app-offline.js",
  "./js/local-session.js",
  "./js/local-maps.js",
  "./js/login-page.js",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.searchParams.has("check")) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() => new Response("", { status: 503, statusText: "Offline" }))
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          if (url.pathname.endsWith("/app.html") || url.pathname.endsWith("app.html")) {
            return (await caches.match("./app.html")) || (await caches.match("./index.html"));
          }
          return (await caches.match("./index.html")) || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
