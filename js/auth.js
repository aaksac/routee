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
  return sendPasswordResetEmail(auth, email, {
    url: buildContinueUrl(),
    handleCodeInApp: false
  });
}

async function getUserClaims(user) {
  if (!user) return {};
  const tokenResult = await getIdTokenResult(user);
  return tokenResult.claims || {};
}

export { login, register, logout, watchAuth, sendReset, getUserClaims };
