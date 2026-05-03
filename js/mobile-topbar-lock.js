(function () {
  "use strict";

  var MOBILE_QUERY = "(max-width: 720px), (hover: none) and (pointer: coarse)";
  var HEIGHT_VAR = "--routee-mobile-topbar-locked-height";
  var SAFE_TOP_VAR = "--routee-mobile-safe-top-locked";
  var CONTENT_HEIGHT_VAR = "--routee-mobile-topbar-content-height";
  var DEFAULT_CONTENT_HEIGHT = 64;
  var locks = Object.create(null);
  var syncTimer = 0;
  var lastDeadZoneTouchTime = 0;
  var lastDeadZoneTouchHost = null;
  var lastOrientationKey = "";

  function isMobileLike() {
    try {
      if (window.matchMedia && window.matchMedia(MOBILE_QUERY).matches) return true;
    } catch (error) {}

    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent || "");
  }

  function orientationKey() {
    try {
      if (window.matchMedia && window.matchMedia("(orientation: landscape)").matches) {
        return "landscape";
      }
      if (window.matchMedia && window.matchMedia("(orientation: portrait)").matches) {
        return "portrait";
      }
    } catch (error) {}

    var width = Math.ceil(window.innerWidth || document.documentElement.clientWidth || 0);
    var height = Math.ceil(window.innerHeight || document.documentElement.clientHeight || 0);
    return width > height ? "landscape" : "portrait";
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function readPxCustomProperty(name, fallback) {
    try {
      var value = window.getComputedStyle(document.documentElement).getPropertyValue(name);
      var parsed = parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    } catch (error) {}
    return fallback;
  }

  function readContentHeight() {
    return clamp(readPxCustomProperty(CONTENT_HEIGHT_VAR, DEFAULT_CONTENT_HEIGHT), 58, 72);
  }

  function measureCssEnvHeight(value) {
    try {
      if (!document.body) return 0;

      var probe = document.createElement("div");
      probe.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "width:0",
        "height:" + value,
        "visibility:hidden",
        "pointer-events:none",
        "contain:strict",
        "z-index:-1"
      ].join(";");

      document.body.appendChild(probe);
      var height = probe.getBoundingClientRect().height || probe.offsetHeight || 0;
      document.body.removeChild(probe);
      return Number.isFinite(height) ? height : 0;
    } catch (error) {
      return 0;
    }
  }

  function readSafeTop() {
    var safeTop = readPxCustomProperty("--routee-safe-top", NaN);

    if (!Number.isFinite(safeTop)) {
      safeTop = measureCssEnvHeight("env(safe-area-inset-top, 0px)");
    }

    if (!safeTop) {
      safeTop = measureCssEnvHeight("constant(safe-area-inset-top)");
    }

    // iOS Safari can briefly report an exaggerated safe-area value while the address bar,
    // keyboard, or visual viewport is settling. The topbar should never follow that transient
    // value after a location action; it must keep the same visual height until orientation changes.
    return clamp(safeTop || 0, 0, 58);
  }

  function getTopbar() {
    return document.querySelector(".topbar");
  }

  function buildLock() {
    var contentHeight = readContentHeight();

    // Üst barın görsel yüksekliği safe-area değerine bağlanmaz.
    // Safe-area siyah şerit olarak topbar içinde çizildiğinde iPhone/Safari'de
    // Rota/Çıkış Yap alanının üstünde ikinci koyu bant oluşabiliyor.
    // Bu kilit yalnızca beyaz uygulama üst barını sabitler.
    return {
      height: Math.round(contentHeight),
      safeTop: 0
    };
  }

  function applyLock(lock) {
    if (!lock || !lock.height) return;

    var heightValue = lock.height + "px";
    var safeTopValue = lock.safeTop + "px";
    var rootStyle = document.documentElement.style;

    if (rootStyle.getPropertyValue(HEIGHT_VAR) !== heightValue) {
      rootStyle.setProperty(HEIGHT_VAR, heightValue);
    }

    if (rootStyle.getPropertyValue(SAFE_TOP_VAR) !== safeTopValue) {
      rootStyle.setProperty(SAFE_TOP_VAR, safeTopValue);
    }
  }

  function clearLock() {
    var rootStyle = document.documentElement.style;
    if (rootStyle.getPropertyValue(HEIGHT_VAR)) rootStyle.removeProperty(HEIGHT_VAR);
    if (rootStyle.getPropertyValue(SAFE_TOP_VAR)) rootStyle.removeProperty(SAFE_TOP_VAR);
  }

  function syncTopbarLock(options) {
    if (!isMobileLike()) {
      clearLock();
      return;
    }

    if (!getTopbar()) return;

    var key = orientationKey();
    var forceNewMeasurement = options && options.forceNewMeasurement;

    if (key !== lastOrientationKey) {
      lastOrientationKey = key;
      forceNewMeasurement = true;
    }

    if (!locks[key] || forceNewMeasurement) {
      locks[key] = buildLock();
    }

    applyLock(locks[key]);
  }

  function scheduleSync(options, delay) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(function () {
      window.requestAnimationFrame(function () {
        syncTopbarLock(options || null);
      });
    }, delay || 0);
  }

  function isInteractiveTarget(target) {
    if (!target || !target.closest) return false;
    return Boolean(target.closest("button, a, input, textarea, select, label, [role='button'], [role='menuitem'], .gm-style, .pac-container"));
  }

  function findDeadZoneHost(target) {
    if (!target || !target.closest) return null;
    return target.closest(".topbar, .trip-panel-header");
  }

  function preventDeadZoneDoubleTap(event) {
    if (!isMobileLike()) return;

    var host = findDeadZoneHost(event.target);
    if (!host || isInteractiveTarget(event.target)) return;

    var now = Date.now();
    if (host === lastDeadZoneTouchHost && now - lastDeadZoneTouchTime < 380) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      scheduleSync(null, 0);
    }

    lastDeadZoneTouchHost = host;
    lastDeadZoneTouchTime = now;
  }

  function preventDeadZoneDblClick(event) {
    if (!isMobileLike()) return;

    var host = findDeadZoneHost(event.target);
    if (!host || isInteractiveTarget(event.target)) return;

    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    scheduleSync(null, 0);
  }

  function boot() {
    scheduleSync({ forceNewMeasurement: true }, 0);
    scheduleSync(null, 120);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.addEventListener("load", function () { scheduleSync(null, 120); }, { passive: true });
  window.addEventListener("pageshow", function () { scheduleSync(null, 80); }, { passive: true });
  window.addEventListener("resize", function () { scheduleSync(null, 160); }, { passive: true });
  window.addEventListener("orientationchange", function () {
    scheduleSync({ forceNewMeasurement: true }, 260);
    scheduleSync(null, 620);
  }, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () { scheduleSync(null, 160); }, { passive: true });
    window.visualViewport.addEventListener("scroll", function () { scheduleSync(null, 160); }, { passive: true });
  }

  document.addEventListener("touchend", preventDeadZoneDoubleTap, { capture: true, passive: false });
  document.addEventListener("dblclick", preventDeadZoneDblClick, true);

  if (window.MutationObserver) {
    var observer = new MutationObserver(function () { scheduleSync(null, 80); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
  }
})();
