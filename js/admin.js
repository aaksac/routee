import { app } from "./firebase-config.js";
import { logout, watchAuth, getUserClaims } from "./auth.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const functions = getFunctions(app);

const fnListUsers = httpsCallable(functions, "adminListUsers");
const fnCreateUser = httpsCallable(functions, "adminCreateUser");
const fnSetAccess = httpsCallable(functions, "adminSetUserAccess");
const fnDeleteUser = httpsCallable(functions, "adminDeleteUser");

const state = {
  currentUser: null,
  claims: {},
  selectedUser: null,
  users: [],
  filteredUsers: [],
  searchTerm: ""
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
  selectedUserInfo: document.getElementById("selectedUserInfo"),
  userCountBadge: document.getElementById("userCountBadge"),
  userSearchInput: document.getElementById("userSearchInput")
};

function goLogin() {
  window.location.href = "./index.html";
}

function goApp() {
  window.location.href = "./app.html";
}

function formatDate(ms) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("tr-TR");
  } catch {
    return "—";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRoleClass(role) {
  return role === "premium" ? "role-premium" : "role-trial";
}

function updateUserCount() {
  if (elements.userCountBadge) {
    elements.userCountBadge.textContent = String(state.filteredUsers.length);
  }
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
  elements.accessUntilText.value =
    days > 0
      ? formatDate(Date.now() + days * 24 * 60 * 60 * 1000)
      : formatDate(user.accessUntilMs);
}

function renderUsers() {
  updateUserCount();

  if (!state.filteredUsers.length) {
    elements.adminUserList.innerHTML =
      `<div class="admin-empty"><strong>Eşleşen kullanıcı bulunamadı</strong></div>`;
    return;
  }

  elements.adminUserList.innerHTML = state.filteredUsers
    .map((user) => `
      <button
        class="admin-user-card ${state.selectedUser?.uid === user.uid ? "active" : ""}"
        type="button"
        data-uid="${user.uid}"
      >
        <div class="admin-user-main">
          <strong>${escapeHtml(user.email || "E-posta yok")}</strong>
          <div class="admin-user-meta">
            <span class="user-chip ${getRoleClass(user.role || "trial")}">${user.role || "trial"}</span>
            <span class="user-chip">Bitiş: ${formatDate(user.accessUntilMs)}</span>
          </div>
        </div>
      </button>
    `)
    .join("");
}

function applyUserFilter() {
  const term = (state.searchTerm || "").trim().toLocaleLowerCase("tr-TR");

  if (!term) {
    state.filteredUsers = [...state.users];
  } else {
    state.filteredUsers = state.users.filter((user) => {
      const email = (user.email || "").toLocaleLowerCase("tr-TR");
      const role = (user.role || "").toLocaleLowerCase("tr-TR");
      return email.includes(term) || role.includes(term);
    });
  }

  renderUsers();
}

async function loadUsers() {
  try {
    elements.adminStatus.textContent = "Kullanıcılar yükleniyor...";

    if (state.currentUser) {
      await state.currentUser.getIdToken(true);
    }

    const result = await fnListUsers();
    state.users = Array.isArray(result.data?.users) ? result.data.users : [];
    state.users.sort((a, b) => (a.email || "").localeCompare(b.email || "", "tr"));

    if (state.selectedUser) {
      state.selectedUser = state.users.find((u) => u.uid === state.selectedUser.uid) || null;
    }

    applyUserFilter();
    renderSelectedUser();
    elements.adminStatus.textContent = `Kullanıcı listesi güncellendi. Toplam: ${state.users.length}`;
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
    if (state.currentUser) {
      await state.currentUser.getIdToken(true);
    }

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
    if (state.currentUser) {
      await state.currentUser.getIdToken(true);
    }

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
    if (state.currentUser) {
      await state.currentUser.getIdToken(true);
    }

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
    if (state.currentUser) {
      await state.currentUser.getIdToken(true);
    }

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

  elements.userSearchInput?.addEventListener("input", (event) => {
    state.searchTerm = event.target.value || "";
    applyUserFilter();
  });

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
    await user.getIdToken(true);
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
