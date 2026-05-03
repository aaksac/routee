(function () {
  "use strict";

  var lastDeadZoneTouchTime = 0;
  var lastDeadZoneTouchHost = null;

  function isPhoneLikeSurface() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) return true;
    } catch (error) {}

    return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent || "") && Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 720;
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
    if (!isPhoneLikeSurface()) return;

    var host = findDeadZoneHost(event.target);
    if (!host || isInteractiveTarget(event.target)) return;

    var now = Date.now();
    if (host === lastDeadZoneTouchHost && now - lastDeadZoneTouchTime < 380) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    }

    lastDeadZoneTouchHost = host;
    lastDeadZoneTouchTime = now;
  }

  function preventDeadZoneDblClick(event) {
    if (!isPhoneLikeSurface()) return;

    var host = findDeadZoneHost(event.target);
    if (!host || isInteractiveTarget(event.target)) return;

    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  }

  document.addEventListener("touchend", preventDeadZoneDoubleTap, { capture: true, passive: false });
  document.addEventListener("dblclick", preventDeadZoneDblClick, true);
})();
