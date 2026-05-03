(function () {
  "use strict";

  var STATUS_COLOR = "#0f172a";
  var APPLE_STATUS_STYLE = "black-translucent";
  var scheduled = false;

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

  function ensureStatusBarShield() {
    if (!document.body) return;

    var shield = document.getElementById("routee-statusbar-shield");
    if (!shield) {
      shield = document.createElement("div");
      shield.id = "routee-statusbar-shield";
      shield.setAttribute("aria-hidden", "true");
      document.body.insertBefore(shield, document.body.firstChild);
    }

    var style = shield.style;
    style.position = "fixed";
    style.top = "0";
    style.left = "0";
    style.right = "0";
    style.height = "env(safe-area-inset-top, 0px)";
    style.background = STATUS_COLOR;
    style.pointerEvents = "none";
    style.zIndex = "2147483647";
    style.transform = "translateZ(0)";
    style.webkitTransform = "translateZ(0)";
    style.willChange = "transform";
  }

  function applyStatusBarLock() {
    ensureMeta("theme-color", STATUS_COLOR);
    ensureMeta("msapplication-navbutton-color", STATUS_COLOR);
    ensureMeta("apple-mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-status-bar-style", APPLE_STATUS_STYLE);
    ensureMeta("apple-mobile-web-app-title", "Rota");
    ensureMeta("color-scheme", "light only");

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
      ensureStatusBarShield();
    }
  }

  function scheduleStatusBarLock() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      applyStatusBarLock();
    });
  }

  applyStatusBarLock();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyStatusBarLock, { once: true });
  } else {
    applyStatusBarLock();
  }

  ["pageshow", "focus", "resize", "orientationchange", "scroll"].forEach(function (eventName) {
    window.addEventListener(eventName, scheduleStatusBarLock, { passive: true });
  });

  ["visibilitychange", "focusin", "focusout", "touchstart", "touchend", "pointerdown", "pointerup", "click", "input", "change"].forEach(function (eventName) {
    document.addEventListener(eventName, scheduleStatusBarLock, { passive: true, capture: true });
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleStatusBarLock, { passive: true });
    window.visualViewport.addEventListener("scroll", scheduleStatusBarLock, { passive: true });
  }

  if (window.matchMedia) {
    try {
      var standaloneQuery = window.matchMedia("(display-mode: standalone)");
      if (standaloneQuery && typeof standaloneQuery.addEventListener === "function") {
        standaloneQuery.addEventListener("change", scheduleStatusBarLock);
      } else if (standaloneQuery && typeof standaloneQuery.addListener === "function") {
        standaloneQuery.addListener(scheduleStatusBarLock);
      }
    } catch (error) {
      // Status bar kilidi kritik olmayan bir iyileştirmedir; uygulama akışını kesmemelidir.
    }
  }

  if (document.head && window.MutationObserver) {
    var observer = new MutationObserver(scheduleStatusBarLock);

    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content", "name", "media"]
    });
  }
})();
