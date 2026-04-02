import { login, register, watchAuth, sendReset, getUserClaims } from "./auth.js";
import { ensureUserProfile } from "./firestore.js";

const elements = {
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  btnLogin: document.getElementById("btnLogin"),
  btnRegister: document.getElementById("btnRegister"),
  btnResetPassword: document.getElementById("btnResetPassword"),
  authStatus: document.getElementById("authStatus"),
  offlineAlert: document.getElementById("offlineAlert"),
  offlineAlertClose: document.getElementById("offlineAlertClose")
};

function showOfflineAlert() {
  if (elements.offlineAlert) {
    elements.offlineAlert.style.display = "block";
  }
  if (elements.authStatus) {
    elements.authStatus.textContent = "Lütfen internet bağlantınızı kontrol edin.";
  }
}

function hideOfflineAlert() {
  if (elements.offlineAlert) {
    elements.offlineAlert.style.display = "none";
  }
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

async function hasInternetConnection() {
  if (!navigator.onLine) return false;

  try {
    const response = await fetch("./manifest.webmanifest?check=" + Date.now(), {
      method: "GET",
      cache: "no-store"
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function routeAfterLogin(user) {
  const claims = await getUserClaims(user);

  if (claims.adminPanel === true) {
    window.location.href = "./chooser.html";
    return;
  }

  window.location.href = "./app.html";
}

async function handleLogin() {
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value.trim();

  if (!email || !password) {
    elements.authStatus.textContent = "E-posta ve şifre gerekli.";
    return;
  }

  const online = await hasInternetConnection();
  if (!online) {
    showOfflineAlert();
    return;
  }

  hideOfflineAlert();

  try {
    const result = await login(email, password);
    await ensureUserProfile(result.user.uid, result.user.email);
    elements.authStatus.textContent = "Giriş başarılı.";
    await routeAfterLogin(result.user);
  } catch (error) {
    if (isNetworkLikeError(error) || !(await hasInternetConnection())) {
      showOfflineAlert();
      return;
    }

    elements.authStatus.textContent = `Giriş hatası: ${error.message}`;
  }
}

async function handleRegister() {
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value.trim();

  if (!email || !password) {
    elements.authStatus.textContent = "Kayıt için e-posta ve şifre gerekli.";
    return;
  }

  if (password.length < 6) {
    elements.authStatus.textContent = "Şifre en az 6 karakter olmalı.";
    return;
  }

  const online = await hasInternetConnection();
  if (!online) {
    showOfflineAlert();
    return;
  }

  hideOfflineAlert();

  try {
    const result = await register(email, password);
    await ensureUserProfile(result.user.uid, result.user.email);
    elements.authStatus.textContent = "Kayıt başarılı. 7 günlük deneme hesabı oluşturuldu.";
    await routeAfterLogin(result.user);
  } catch (error) {
    if (isNetworkLikeError(error) || !(await hasInternetConnection())) {
      showOfflineAlert();
      return;
    }

    elements.authStatus.textContent = `Kayıt hatası: ${error.message}`;
  }
}

async function handleReset() {
  const email = elements.loginEmail.value.trim();

  if (!email) {
    elements.authStatus.textContent = "Şifre sıfırlama için e-posta gir.";
    return;
  }

  const online = await hasInternetConnection();
  if (!online) {
    showOfflineAlert();
    return;
  }

  hideOfflineAlert();

  try {
    await sendReset(email);
    elements.authStatus.textContent =
      "Şifre sıfırlama maili gönderildi. Maildeki bağlantı yeni sıfırlama sayfasını açacak.";
  } catch (error) {
    if (isNetworkLikeError(error) || !(await hasInternetConnection())) {
      showOfflineAlert();
      return;
    }

    elements.authStatus.textContent = `Şifre sıfırlama hatası: ${error.message}`;
  }
}

function bindEvents() {
  elements.btnLogin?.addEventListener("click", handleLogin);
  elements.btnRegister?.addEventListener("click", handleRegister);
  elements.btnResetPassword?.addEventListener("click", handleReset);
  elements.offlineAlertClose?.addEventListener("click", hideOfflineAlert);
}

function applyQueryStatus() {
  const params = new URLSearchParams(window.location.search);
  const reset = params.get("reset");

  if (reset === "success") {
    elements.authStatus.textContent = "Şifren başarıyla değiştirildi. Yeni şifrenle giriş yapabilirsin.";
  }
}

function initAuthWatcher() {
  watchAuth(async (user) => {
    if (!user) return;

    if (await hasInternetConnection()) {
      await routeAfterLogin(user);
    }
  });
}

function init() {
  bindEvents();
  applyQueryStatus();
  initAuthWatcher();

  window.addEventListener("offline", showOfflineAlert);
  window.addEventListener("online", hideOfflineAlert);
}

document.addEventListener("DOMContentLoaded", init);
