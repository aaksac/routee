const SW_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `routee-shell-${SW_VERSION}`;
const NETWORK_TIMEOUT_DOCUMENT_MS = 1800;
const NETWORK_TIMEOUT_CODE_MS = 2200;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./css/auth.css",
  "./js/firebase-config.js",
  "./js/auth.js",
  "./js/firestore.js",
  "./js/login-page.js",
  "./js/version-guard.js",
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
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((cacheKey) => cacheKey !== CACHE_NAME)
          .map((cacheKey) => caches.delete(cacheKey))
      );

      await self.clients.claim();
    })()
  );
});

async function fetchWithTimeout(request, options = {}, timeoutMs = NETWORK_TIMEOUT_CODE_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(request, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  const isNavigationRequest = request.mode === "navigate" || request.destination === "document";
  const timeoutMs = isNavigationRequest ? NETWORK_TIMEOUT_DOCUMENT_MS : NETWORK_TIMEOUT_CODE_MS;

  try {
    const response = cachedResponse
      ? await fetchWithTimeout(request, { cache: "no-store" }, timeoutMs)
      : await fetch(request, { cache: "no-store" });

    if (response && response.status === 200) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  const response = await fetch(request);
  if (response && response.status === 200) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname;
  const isNavigationRequest = request.mode === "navigate";
  const isVersionFile = pathname.endsWith("/version.json") || pathname.endsWith("version.json");
  const isServiceWorkerFile = pathname.endsWith("/sw.js") || pathname.endsWith("sw.js");
  const isAppDocument = pathname.endsWith(".html") || isNavigationRequest;
  const isCodeAsset =
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".webmanifest");
  const isStaticAsset =
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".gif") ||
    pathname.endsWith(".ico");

  if (isVersionFile || isServiceWorkerFile || url.searchParams.has("check")) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(
        () => new Response("", { status: 503, statusText: "Offline" })
      )
    );
    return;
  }

  if (isAppDocument || isCodeAsset) {
    event.respondWith(
      networkFirst(request).catch(async () => {
        if (isNavigationRequest) {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match("./index.html")) || Response.error();
        }

        const cachedResponse = await caches.match(request);
        return cachedResponse || Response.error();
      })
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      cacheFirst(request).catch(async () => {
        const cachedResponse = await caches.match(request);
        return cachedResponse || Response.error();
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      const cachedResponse = await caches.match(request);
      return cachedResponse || Response.error();
    })
  );
});
