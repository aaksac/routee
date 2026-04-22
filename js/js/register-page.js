const elements = {
  registerEmail: document.getElementById("registerEmail"),
  registerPassword: document.getElementById("registerPassword"),
  registerPasswordAgain: document.getElementById("registerPasswordAgain"),
  btnCreateAccount: document.getElementById("btnCreateAccount"),
  registerStatus: document.getElementById("registerStatus")
};

function setButtonsDisabled(disabled) {
  if (elements.btnCreateAccount) {
    elements.btnCreateAccount.disabled = disabled;
  }
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

async function handleCreateAccount() {
  const email = elements.registerEmail?.value.trim();
  const password = elements.registerPassword?.value || "";
  const passwordAgain = elements.registerPasswordAgain?.value || "";

  if (!email || !password || !passwordAgain) {
    setStatus("E-posta, şifre ve şifre tekrar alanları zorunlu.");
    return;
  }

  if (password.length < 6) {
    setStatus("Şifre en az 6 karakter olmalı.");
    return;
  }

  if (password !== passwordAgain) {
    setStatus("Şifreler aynı değil. Lütfen kontrol edin.");
    return;
  }

  if (!hasInternetConnection()) {
    setStatus("Lütfen internet bağlantınızı kontrol edin.", "offline");
    return;
  }

  setButtonsDisabled(true);
  setStatus("Hesap oluşturuluyor...");

  try {
    const [{ register }, { ensureUserProfile }] = await Promise.all([
      import("./auth.js"),
      import("./firestore.js")
    ]);

    const result = await register(email, password);
    await ensureUserProfile(result.user.uid, result.user.email);

    setStatus("Kayıt başarılı. Giriş sayfasına yönlendiriliyorsunuz.", "success");
    window.setTimeout(() => {
      window.location.href = "./index.html";
    }, 600);
  } catch (error) {
    setButtonsDisabled(false);

    if (isNetworkLikeError(error) || !hasInternetConnection()) {
      setStatus("Lütfen internet bağlantınızı kontrol edin.", "offline");
      return;
    }

    setStatus(`Kayıt hatası: ${error.message}`);
  }
}

function bindEvents() {
  elements.btnCreateAccount?.addEventListener("click", handleCreateAccount);
}

function init() {
  bindEvents();
}

document.addEventListener("DOMContentLoaded", init);
