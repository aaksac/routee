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

function sendReset(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return Promise.reject({ code: "auth/missing-email" });
  }

  return sendPasswordResetEmail(auth, normalizedEmail);
}

async function getUserClaims(user) {
  if (!user) return {};
  const tokenResult = await getIdTokenResult(user);
  return tokenResult.claims || {};
}

export { login, register, logout, watchAuth, sendReset, getUserClaims };
