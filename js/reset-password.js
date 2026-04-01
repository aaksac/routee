import {
  checkActionCode,
  confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth } from "./firebase-config.js";

const elements = {
  resetInfo: document.getElementById("resetInfo"),
  resetForm: document.getElementById("resetForm"),
  newPassword: document.getElementById("newPassword"),
  confirmPassword: document.getElementById("confirmPassword")
};

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");
const actionCode = params.get("oobCode");
const DEFAULT_CONTINUE_URL = "./index.html?reset=success";
const continueUrl = getSafeContinueUrl(params.get("continueUrl"));

function setMessage(message, type = "info") {
  elements.resetInfo.textContent = message;
  elements.resetInfo.classList.remove("is-error", "is-success");

  if (type === "error") {
    elements.resetInfo.classList.add("is-error");
  }

  if (type === "success") {
    elements.resetInfo.classList.add("is-success");
  }
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6;
}

function getSafeContinueUrl(rawUrl) {
  if (!rawUrl) return DEFAULT_CONTINUE_URL;

  try {
    const targetUrl = new URL(rawUrl, window.location.origin);

    if (targetUrl.origin !== window.location.origin) {
      return DEFAULT_CONTINUE_URL;
    }

    return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
  } catch (error) {
    return DEFAULT_CONTINUE_URL;
  }
}

async function validateLink() {
  if (mode !== "resetPassword" || !actionCode) {
    setMessage("Bu şifre yenileme bağlantısı geçersiz görünüyor. Lütfen yeniden şifre sıfırlama maili iste.", "error");
    return;
  }

  try {
    await checkActionCode(auth, actionCode);
    setMessage("Bağlantı doğrulandı. Yeni şifreni girip işlemi tamamlayabilirsin.");
    elements.resetForm.hidden = false;
  } catch (error) {
    setMessage("Bu bağlantının süresi dolmuş olabilir veya bağlantı daha önce kullanılmış olabilir. Lütfen uygulamadan yeni bir şifre sıfırlama maili iste.", "error");
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const newPassword = elements.newPassword.value.trim();
  const confirmPassword = elements.confirmPassword.value.trim();

  if (!isValidPassword(newPassword)) {
    setMessage("Yeni şifre en az 6 karakter olmalı.", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    setMessage("Girdiğin şifreler aynı değil.", "error");
    return;
  }

  try {
    await confirmPasswordReset(auth, actionCode, newPassword);
    setMessage("Şifren başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsun.", "success");

    window.setTimeout(() => {
      window.location.href = continueUrl;
    }, 1200);
  } catch (error) {
    setMessage("Şifre güncellenemedi. Bağlantı süresi dolmuş olabilir. Lütfen yeniden şifre sıfırlama maili iste.", "error");
  }
}

function init() {
  elements.resetForm?.addEventListener("submit", handleSubmit);
  validateLink();
}

document.addEventListener("DOMContentLoaded", init);
