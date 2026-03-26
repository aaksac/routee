import { logout, watchAuth, getUserClaims } from "./auth.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const functions = getFunctions();

const fnListUsers = httpsCallable(functions, "adminListUsers");
const fnCreateUser = httpsCallable(functions, "adminCreateUser");
const fnSetAccess = httpsCallable(functions, "adminSetUserAccess");
const fnDeleteUser = httpsCallable(functions, "adminDeleteUser");

const state = {
  currentUser: null,
  claims: {},
  selectedUser: null,
  users: []
};

const elements = {
  adminStatus: document.getElementById("adminStatus"),
  adminUserList: document.getElementById("adminUserList"),
  btnRefreshUsers: document.getElementById("btnRefreshUsers"),
  btnCreateUser: document.getElementById("btnCreateUser"),
  btnGrantAccess: document.getElementById("btnGrantAccess"),
  btnSetTrial: document.getElementById("btnSetTrial"),
  btnDeleteUser: document.getElementById("btnDeleteUser"),
  btnLogout: document.getElementById("btnLogout"),
  btnBackApp: document.getElementById("btnBackApp"),
  newUserEmail: document.getElementById("newUserEmail"),
  newUserPassword: document.getElementById("newUserPassword"),
  accessDays: document.getElementById("accessDays"),
  accessUntilText: document.getElementById("accessUntilText"),
  selectedUserInfo: document.getElementById("selectedUserInfo")
};

function goLogin() {
  window.location.href = "./index.html";
}

function goApp() {
  window.location.href = "./app.html";
}

function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("tr-TR");
}

function renderSelectedUser() {
  if (!state.selectedUser) {
    elements.selectedUserInfo.textContent = "Henüz kullanıcı seçilmedi.";
    elements.accessUntilText.value = "";
    return;
  }

  const user = state.selectedUser;
  elements.selectedUserInfo.textContent =
    `${user.email} | role=${user.role || "trial"} | accessUntil=${formatDate(user.accessUntilMs)}`;

  const days = Number(elements.accessDays.value || 0);
  elements.accessUntilText.value = days > 0
    ? formatDate(Date.now() + days * 24 * 60 * 60 * 1000)
    : formatDate(user.accessUntilMs);
}

function renderUsers() {
  if (!state.users.length) {
    elements.adminUserList.innerHTML =
      `<div class="map-list-item"><strong>Kullanıcı bulunamadı</strong></div>`;
    return;
  }

  elements.adminUserList.innerHTML = state.users
    .map(
      (user) => `
        <button class="admin-user-card ${state.selectedUser?.uid === user.uid ? "active" : ""}" type="button" data-uid="${user.uid}">
          <strong>${user.email}</strong>
          <div class="mono">role: ${user.role || "trial"}</div>
          <div class="mono">accessUntil: ${formatDate(user.accessUntilMs)}</div>
        </button>
      `
    )
    .join("");
}

async function loadUsers() {
  try {
    elements.adminStatus.textContent = "Kullanıcılar yükleniyor...";
    const result = await fnListUsers();
    state.users = result.data.users || [];
    renderUsers();
    renderSelectedUser();
    elements.adminStatus.textContent = "Kullanıcı listesi güncellendi.";
  } catch (error) {
    elements.adminStatus.textContent = `Listeleme hatası: ${error.message}`;
  }
}

async function handleCreateUser() {
  const email = elements.newUserEmail.value.trim();
  const password = elements.newUserPassword.value.trim();

  if (!email || !password) {
    elements.adminStatus.textContent = "E-posta ve geçici şifre gir.";
    return;
  }

  try {
    await fnCreateUser({ email, password });
    elements.newUserEmail.value = "";
    elements.newUserPassword.value = "";
    elements.adminStatus.textContent = "Kullanıcı oluşturuldu.";
    await loadUsers();
  } catch (error) {
    elements.adminStatus.textContent = `Kullanıcı oluşturma hatası: ${error.message}`;
  }
}

async function handleGrantAccess() {
  if (!state.selectedUser) {
    elements.adminStatus.textContent = "Önce kullanıcı seç.";
    return;
  }

  const days = Number(elements.accessDays.value || 0);
  if (!days || days < 1) {
    elements.adminStatus.textContent = "Geçerli gün sayısı gir.";
    return;
  }

  try {
    await fnSetAccess({
      uid: state.selectedUser.uid,
      mode: "premium",
      days
    });
    elements.adminStatus.textContent = "Tam erişim verildi.";
    await loadUsers();
  } catch (error) {
    elements.adminStatus.textContent = `Erişim verme hatası: ${error.message}`;
  }
}

async function handleSetTrial() {
  if (!state.selectedUser) {
    elements.adminStatus.textContent = "Önce kullanıcı seç.";
    return;
  }

  try {
    await fnSetAccess({
      uid: state.selectedUser.uid,
      mode: "trial"
    });
    elements.adminStatus.textContent = "Kullanıcı trial yapıldı.";
    await loadUsers();
  } catch (error) {
    elements.adminStatus.textContent = `Trial'a çevirme hatası: ${error.message}`;
  }
}

async function handleDeleteUser() {
  if (!state.selectedUser) {
    elements.adminStatus.textContent = "Önce kullanıcı seç.";
    return;
  }

  const ok = window.confirm(`"${state.selectedUser.email}" kullanıcısını silmek istiyor musunuz?`);
  if (!ok) return;

  try {
    await fnDeleteUser({ uid: state.selectedUser.uid });
    state.selectedUser = null;
    elements.adminStatus.textContent = "Kullanıcı silindi.";
    await loadUsers();
  } catch (error) {
    elements.adminStatus.textContent = `Kullanıcı silme hatası: ${error.message}`;
  }
}

function bindEvents() {
  elements.btnRefreshUsers?.addEventListener("click", loadUsers);
  elements.btnCreateUser?.addEventListener("click", handleCreateUser);
  elements.btnGrantAccess?.addEventListener("click", handleGrantAccess);
  elements.btnSetTrial?.addEventListener("click", handleSetTrial);
  elements.btnDeleteUser?.addEventListener("click", handleDeleteUser);
  elements.btnLogout?.addEventListener("click", async () => {
    await logout();
    goLogin();
  });
  elements.btnBackApp?.addEventListener("click", goApp);
  elements.accessDays?.addEventListener("input", renderSelectedUser);

  elements.adminUserList?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-uid]");
    if (!btn) return;

    state.selectedUser = state.users.find((u) => u.uid === btn.dataset.uid) || null;
    renderUsers();
    renderSelectedUser();
  });
}

function initAuthGuard() {
  watchAuth(async (user) => {
    if (!user) {
      goLogin();
      return;
    }

    state.currentUser = user;
    state.claims = await getUserClaims(user);

    if (state.claims.adminPanel !== true) {
      elements.adminStatus.textContent = "Bu sayfaya erişim yetkiniz yok.";
      setTimeout(goApp, 1200);
      return;
    }

    elements.adminStatus.textContent = `Admin oturumu: ${user.email}`;
    await loadUsers();
  });
}

function init() {
  bindEvents();
  initAuthGuard();
}

document.addEventListener("DOMContentLoaded", init);