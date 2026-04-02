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

function hasInternetConnection() {
  return navigator.onLine;
}

function ensureOfflineAlert() {
  let alertEl = document.getElementById("offlineAlert");

  if (alertEl) return alertEl;

  alertEl = document.createElement("div");
  alertEl.id = "offlineAlert";
  alertEl.innerHTML = `
    <div class="offline-alert-card">
      <div class="offline-alert-icon">📶</div>
      <div class="offline-alert-content">
        <strong>Bağlantı gerekli</strong>
        <p>Lütfen internet bağlantınızı kontrol edin ve tekrar deneyin.</p>
      </div>
      <button type="button" class="offline-alert-close" aria-label="Kapat">×</button>
    </div>
  `;

  Object.assign(alertEl.style, {
    position: "fixed",
    left: "16px",
    right: "16px",
    bottom: "20px",
    zIndex: "9999",
    display: "none"
  });

  const card = alertEl.querySelector(".offline-alert-card");
  Object.assign(card.style, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    background: "rgba(15, 23, 42, 0.96)",
    color: "#fff",
    borderRadius: "16px",
    padding: "14px 16px",
    boxShadow: "0 14px 35px rgba(0,0,0,.22)",
    backdropFilter: "blur(10px)"
  });

  const icon = alertEl.querySelector(".offline-alert-icon");
  Object.assign(icon.style, {
    fontSize: "24px",
    flexShrink: "0"
  });

  const content = alertEl.querySelector(".offline-alert-content");
  Object.assign(content.style, {
    flex: "1"
  });

  const title = content.querySelector("strong");
  Object.assign(title.style, {
    display: "block",
    fontSize: "15px",
    marginBottom: "4px"
  });

  const text = content.querySelector("p");
  Object.assign(text.style, {
    margin: "0",
    fontSize: "13px",
    lineHeight: "1.4",
    opacity: "0.92"
  });

  const closeBtn = alertEl.querySelector(".offline-alert-close");
  Object.assign(closeBtn.style, {
    border: "none",
    background: "transparent",
    color: "#fff",
    fontSize: "26px",
    cursor: "pointer",
    lineHeight: "1",
    padding: "0 4px",
    flexShrink: "0"
  });

  closeBtn.addEventListener("click", () => {
    alertEl.style.display = "none";
  });

  document.body.appendChild(alertEl);
  return alertEl;
}

function showOfflineAlert() {
  const alertEl = ensureOfflineAlert();
  alertEl.style.display = "block";
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

  if (!hasInternetConnection()) {
    showOfflineAlert();
    return;
  }

  try {
    const result = await login(email, password);
    await ensureUserProfile(result.user.uid, result.user.email);
    elements.authStatus.textContent = "Giriş başarılı.";
    await routeAfterLogin(result.user);
  } catch (error) {
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

  if (!hasInternetConnection()) {
    showOfflineAlert();
    return;
  }

  try {
    const result = await register(email, password);
    await ensureUserProfile(result.user.uid, result.user.email);
    elements.authStatus.textContent = "Kayıt başarılı. 7 günlük deneme hesabı oluşturuldu.";
    await routeAfterLogin(result.user);
  } catch (error) {
    elements.authStatus.textContent = `Kayıt hatası: ${error.message}`;
  }
}

async function handleReset() {
  const email = elements.loginEmail.value.trim();

  if (!email) {
    elements.authStatus.textContent = "Şifre sıfırlama için e-posta gir.";
    return;
  }

  if (!hasInternetConnection()) {
    showOfflineAlert();
    return;
  }

  try {
    await sendReset(email);
    elements.authStatus.textContent = "Şifre sıfırlama maili gönderildi. Maildeki bağlantı yeni sıfırlama sayfasını açacak.";
  } catch (error) {
    elements.authStatus.textContent = `Şifre sıfırlama hatası: ${error.message}`;
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
    elements.authStatus.textContent = "Şifren başarıyla değiştirildi. Yeni şifrenle giriş yapabilirsin.";
  }
}

function initAuthWatcher() {
  watchAuth(async (user) => {
    if (user) {
      await routeAfterLogin(user);
    }
  });
}

function init() {
  bindEvents();
  applyQueryStatus();
  initAuthWatcher();
  ensureOfflineAlert();
  window.addEventListener("offline", showOfflineAlert);
}

document.addEventListener("DOMContentLoaded", init);
