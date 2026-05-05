(function () {
  "use strict";

  var ua = window.navigator.userAgent || "";
  var platform = window.navigator.platform || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua) && !isIOS;

  if (!isAndroid) return;

  var root = document.documentElement;
  root.classList.add("routee-android", "routee-android-boot");

  function isInstalledAppMode() {
    try {
      return (window.matchMedia && (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches
      )) || window.navigator.standalone === true;
    } catch (error) {
      return window.navigator.standalone === true;
    }
  }

  function markMode() {
    var installed = isInstalledAppMode();
    root.classList.toggle("routee-android-standalone", installed);
    root.classList.toggle("routee-android-native-surface", installed);

    if (document.body) {
      document.body.classList.add("routee-android");
      document.body.classList.toggle("routee-android-standalone", installed);
      document.body.classList.toggle("routee-android-native-surface", installed);
    }
  }


  var androidInstallServiceWorkerRegistered = false;

  function registerAndroidServiceWorkerForInstall() {
    if (androidInstallServiceWorkerRegistered) return;
    androidInstallServiceWorkerRegistered = true;

    if (!("serviceWorker" in navigator)) return;

    try {
      navigator.serviceWorker.register("./sw.js?v=2026.05.6.501-android-installable", {
        updateViaCache: "none"
      }).catch(function () {
        androidInstallServiceWorkerRegistered = false;
      });
    } catch (error) {
      androidInstallServiceWorkerRegistered = false;
    }
  }

  var lockedAndroidHeight = 0;

  function swapAndroidManifest() {
    var manifest = document.head && document.head.querySelector('link[rel="manifest"]');
    if (manifest && manifest.getAttribute("href") !== "./manifest.android.webmanifest") {
      manifest.setAttribute("href", "./manifest.android.webmanifest");
    }
  }

  function syncAndroidViewport(options) {
    try {
      var resetLock = options && options.resetLock;
      if (resetLock) lockedAndroidHeight = 0;

      var viewport = window.visualViewport;
      var visibleHeight = Math.ceil(
        (viewport && viewport.height) ||
        window.innerHeight ||
        document.documentElement.clientHeight ||
        0
      );
      var height = Math.ceil(Math.max(
        visibleHeight || 0,
        window.innerHeight || 0,
        document.documentElement.clientHeight || 0
      ));
      var fallbackHeight = Math.ceil((window.screen && window.screen.height) || 0);
      var width = Math.ceil(
        (viewport && viewport.width) ||
        window.innerWidth ||
        document.documentElement.clientWidth ||
        0
      );

      if (height > lockedAndroidHeight) {
        lockedAndroidHeight = height;
      }

      if (visibleHeight > 0) {
        root.style.setProperty("--routee-android-visible-height", visibleHeight + "px");
      }
      if (lockedAndroidHeight > 0) {
        root.style.setProperty("--routee-android-app-height", lockedAndroidHeight + "px");
        root.style.setProperty("--routee-visual-height", lockedAndroidHeight + "px");
      } else if (fallbackHeight > 0) {
        root.style.setProperty("--routee-android-app-height", fallbackHeight + "px");
        root.style.setProperty("--routee-visual-height", fallbackHeight + "px");
      }
      if (width > 0) {
        root.style.setProperty("--routee-android-visible-width", width + "px");
        root.style.setProperty("--routee-visual-width", width + "px");
      }
    } catch (error) {}
  }



  var androidZoomGuardInstalled = false;

  function isEditableTarget(target) {
    if (!target || typeof target.closest !== "function") return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
  }

  function isMapGestureTarget(target) {
    if (!target || typeof target.closest !== "function") return false;
    return Boolean(target.closest('#mapCanvas, #mapCanvas *, .gm-style, .gm-style *'));
  }

  function preventAndroidPageZoom(event) {
    if (!event || isMapGestureTarget(event.target)) return;
    if (typeof event.preventDefault === "function") event.preventDefault();
    if (typeof event.stopPropagation === "function") event.stopPropagation();
  }

  function installAndroidPageZoomGuard() {
    if (androidZoomGuardInstalled) return;
    androidZoomGuardInstalled = true;

    var lastSingleTapAt = 0;
    var lastSingleTapTarget = null;

    document.addEventListener("touchmove", function (event) {
      if (!event.touches || event.touches.length < 2) return;
      preventAndroidPageZoom(event);
    }, { passive: false, capture: true });

    document.addEventListener("touchend", function (event) {
      if (!event.changedTouches || event.changedTouches.length !== 1) return;
      if (isMapGestureTarget(event.target) || isEditableTarget(event.target)) {
        lastSingleTapAt = 0;
        lastSingleTapTarget = null;
        return;
      }

      var now = Date.now();
      var sameTarget = lastSingleTapTarget === event.target;
      var isDoubleTap = sameTarget && now - lastSingleTapAt > 0 && now - lastSingleTapAt < 340;

      lastSingleTapAt = now;
      lastSingleTapTarget = event.target;

      if (!isDoubleTap) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      if (typeof event.stopPropagation === "function") event.stopPropagation();

      var active = document.activeElement;
      if (active && active !== document.body && typeof active.blur === "function") {
        try { active.blur(); } catch (error) {}
      }
    }, { passive: false, capture: true });

    ["gesturestart", "gesturechange", "gestureend"].forEach(function (eventName) {
      document.addEventListener(eventName, preventAndroidPageZoom, { passive: false, capture: true });
    });
  }

  function applyAndroidPwaLock() {
    swapAndroidManifest();
    registerAndroidServiceWorkerForInstall();
    markMode();
    syncAndroidViewport();
    installAndroidPageZoomGuard();
  }

  applyAndroidPwaLock();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAndroidPwaLock, { once: true });
  } else {
    applyAndroidPwaLock();
  }

  window.addEventListener("pageshow", applyAndroidPwaLock, { passive: true });
  window.addEventListener("resize", syncAndroidViewport, { passive: true });
  window.addEventListener("orientationchange", function () {
    lockedAndroidHeight = 0;
    window.setTimeout(function () { syncAndroidViewport({ resetLock: true }); applyAndroidPwaLock(); }, 80);
    window.setTimeout(applyAndroidPwaLock, 260);
  }, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncAndroidViewport, { passive: true });
    window.visualViewport.addEventListener("scroll", syncAndroidViewport, { passive: true });
  }

  if (window.matchMedia) {
    ["(display-mode: standalone)", "(display-mode: fullscreen)"].forEach(function (query) {
      try {
        var media = window.matchMedia(query);
        if (media && typeof media.addEventListener === "function") {
          media.addEventListener("change", applyAndroidPwaLock);
        } else if (media && typeof media.addListener === "function") {
          media.addListener(applyAndroidPwaLock);
        }
      } catch (error) {}
    });
  }

  window.RouteeAndroidPwa = window.RouteeAndroidPwa || {};
  window.RouteeAndroidPwa.lock = applyAndroidPwaLock;
})();
