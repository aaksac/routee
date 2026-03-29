import { logout, watchAuth, getUserClaims } from "./auth.js";
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
