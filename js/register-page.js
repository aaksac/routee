let authModulePromise = null;
let firestoreModulePromise = null;

const elements = {
  registerForm: document.getElementById("registerForm"),
  registerEmail: document.getElementById("registerEmail"),
  registerPassword: document.getElementById("registerPassword"),
  registerPasswordConfirm: document.getElementById("registerPasswordConfirm"),
  btnCreateAccount: document.getElementById("btnCreateAccount"),
  registerStatus: document.getElementById("registerStatus")
};

function loadAuthModule() {
  if (!authModulePromise) {
    authModulePromise = import("./auth.js");
  }

  return authModulePromise;
}

function loadFirestoreModule() {
  if (!firestoreModulePromise) {
    firestoreModulePromise = import("./firestore.js");
  }

  return firestoreModulePromise;
}

function hasInternetConnection() {
  return navigator.onLine;
}

function setStatus(message, type = "normal") {
  if (!elements.registerStatus) return;

  elements.registerStatus.textContent = message;
  elements.registerStatus.style.display = "block";
  elements.registerStatus.style.width = "100%";
  elements.registerStatus.style.boxSizing = "border-box";
  elements.registerStatus.style.marginTop = "14px";
  elements.registerStatus.style.padding = "12px 14px";
  elements.registerStatus.style.borderRadius = "14px";
  elements.registerStatus.style.fontSize = "14px";
  elements.registerStatus.style.lineHeight = "1.4";

  if (type === "offline") {
    elements.registerStatus.style.background = "rgba(220, 38, 38, 0.10)";
    elements.registerStatus.style.border = "1px solid rgba(220, 38, 38, 0.28)";
    elements.registerStatus.style.color = "#991b1b";
  } else if (type === "success") {
    elements.registerStatus.style.background = "rgba(22, 163, 74, 0.10)";
    elements.registerStatus.style.border = "1px solid rgba(22, 163, 74, 0.28)";
    elements.registerStatus.style.color = "#166534";
  } else {
    elements.registerStatus.style.background = "rgba(15, 23, 42, 0.04)";
    elements.registerStatus.style.border = "1px solid rgba(15, 23, 42, 0.08)";
    elements.registerStatus.style.color = "#334155";
  }
}

function setSubmitDisabled(disabled) {
  if (elements.btnCreateAccount) {
    elements.btnCreateAccount.disabled = disabled;
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

async function routeAfterRegister(user) {
  const { getUserClaims } = await loadAuthModule();
  const claims = await getUserClaims(user, {
    timeoutMs: 800,
    fallbackClaims: {},
    suppressErrors: true
  });
  const isAdmin = claims.adminPanel === true;

  window.location.replace(isAdmin ? "./chooser.html" : "./app.html");
}

async function handleSubmit(event) {
  event.preventDefault();

  const email = elements.registerEmail?.value.trim() || "";
  const password = elements.registerPassword?.value.trim() || "";
  const passwordConfirm = elements.registerPasswordConfirm?.value.trim() || "";

  if (!email || !password || !passwordConfirm) {
    setStatus("E-posta, şifre ve şifre tekrar alanları zorunlu.");
    return;
  }

  if (password.length < 6) {
    setStatus("Şifre en az 6 karakter olmalı.");
    return;
  }

  if (password !== passwordConfirm) {
    setStatus("Girdiğin şifreler aynı değil.");
    return;
  }

  if (!hasInternetConnection()) {
    setStatus("Lütfen internet bağlantınızı kontrol edin.", "offline");
    return;
  }

  setSubmitDisabled(true);
  setStatus("Hesabın oluşturuluyor...");

  try {
    const { register } = await loadAuthModule();
    const { ensureUserProfile } = await loadFirestoreModule();

    const result = await register(email, password);
    await ensureUserProfile(result.user.uid, result.user.email);

    setStatus("Kayıt başarılı. Yönlendiriliyorsun...", "success");
    await routeAfterRegister(result.user);
  } catch (error) {
    setSubmitDisabled(false);

    if (isNetworkLikeError(error) || !hasInternetConnection()) {
      setStatus("Lütfen internet bağlantınızı kontrol edin.", "offline");
      return;
    }

    setStatus(`Kayıt hatası: ${error.message}`);
  }
}

async function init() {
  elements.registerForm?.addEventListener("submit", handleSubmit);

  try {
    const { watchAuth } = await loadAuthModule();

    watchAuth(async (user) => {
      if (!user) return;
      await routeAfterRegister(user);
    });
  } catch (error) {
    setStatus("Kimlik doğrulama hazırlanamadı. Sayfayı yenileyip tekrar dene.");
  }
}

document.addEventListener("DOMContentLoaded", init);
