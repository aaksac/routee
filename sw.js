const SW_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `routee-shell-${SW_VERSION}`;
const NETWORK_TIMEOUT_MS = 1200;
const ROUTEE_ASSET_REVISION = "20260502-unified-splash";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.html",
  "./chooser.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./css/mobile.css",
  "./css/auth.css",
  "./css/splash.css",
  "./js/firebase-config.js",
  "./js/auth.js",
  "./js/firestore.js",
  "./js/login-page.js",
  "./js/app.js",
  "./js/map.js",
  "./js/route.js",
  "./js/location.js",
  "./js/import-export.js",
  "./js/chooser.js",
  "./js/version-guard.js",
  "./js/status-bar.js",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/splash-640x1136.png",
  "./icons/splash-750x1334.png",
  "./icons/splash-828x1792.png",
  "./icons/splash-1125x2436.png",
  "./icons/splash-1170x2532.png",
  "./icons/splash-1242x2208.png",
  "./icons/splash-1242x2688.png",
  "./icons/splash-1284x2778.png",
  "./icons/splash-1290x2796.png",
  "./icons/splash-1536x2048.png",
  "./icons/splash-1668x2224.png",
  "./icons/splash-1668x2388.png",
  "./icons/splash-2048x2732.png"
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

async function fetchWithTimeout(request, options = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
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

function normalizeAppShellKey(pathname) {
  if (pathname.endsWith("/")) return "./index.html";
  if (pathname.endsWith("/index.html")) return "./index.html";
  if (pathname.endsWith("/app.html")) return "./app.html";
  if (pathname.endsWith("/chooser.html")) return "./chooser.html";
  return null;
}

async function matchCached(request) {
  const cache = await caches.open(CACHE_NAME);
  const directMatch = await cache.match(request, { ignoreSearch: true });
  if (directMatch) return directMatch;

  const url = new URL(request.url);
  const shellKey = normalizeAppShellKey(url.pathname);
  if (shellKey) {
    return await cache.match(shellKey);
  }

  return null;
}

async function updateCache(request) {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(request, { cache: "no-store" });

  if (response && response.status === 200) {
    await cache.put(request, response.clone());
  }

  return response;
}

async function cacheFirstWithBackgroundUpdate(request) {
  const cachedResponse = await matchCached(request);

  if (cachedResponse) {
    eventlessUpdate(request);
    return cachedResponse;
  }

  return await updateCache(request);
}

function eventlessUpdate(request) {
  updateCache(request).catch(() => {
    // Sessiz bırakılır. Açılışta kullanıcıya hata göstermemek için cache cevabı korunur.
  });
}

async function networkFirstWithFastFallback(request) {
  const cachedResponse = await matchCached(request);

  try {
    const response = cachedResponse
      ? await fetchWithTimeout(request, { cache: "no-store" })
      : await fetch(request, { cache: "no-store" });

    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

async function staticCacheFirst(request) {
  const cachedResponse = await matchCached(request);
  if (cachedResponse) return cachedResponse;
  return await updateCache(request);
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

  if (url.searchParams.has("_v") && (isAppDocument || isCodeAsset)) {
    event.respondWith(
      networkFirstWithFastFallback(request).catch(async () => {
        const cachedResponse = await matchCached(request);
        return cachedResponse || Response.error();
      })
    );
    return;
  }

  if (isAppDocument) {
    event.respondWith(
      cacheFirstWithBackgroundUpdate(request).catch(async () => {
        if (isNavigationRequest) {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match("./index.html")) || Response.error();
        }

        const cachedResponse = await matchCached(request);
        return cachedResponse || Response.error();
      })
    );
    return;
  }

  if (isCodeAsset) {
    event.respondWith(
      cacheFirstWithBackgroundUpdate(request).catch(async () => {
        const cachedResponse = await matchCached(request);
        return cachedResponse || Response.error();
      })
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      staticCacheFirst(request).catch(async () => {
        const cachedResponse = await matchCached(request);
        return cachedResponse || Response.error();
      })
    );
    return;
  }

  event.respondWith(
    networkFirstWithFastFallback(request).catch(async () => {
      const cachedResponse = await matchCached(request);
      return cachedResponse || Response.error();
    })
  );
});
