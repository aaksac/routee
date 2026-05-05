(function () {
  "use strict";

  var MOBILE_QUERY = "(max-width: 720px), (hover: none) and (pointer: coarse)";
  var HEIGHT_VAR = "--routee-mobile-topbar-locked-height";
  var CONTENT_HEIGHT_VAR = "--routee-mobile-topbar-content-height";
  var locks = Object.create(null);
  var syncTimer = 0;
  var lastDeadZoneTouchTime = 0;
  var lastDeadZoneTouchHost = null;

  function isMobileLike() {
    try {
      if (window.matchMedia && window.matchMedia(MOBILE_QUERY).matches) return true;
    } catch (error) {}

    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent || "");
  }

  function orientationKey() {
    var width = Math.ceil(window.innerWidth || document.documentElement.clientWidth || 0);
    var height = Math.ceil(window.innerHeight || document.documentElement.clientHeight || 0);

    if (window.visualViewport) {
      width = Math.ceil(Math.max(width, window.visualViewport.width || 0));
      height = Math.ceil(Math.max(height, window.visualViewport.height || 0));
    }

    return width > height ? "landscape" : "portrait";
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function getTopbar() {
    return document.querySelector(".topbar");
  }

  function measureTopbarHeight() {
    var topbar = getTopbar();
    if (!topbar) return 0;

    var rect = topbar.getBoundingClientRect();
    return Math.ceil(rect && rect.height ? rect.height : topbar.offsetHeight || 0);
  }

  function readContentHeight() {
    var value = window.getComputedStyle(document.documentElement).getPropertyValue(CONTENT_HEIGHT_VAR);
    var parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 64;
  }

  function readStableTopbarHeight() {
    var topbar = getTopbar();
    if (!topbar) return 64;

    var contentHeight = clamp(readContentHeight(), 56, 72);
    var styles = window.getComputedStyle(topbar);
    var paddingTop = parseFloat(styles.paddingTop) || 0;
    var paddingBottom = parseFloat(styles.paddingBottom) || 0;

    // iOS/Android'de klavye, çift dokunma veya harita etkileşiminden sonra
    // ölçülen topbar yüksekliği geçici olarak büyüyebiliyor. Kilidi gerçek
    // ölçümden değil, sabit içerik yüksekliği + güvenli üst alandan üretmek
    // üstteki beyaz marka alanının genişlemesini engeller.
    var safeAreaPart = clamp(paddingTop + paddingBottom, 0, 64);
    return Math.round(contentHeight + safeAreaPart);
  }

  function applyLock(height) {
    if (!height) return;
    var nextValue = Math.round(height) + "px";
    if (document.documentElement.style.getPropertyValue(HEIGHT_VAR) !== nextValue) {
      document.documentElement.style.setProperty(HEIGHT_VAR, nextValue);
    }
  }

  function clearLock() {
    if (document.documentElement.style.getPropertyValue(HEIGHT_VAR)) {
      document.documentElement.style.removeProperty(HEIGHT_VAR);
    }
  }

  function syncTopbarLock(options) {
    if (!isMobileLike()) {
      clearLock();
      return;
    }

    var topbar = getTopbar();
    if (!topbar) return;

    var key = orientationKey();
    var forceNewMeasurement = options && options.forceNewMeasurement;

    if (!locks[key] || forceNewMeasurement) {
      var previousValue = document.documentElement.style.getPropertyValue(HEIGHT_VAR);
      clearLock();

      var lockedHeight = readStableTopbarHeight();

      locks[key] = lockedHeight;

      if (previousValue && !forceNewMeasurement && locks[key]) {
        document.documentElement.style.setProperty(HEIGHT_VAR, previousValue);
      }
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
    scheduleSync(null, 260);
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
