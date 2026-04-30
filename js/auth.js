import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  getIdTokenResult
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth } from "./firebase-config.js";

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

function buildContinueUrl() {
  return new URL("./index.html?reset=success", window.location.href).toString();
}

function sendReset(email) {
  const normalizedEmail = String(email || "").trim();

  return sendPasswordResetEmail(auth, normalizedEmail, {
    url: buildContinueUrl(),
    handleCodeInApp: false
  });
}

function withTimeoutFallback(promise, timeoutMs, fallbackValue) {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve(fallbackValue), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function getUserClaims(user, options = {}) {
  if (!user) return {};

  const {
    forceRefresh = false,
    timeoutMs = 0,
    fallbackClaims = {},
    suppressErrors = false
  } = options;

  const claimsPromise = getIdTokenResult(user, forceRefresh).then((tokenResult) => {
    return tokenResult.claims || {};
  });

  try {
    return await withTimeoutFallback(claimsPromise, timeoutMs, fallbackClaims);
  } catch (error) {
    if (suppressErrors) return fallbackClaims;
    throw error;
  }
}

export { login, register, logout, watchAuth, sendReset, getUserClaims };
