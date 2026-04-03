async function boot() {
  const isOfflinePreferred = !navigator.onLine || new URLSearchParams(window.location.search).get("offline") === "1";

  if (isOfflinePreferred) {
    await import("./app-offline.js");
    return;
  }

  try {
    await import("./app.js");
  } catch (error) {
    console.warn("Ana uygulama yüklenemedi, offline moda geçiliyor:", error);
    await import("./app-offline.js");
  }
}

boot();
