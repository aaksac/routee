const elements = {
  loginPage: document.getElementById("loginPage"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  btnLogin: document.getElementById("btnLogin"),
  btnRegister: document.getElementById("btnRegister"),
  btnResetPassword: document.getElementById("btnResetPassword"),
  authStatus: document.getElementById("authStatus"),
  startupSplash: document.getElementById("startupSplash"),
  startupSplashTitle: document.getElementById("startupSplashTitle"),
  startupSplashText: document.getElementById("startupSplashText")
};

let authModulePromise = null;
let authModuleRequestedAt = 0;
let authModuleState = "idle";

let firestoreModulePromise = null;
let firestoreModuleState = "idle";

let isRouting = false;
let bootResolved = false;
let bootFallbackTimer = null;

let initialStatus = {
  message: "Henüz giriş yapılmadı.",
  type: "normal"
};

const STARTUP_SPLASH_MIN_MS = 300;
const AUTH_BOOT_TIMEOUT_MS = 2600;
const STALE_MODULE_RETRY_MS = AUTH_BOOT_TIMEOUT_MS - 100;

function clearAuthModulePromise() {
  authModulePromise = null;
  authModuleRequestedAt = 0;
  authModuleState = "idle";
}

function loadAuthModule(options = {}) {
  const { allowRetryIfStale = false } = options;
  const now = Date.now();

  if (
    allowRetryIfStale &&
    authModuleState === "pending" &&
    authModuleRequestedAt &&
    now - authModuleRequestedAt >= STALE_MODULE_RETRY_MS
  ) {
    clearAuthModulePromise();
  }

  if (!authModulePromise) {
    authModuleRequestedAt = now;
    authModuleState = "pending";

    authModulePromise = import("./auth.js")
      .then((module) => {
        authModuleState = "resolved";
        return module;
      })
      .catch((error) => {
        clearAuthModulePromise();
        throw error;
      });
  }

  return authModulePromise;
}

function clearFirestoreModulePromise() {
  firestoreModulePromise = null;
  firestoreModuleState = "idle";
}

function loadFirestoreModule() {
  if (!firestoreModulePromise) {
    firestoreModuleState = "pending";

    firestoreModulePromise = import("./firestore.js")
      .then((module) => {
        firestoreModuleState = "resolved";
        return module;
      })
      .catch((error) => {
        clearFirestoreModulePromise();
        throw error;
      });
  }

  return firestoreModulePromise;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setButtonsDisabled(disabled) {
  [elements.btnLogin, elements.btnRegister, elements.btnResetPassword].forEach((button) => {
    if (!button) return;
    button.disabled = disabled;
  });
}

function showStartupSplash(title = "Rota", message = "Oturumunuz kontrol ediliyor...") {
  if (!elements.startupSplash) return;

  if (elements.startupSplashTitle) {
    elements.startupSplashTitle.textContent = title;
  }

  if (elements.startupSplashText) {
    elements.startupSplashText.textContent = message;
  }

  document.body.classList.add("auth-booting");
  elements.startupSplash.classList.add("is-visible");
  elements.startupSplash.setAttribute("aria-hidden", "false");
}

function hideStartupSplash() {
  if (!elements.startupSplash) return;
  elements.startupSplash.classList.remove("is-visible");
  elements.startupSplash.setAttribute("aria-hidden", "true");
}

function revealLoginScreen() {
  if (bootResolved || isRouting) return;

  bootResolved = true;
  window.clearTimeout(bootFallbackTimer);

  if (elements.loginPage) {
    elements.loginPage.classList.remove("login-page--hidden");
    elements.loginPage.setAttribute("aria-hidden", "false");
  }

  document.body.classList.remove("auth-booting");
  hideStartupSplash();
  setButtonsDisabled(false);
  setStatus(initialStatus.message, initialStatus.type);
}

function setAppStartupSplash(message = "Haritanız hazırlanıyor...") {
  try {
    sessionStorage.setItem("routeeStartupSplash", "1");
    sessionStorage.setItem("routeeStartupSplashText", message);
    sessionStorage.setItem("routeeStartupSplashAt", String(Date.now()));
  } catch (error) {
    console.warn("Startup splash session yazımı başarısız:", error);
  }
}

function clearAppStartupSplash() {
  try {
    sessionStorage.removeItem("routeeStartupSplash");
    sessionStorage.removeItem("routeeStartupSplashText");
    sessionStorage.removeItem("routeeStartupSplashAt");
  } catch (error) {
    console.warn("Startup splash session temizliği başarısız:", error);
  }
}

function setStatus(message, type = "normal") {
  if (!elements.authStatus) return;

  elements.authStatus.textContent = message;
  elements.authStatus.style.display = "block";
  elements.authStatus.style.width = "100%";
  elements.authStatus.style.boxSizing = "border-box";
  elements.authStatus.style.marginTop = "14px";
  elements.authStatus.style.padding = "12px 14px";
  elements.authStatus.style.borderRadius = "14px";
  elements.authStatus.style.fontSize = "14px";
  elements.authStatus.style.lineHeight = "1.4";

  if (type === "offline") {
    elements.authStatus.style.background = "rgba(220, 38, 38, 0.10)";
    elements.authStatus.style.border = "1px solid rgba(220, 38, 38, 0.28)";
    elements.authStatus.style.color = "#991b1b";
  } else if (type === "success") {
    elements.authStatus.style.background = "rgba(22, 163, 74, 0.10)";
    elements.authStatus.style.border = "1px solid rgba(22, 163, 74, 0.28)";
    elements.authStatus.style.color = "#166534";
  } else {
    elements.authStatus.style.background = "rgba(15, 23, 42, 0.04)";
    elements.authStatus.style.border = "1px solid rgba(15, 23, 42, 0.08)";
    elements.authStatus.style.color = "#334155";
  }
}

function setOfflineStatus() {
  setStatus("Lütfen internet bağlantınızı kontrol edin.", "offline");
}

function hasInternetConnection() {
  return navigator.onLine;
}

function isNetworkLikeError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code.includes("network") ||
    code.includes("unavailable") ||
    code.includes("timeout") ||
    message.includes("network") ||
    message.includes("internet") ||
    message.includes("offline") ||
    message.includes("failed to fetch")
  );
}

