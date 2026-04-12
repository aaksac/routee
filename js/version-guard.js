const VERSION_URL = "./version.json";
const VERSION_STORAGE_KEY = "routee_app_version";
const VERSION_CHECK_INTERVAL_MS = 60000;
const SW_URL_BASE = "./sw.js";

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("Local storage okuma hatası:", error);
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Local storage yazma hatası:", error);
  }
}

function removeVersionQueryParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_v")) return;

    url.searchParams.delete("_v");
    window.history.replaceState({}, document.title, url.toString());
  } catch (error) {
    console.warn("Versiyon parametresi temizlenemedi:", error);
  }
}

async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return;

  try {
    const alreadyPersisted = await navigator.storage.persisted();
    if (alreadyPersisted) return;
    await navigator.storage.persist();
  } catch (error) {
    console.warn("Persistent storage isteği başarısız:", error);
  }
}

async function fetchRemoteVersion() {
  const requestUrl = `${VERSION_URL}?ts=${Date.now()}`;
  const response = await fetch(requestUrl, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache"
    }
  });

  if (!response.ok) {
    throw new Error(`Versiyon dosyası alınamadı: ${response.status}`);
  }

  const payload = await response.json();
  const version = String(payload?.version || "").trim();

  if (!version) {
    throw new Error("Versiyon bilgisi boş geldi.");
  }

  return version;
}

async function clearAllCaches() {
  if (!("caches" in window)) return;

  const cacheKeys = await caches.keys();
  await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
}

async function unregisterAllServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

function buildVersionedReloadUrl(version) {
  const url = new URL(window.location.href);
  url.searchParams.set("_v", version);
  return url.toString();
}

async function hardRefreshToVersion(version) {
  safeStorageSet(VERSION_STORAGE_KEY, version);

  await Promise.allSettled([
    clearAllCaches(),
    unregisterAllServiceWorkers()
  ]);

  window.location.replace(buildVersionedReloadUrl(version));
}

async function registerServiceWorker(version) {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register(
      `${SW_URL_BASE}?v=${encodeURIComponent(version)}`,
      {
        updateViaCache: "none"
      }
    );

    await registration.update();
    await requestPersistentStorage();
  } catch (error) {
    console.error("Service Worker kayıt hatası:", error);
  }
}

async function enforceLatestVersion() {
  let remoteVersion;

  try {
    remoteVersion = await fetchRemoteVersion();
  } catch (error) {
    console.warn("Versiyon kontrolü şu anda yapılamadı:", error);
    return;
  }

  const localVersion = safeStorageGet(VERSION_STORAGE_KEY);

  if (localVersion && localVersion !== remoteVersion) {
    await hardRefreshToVersion(remoteVersion);
    return;
  }

  safeStorageSet(VERSION_STORAGE_KEY, remoteVersion);
  removeVersionQueryParam();
  await registerServiceWorker(remoteVersion);
}

function setupVersionListeners() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void enforceLatestVersion();
    }
  });

  window.addEventListener("focus", () => {
    void enforceLatestVersion();
  });

  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void enforceLatestVersion();
    }
  }, VERSION_CHECK_INTERVAL_MS);
}

setupVersionListeners();
void enforceLatestVersion();
