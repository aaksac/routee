// Rota - mobil ekran yönü kilidi
// Mevcut uygulama işlevlerine dokunmadan, desteklenen cihazlarda dikey ekranı korur.
(function () {
  'use strict';

  var LOCK_TYPE = 'portrait';
  var retryTimer = null;

  function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function canUseOrientationLock() {
    return !!(
      window.screen &&
      window.screen.orientation &&
      typeof window.screen.orientation.lock === 'function'
    );
  }

  function tryLockPortrait() {
    if (!canUseOrientationLock()) return;

    // Android/Chrome PWA'da güçlü çalışır. Normal tarayıcıda sessizce başarısız olabilir.
    try {
      var lockResult = window.screen.orientation.lock(LOCK_TYPE);
      if (lockResult && typeof lockResult.catch === 'function') {
        lockResult.catch(function () {});
      }
    } catch (error) {}
  }

  function scheduleLock() {
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(tryLockPortrait, 250);
  }

  document.addEventListener('DOMContentLoaded', scheduleLock, { once: true });
  window.addEventListener('load', scheduleLock, { once: true });
  window.addEventListener('orientationchange', scheduleLock, { passive: true });
  window.addEventListener('resize', scheduleLock, { passive: true });

  // Bazı mobil tarayıcılarda orientation.lock kullanıcı etkileşiminden sonra izin alır.
  document.addEventListener('pointerdown', scheduleLock, { passive: true });
  document.addEventListener('touchstart', scheduleLock, { passive: true });

  if (isStandaloneMode()) scheduleLock();
})();