async function routeAfterLogin(user, options = {}) {
  if (isRouting) return;

  isRouting = true;
  bootResolved = true;
  window.clearTimeout(bootFallbackTimer);
  setButtonsDisabled(true);

  try {
    const { getUserClaims } = await loadAuthModule({ allowRetryIfStale: true });
    const claims = await getUserClaims(user);
    const isAdmin = claims.adminPanel === true;
    const targetUrl = isAdmin ? "./chooser.html" : "./app.html";

    const splashTitle = isAdmin ? "Yönetim paneli açılıyor" : "Rota";
    const splashMessage = isAdmin
      ? "Yetkileriniz doğrulanıyor..."
      : options.message || "Oturumunuz açılıyor...";

    showStartupSplash(splashTitle, splashMessage);

    if (!isAdmin) {
      setAppStartupSplash("Haritanız hazırlanıyor...");
    } else {
      clearAppStartupSplash();
    }

    const shouldDelay = options.delay !== false;
    if (shouldDelay) {
      await wait(STARTUP_SPLASH_MIN_MS);
    }

    window.location.replace(targetUrl);
  } catch (error) {
    isRouting = false;
    setButtonsDisabled(false);
    clearAppStartupSplash();
    revealLoginScreen();
    throw error;
  }
}

async function handleLogin() {
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value.trim();

  if (!email || !password) {
    setStatus("E-posta ve şifre gerekli.");
    return;
  }

  setButtonsDisabled(true);
  setStatus("Giriş yapılıyor...", "normal");

  if (!hasInternetConnection()) {
    setButtonsDisabled(false);
    setOfflineStatus();
    return;
  }

  try {
    const { login } = await loadAuthModule({ allowRetryIfStale: true });
    const result = await login(email, password);

    setStatus("Giriş başarılı.", "success");
    await routeAfterLogin(result.user, {
      message: "Girişiniz doğrulanıyor..."
    });
  } catch (error) {
    setButtonsDisabled(false);

    if (isNetworkLikeError(error) || !hasInternetConnection()) {
      setOfflineStatus();
      return;
    }

    setStatus(`Giriş hatası: ${error.message}`);
  }
}

