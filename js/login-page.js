import { login, register, watchAuth, sendReset, getUserClaims } from "./auth.js";
import { ensureUserProfile } from "./firestore.js";

const elements = {
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  btnLogin: document.getElementById("btnLogin"),
  btnRegister: document.getElementById("btnRegister"),
  btnResetPassword: document.getElementById("btnResetPassword"),
  authStatus: document.getElementById("authStatus")
};

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
    setStatus("E-posta ve şifre gerekli.");
    return;
  }

  const online = await hasInternetConnection();
  if (!online) {
    setOfflineStatus();
    return;
  }

  try {
    const result = await login(email, password);
    await ensureUserProfile(result.user.uid, result.user.email);
    setStatus("Giriş başarılı.", "success");
    await routeAfterLogin(result.user);
  } catch (error) {
    if (isNetworkLikeError(error) || !(await hasInternetConnection())) {
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

  const online = await hasInternetConnection();
  if (!online) {
    setOfflineStatus();
    return;
  }

  try {
    const result = await register(email, password);
    await ensureUserProfile(result.user.uid, result.user.email);
    setStatus("Kayıt başarılı. 7 günlük deneme hesabı oluşturuldu.", "success");
    await routeAfterLogin(result.user);
  } catch (error) {
    if (isNetworkLikeError(error) || !(await hasInternetConnection())) {
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

  const online = await hasInternetConnection();
  if (!online) {
    setOfflineStatus();
    return;
  }

  try {
    await sendReset(email);
    setStatus(
      "Şifre sıfırlama maili gönderildi. Maildeki bağlantı yeni sıfırlama sayfasını açacak.",
      "success"
    );
  } catch (error) {
    if (isNetworkLikeError(error) || !(await hasInternetConnection())) {
      setOfflineStatus();
      return;
    }

    setStatus(`Şifre sıfırlama hatası: ${error.message}`);
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
    setStatus("Şifren başarıyla değiştirildi. Yeni şifrenle giriş yapabilirsin.", "success");
  } else {
    setStatus("Henüz giriş yapılmadı.");
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

  window.addEventListener("offline", setOfflineStatus);
  window.addEventListener("online", () => {
    setStatus("Bağlantı yeniden kuruldu.");
  });
}

document.addEventListener("DOMContentLoaded", init);
