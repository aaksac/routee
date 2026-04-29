import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  getIdTokenResult
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth, firebaseConfig } from "./firebase-config.js";

function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

function register(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

function logout() {
  return signOut(auth);
}

function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

function createAuthError(code, message, details = null) {
  const error = new Error(message || code || "Auth error");
  error.code = code || "auth/unknown";
  error.details = details;
  return error;
}

function normalizeResetEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function sendResetWithRestApi(email) {
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(firebaseConfig.apiKey)}`;

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requestType: "PASSWORD_RESET",
        email
      })
    });
  } catch (error) {
    throw createAuthError("auth/network-request-failed", "Şifre sıfırlama isteği ağa gönderilemedi.", error);
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const firebaseMessage = String(payload?.error?.message || "").toUpperCase();

    if (firebaseMessage.includes("EMAIL_NOT_FOUND")) {
      throw createAuthError("auth/user-not-found", "Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.", payload);
    }

    if (firebaseMessage.includes("INVALID_EMAIL")) {
      throw createAuthError("auth/invalid-email", "E-posta adresi geçerli değil.", payload);
    }

    if (firebaseMessage.includes("TOO_MANY_ATTEMPTS") || firebaseMessage.includes("TOO_MANY_REQUESTS")) {
      throw createAuthError("auth/too-many-requests", "Çok fazla şifre sıfırlama denemesi yapıldı.", payload);
    }

    if (firebaseMessage.includes("PROJECT_NOT_FOUND") || firebaseMessage.includes("API_KEY")) {
      throw createAuthError("auth/configuration-not-found", "Firebase proje veya API anahtarı ayarı doğrulanamadı.", payload);
    }

    throw createAuthError("auth/password-reset-rest-failed", firebaseMessage || "Şifre sıfırlama maili gönderilemedi.", payload);
  }

  return payload;
}

async function sendReset(email) {
  const normalizedEmail = normalizeResetEmail(email);

  if (!normalizedEmail) {
    throw createAuthError("auth/missing-email", "Şifre sıfırlama için e-posta adresi gerekli.");
  }

  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw createAuthError("auth/invalid-email", "E-posta adresi geçerli görünmüyor.");
  }

  try {
    await sendPasswordResetEmail(auth, normalizedEmail);
    return { provider: "firebase-sdk" };
  } catch (sdkError) {
    console.warn("Firebase SDK şifre sıfırlama başarısız. REST yedek akış deneniyor:", sdkError);
    const restResult = await sendResetWithRestApi(normalizedEmail);
    return { provider: "firebase-rest", restResult };
  }
}

async function getUserClaims(user) {
  if (!user) return {};
  const tokenResult = await getIdTokenResult(user);
  return tokenResult.claims || {};
}

export { login, register, logout, watchAuth, sendReset, getUserClaims };
