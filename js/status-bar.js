(function () {
  "use strict";

  var STATUS_COLOR = "#0f172a";
  var APPLE_STATUS_STYLE = "black-translucent";

  function isIOSDevice() {
    var ua = window.navigator.userAgent || "";
    var platform = window.navigator.platform || "";
    return /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  }

  function isStandaloneMode() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }

  function ensureMeta(name, content, extraAttrs) {
    var selector = 'meta[name="' + name + '"]';
    var meta = document.head.querySelector(selector);

    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", name);
      document.head.appendChild(meta);
    }

    if (meta.getAttribute("content") !== content) {
      meta.setAttribute("content", content);
    }

    if (extraAttrs) {
      Object.keys(extraAttrs).forEach(function (key) {
        if (meta.getAttribute(key) !== extraAttrs[key]) {
          meta.setAttribute(key, extraAttrs[key]);
        }
      });
    }

    return meta;
  }

  function normalizeViewportCover() {
    var viewport = document.head.querySelector('meta[name="viewport"]');
    if (!viewport) return;

    var content = viewport.getAttribute("content") || "";
    var parts = content
      .split(",")
      .map(function (part) { return part.trim(); })
      .filter(Boolean);

    function upsert(rule) {
      var key = rule.split("=")[0].trim().toLowerCase();
      var found = false;

      parts = parts.map(function (part) {
        var partKey = part.split("=")[0].trim().toLowerCase();
        if (partKey === key) {
          found = true;
          return rule;
        }
        return part;
      });

      if (!found) parts.push(rule);
    }

    upsert("width=device-width");
    upsert("initial-scale=1");
    upsert("maximum-scale=1");
    upsert("user-scalable=no");
    upsert("viewport-fit=cover");

    var nextContent = parts.join(", ");
    if (viewport.getAttribute("content") !== nextContent) {
      viewport.setAttribute("content", nextContent);
    }
  }

  function applyStatusBarLock() {
    ensureMeta("theme-color", STATUS_COLOR);
    ensureMeta("msapplication-navbutton-color", STATUS_COLOR);
    ensureMeta("apple-mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-status-bar-style", APPLE_STATUS_STYLE);
    ensureMeta("apple-mobile-web-app-title", "Rota");
    ensureMeta("color-scheme", "light only");
    normalizeViewportCover();

    var root = document.documentElement;
    root.classList.add("routee-statusbar-locked");
    root.style.setProperty("--routee-system-status-bg", STATUS_COLOR);
    root.style.setProperty("background-color", STATUS_COLOR, "important");

    if (isIOSDevice()) {
      root.classList.add("routee-ios");
    }

    if (document.body) {
      document.body.classList.add("routee-statusbar-locked");
      document.body.style.setProperty("--routee-system-status-bg", STATUS_COLOR);

      if (isIOSDevice()) {
        document.body.classList.add("routee-ios");
      }

      document.body.classList.toggle("routee-ios-standalone", isIOSDevice() && isStandaloneMode());
    }
  }

  applyStatusBarLock();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyStatusBarLock, { once: true });
  } else {
    applyStatusBarLock();
  }

  window.addEventListener("pageshow", applyStatusBarLock);
  window.addEventListener("focus", applyStatusBarLock);
  document.addEventListener("visibilitychange", applyStatusBarLock);

  if (window.matchMedia) {
    try {
      var standaloneQuery = window.matchMedia("(display-mode: standalone)");
      if (standaloneQuery && typeof standaloneQuery.addEventListener === "function") {
        standaloneQuery.addEventListener("change", applyStatusBarLock);
      } else if (standaloneQuery && typeof standaloneQuery.addListener === "function") {
        standaloneQuery.addListener(applyStatusBarLock);
      }
    } catch (error) {
      // Status bar kilidi kritik olmayan bir iyileştirmedir; uygulama akışını kesmemelidir.
    }
  }

  window.RouteeStatusBar = window.RouteeStatusBar || {};
  window.RouteeStatusBar.lock = applyStatusBarLock;

  document.addEventListener("touchstart", applyStatusBarLock, { capture: true, passive: true });
  document.addEventListener("pointerdown", applyStatusBarLock, { capture: true, passive: true });
  document.addEventListener("focusin", applyStatusBarLock, { capture: true, passive: true });
  document.addEventListener("focusout", function () {
    window.requestAnimationFrame(applyStatusBarLock);
    window.setTimeout(applyStatusBarLock, 80);
  }, { capture: true, passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", applyStatusBarLock, { passive: true });
    window.visualViewport.addEventListener("scroll", applyStatusBarLock, { passive: true });
  }

  if (document.head && window.MutationObserver) {
    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        applyStatusBarLock();
      });
    });

    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content", "name", "media"]
    });
  }
})();
