(function () {
  "use strict";

  var STATUS_COLOR = "#0f172a";
  var APPLE_STATUS_STYLE = "black-translucent";
  var STYLE_ID = "routee-statusbar-minimal-fix-style";

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

  function installMinimalStatusStyle() {
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

/* Sayfanın ana arka planı uygulamanın kendi rengi olarak kalır.
   Böylece ilk açılışta altta lacivert blok görünmez. */
html {
  background-color: ${STATUS_COLOR} !important;
  color-scheme: light only !important;
}

body {
  background-color: var(--bg, #f4f7fb) !important;
}

/* Önceki yüksek z-index'li status bar katmanı ikonların üstüne biniyordu.
   Bunu tamamen kapatıyoruz. */
html::before,
body::before {
  content: none !important;
  display: none !important;
}

/* Üst sistem alanı iPhone'da beyaza dönmesin diye yalnızca çok ince,
   içerik üstüne binmeyen ve tıklamayı engellemeyen arka plan katmanı. */
.routee-status-safe-bg {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  height: var(--routee-safe-top);
  background: ${STATUS_COLOR};
  pointer-events: none;
  z-index: 1;
}

/* Topbar, rota ikonu ve premium yazısı her zaman üstte kalır. */
.topbar,
.status-strip,
.brand-area,
.brand-icon,
.brand-icon img,
.brand-icon svg {
  position: relative;
}

.topbar {
  z-index: 50;
}

.status-strip {
  z-index: 2;
}

.brand-area,
.brand-icon,
.brand-icon img,
.brand-icon svg {
  z-index: 3;
}

.brand-icon {
  overflow: visible !important;
  flex-shrink: 0 !important;
}

/* Harita Listelerim paneli mobilde çok yukarı yapışmasın.
   Splash, giriş ve harita işlevlerine dokunmaz. */
@media (max-width: 720px) {
  .screen-overlay-panel {
    margin-top: calc(64px + var(--routee-safe-top)) !important;
    max-height: calc(100svh - 96px - var(--routee-safe-top)) !important;
  }
}

@media (max-width: 480px) {
  .screen-overlay-panel {
    margin-top: calc(58px + var(--routee-safe-top)) !important;
    max-height: calc(100svh - 88px - var(--routee-safe-top)) !important;
  }
}
`;

    if (style.parentNode && style.parentNode.lastElementChild !== style) {
      document.head.appendChild(style);
    }
  }

  function ensureSafeBgElement() {
    if (!document.body) return;

    var safeBg = document.getElementById("routeeStatusSafeBg");

    if (!safeBg) {
      safeBg = document.createElement("div");
      safeBg.id = "routeeStatusSafeBg";
      safeBg.className = "routee-status-safe-bg";
      safeBg.setAttribute("aria-hidden", "true");
      document.body.insertBefore(safeBg, document.body.firstChild);
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

    installMinimalStatusStyle();
    ensureSafeBgElement();
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
})();
