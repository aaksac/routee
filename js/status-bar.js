(function () {
  "use strict";

  var STATUS_COLOR = "#0f172a";
  var APPLE_STATUS_STYLE = "black-translucent";
  var STYLE_ID = "routee-ios-statusbar-stable-style";

  function upsertMeta(name, content) {
    var meta = document.querySelector('meta[name="' + name + '"]');

    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", name);
      document.head.appendChild(meta);
    }

    if (meta.getAttribute("content") !== content) {
      meta.setAttribute("content", content);
    }

    return meta;
  }

  function installStableStatusStyle() {
    if (!document.head) return;

    var style = document.getElementById(STYLE_ID);

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
:root {
  --routee-statusbar-color: ${STATUS_COLOR};
  --routee-safe-top: env(safe-area-inset-top, 0px);
  --routee-safe-bottom: env(safe-area-inset-bottom, 0px);
}

@supports (padding-top: constant(safe-area-inset-top)) {
  :root {
    --routee-safe-top: constant(safe-area-inset-top);
    --routee-safe-bottom: constant(safe-area-inset-bottom);
  }
}

html {
  background-color: var(--routee-statusbar-color) !important;
  color-scheme: light only !important;
  overflow-x: hidden !important;
}

body {
  min-height: 100vh !important;
  min-height: 100svh !important;
  overflow-x: hidden !important;
  background:
    linear-gradient(
      to bottom,
      var(--routee-statusbar-color) 0,
      var(--routee-statusbar-color) var(--routee-safe-top),
      var(--bg, #f8fafc) var(--routee-safe-top),
      var(--bg, #f8fafc) 100%
    ) !important;
}

/* Eski status-bar katmanını kapatır.
   Rota ikonu ve premium yazısı üstten kesilmez. */
html::before,
body::before {
  content: none !important;
  display: none !important;
}

/* Topbar safe-area kadar aşağı iner.
   Üst ince alan Odakla butonu renginde kalır. */
.topbar {
  padding-top: calc(18px + var(--routee-safe-top)) !important;
  background:
    linear-gradient(
      to bottom,
      var(--routee-statusbar-color) 0,
      var(--routee-statusbar-color) var(--routee-safe-top),
      rgba(255, 255, 255, 0.94) var(--routee-safe-top),
      rgba(255, 255, 255, 0.94) 100%
    ) !important;
  box-sizing: border-box !important;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}

@media (max-width: 720px) {
  .topbar {
    padding-top: calc(12px + var(--routee-safe-top)) !important;
  }
}

@media (max-width: 480px) {
  .topbar {
    padding-top: calc(10px + var(--routee-safe-top)) !important;
  }
}

.brand-area,
.brand-icon,
.brand-icon img,
.brand-icon svg {
  position: relative !important;
  z-index: 3 !important;
}

.brand-icon {
  overflow: visible !important;
  flex-shrink: 0 !important;
}

.status-strip {
  position: relative !important;
  z-index: 2 !important;
}

/* Splash ekranı sabitlenir:
   iPhone viewport değişiminde yukarı-aşağı zıplamaz. */
.startup-splash,
.app-startup-splash,
#startupSplash,
#appStartupSplash,
.loading-splash,
.splash-screen {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100svh !important;
  min-height: 100svh !important;
  display: grid !important;
  place-items: center !important;
  padding:
    calc(24px + var(--routee-safe-top))
    max(20px, env(safe-area-inset-right, 0px))
    calc(24px + var(--routee-safe-bottom))
    max(20px, env(safe-area-inset-left, 0px)) !important;
  box-sizing: border-box !important;
  transform: translate3d(0, 0, 0) !important;
  backface-visibility: hidden !important;
  contain: layout paint size !important;
  overflow: hidden !important;
}

.startup-splash-card,
.app-startup-splash > *,
#startupSplash > *,
#appStartupSplash > *,
.loading-splash > *,
.splash-screen > * {
  max-width: min(92vw, 420px) !important;
  transform: translate3d(0, 0, 0) !important;
  backface-visibility: hidden !important;
}

body.auth-booting,
body.show-app-startup-splash,
body.show-login-startup-splash,
body.is-loading,
body.is-auth-loading {
  min-height: 100svh !important;
  overflow: hidden !important;
}

@supports (-webkit-touch-callout: none) {
  html,
  body {
    min-height: -webkit-fill-available !important;
  }

  body {
    -webkit-text-size-adjust: 100% !important;
  }

  .topbar,
  .startup-splash,
  .app-startup-splash,
  #startupSplash,
  #appStartupSplash,
  .loading-splash,
  .splash-screen {
    -webkit-transform: translate3d(0, 0, 0) !important;
  }
}
`;

    if (style.parentNode && style.parentNode.lastElementChild !== style) {
      document.head.appendChild(style);
    }
  }

  function lockStatusBar() {
    upsertMeta("theme-color", STATUS_COLOR);
    upsertMeta("msapplication-navbutton-color", STATUS_COLOR);
    upsertMeta("apple-mobile-web-app-capable", "yes");
    upsertMeta("apple-mobile-web-app-status-bar-style", APPLE_STATUS_STYLE);
    upsertMeta("apple-mobile-web-app-title", "Rota");
    upsertMeta("color-scheme", "light only");

    document.documentElement.style.backgroundColor = STATUS_COLOR;
    document.documentElement.classList.add("routee-statusbar-locked");

    if (document.body) {
      document.body.classList.add("routee-statusbar-locked");
    }

    installStableStatusStyle();
  }

  lockStatusBar();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", lockStatusBar, { passive: true });
  } else {
    lockStatusBar();
  }

  window.addEventListener("pageshow", lockStatusBar, { passive: true });
  window.addEventListener("focus", lockStatusBar, { passive: true });
  document.addEventListener("visibilitychange", lockStatusBar, { passive: true });

  if (window.MutationObserver && document.head) {
    var scheduled = false;

    var observer = new MutationObserver(function () {
      if (scheduled) return;

      scheduled = true;

      window.requestAnimationFrame(function () {
        scheduled = false;
        lockStatusBar();
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