async function handleRegister() {
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value.trim();

  if (!email || !password) {
    setStatus("Kayıt için e-posta ve şifre gerekli.");
    return;
  }

  if (password.length < 6) {
    setStatus("Şifre en az 6 karakter olmalı.");
    return;
  }

  setButtonsDisabled(true);
  setStatus("Hesap oluşturuluyor...", "normal");

  if (!hasInternetConnection()) {
    setButtonsDisabled(false);
    setOfflineStatus();
    return;
  }

  try {
    const { register } = await loadAuthModule({ allowRetryIfStale: true });
    const { ensureUserProfile } = await loadFirestoreModule();

    const result = await register(email, password);
    await ensureUserProfile(result.user.uid, result.user.email);

    setStatus("Kayıt başarılı. 7 günlük deneme hesabı oluşturuldu.", "success");
    await routeAfterLogin(result.user, {
      message: "Hesabınız hazırlanıyor..."
    });
  } catch (error) {
    setButtonsDisabled(false);

    if (isNetworkLikeError(error) || !hasInternetConnection()) {
      setOfflineStatus();
      return;
    }

    setStatus(`Kayıt hatası: ${error.message}`);
  }
}

async function handleReset() {
  const email = elements.loginEmail.value.trim();

  if (!email) {
    setStatus("Şifre sıfırlama için e-posta gir.");
    return;
  }

  setButtonsDisabled(true);
  setStatus("Sıfırlama bağlantısı hazırlanıyor...", "normal");

  if (!hasInternetConnection()) {
    setButtonsDisabled(false);
    setOfflineStatus();
    return;
  }

  try {
    const { sendReset } = await loadAuthModule({ allowRetryIfStale: true });
    await sendReset(email);

    setStatus(
      "Şifre sıfırlama maili gönderildi. Maildeki bağlantı yeni sıfırlama sayfasını açacak.",
      "success"
    );
    setButtonsDisabled(false);
  } catch (error) {
    setButtonsDisabled(false);

    if (isNetworkLikeError(error) || !hasInternetConnection()) {
      setOfflineStatus();
      return;
    }

    setStatus(`Şifre sıfırlama hatası: ${error.message}`);
  }
}

async function initAuthWatcher() {
  try {
    const { watchAuth } = await loadAuthModule();

    watchAuth(async (user) => {
      if (user) {
        await routeAfterLogin(user, {
          message: "Oturumunuz açılıyor...",
          delay: false
        });
        return;
      }

      revealLoginScreen();
    });
  } catch {
    revealLoginScreen();
  }
}

function bindEvents() {
  elements.btnLogin?.addEventListener("click", handleLogin);
  elements.btnRegister?.addEventListener("click", handleRegister);
  elements.btnResetPassword?.addEventListener("click", handleReset);
}

function applyQueryStatus() {
  const params = new URLSearchParams(window.location.search);
  const reset = params.get("reset");

  if (reset === "success") {
    initialStatus = {
      message: "Şifren başarıyla değiştirildi. Yeni şifrenle giriş yapabilirsin.",
      type: "success"
    };
    return;
  }

  initialStatus = {
    message: "Henüz giriş yapılmadı.",
    type: "normal"
  };
}

function init() {
  bindEvents();
  applyQueryStatus();
  showStartupSplash("Rota", "Oturumunuz kontrol ediliyor...");
  setButtonsDisabled(true);
  initAuthWatcher();

  bootFallbackTimer = window.setTimeout(() => {
    revealLoginScreen();
  }, AUTH_BOOT_TIMEOUT_MS);

  window.addEventListener("offline", () => {
    if (!bootResolved && !isRouting) {
      revealLoginScreen();
    }
    setOfflineStatus();
  });

  window.addEventListener("online", () => {
    if (bootResolved && !isRouting) {
      setStatus("Bağlantı yeniden kuruldu.");
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
