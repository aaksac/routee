import { logout, watchAuth, getUserClaims } from "./auth.js";

const elements = {
  btnGoApp: document.getElementById("btnGoApp"),
  btnGoAdmin: document.getElementById("btnGoAdmin"),
  btnLogout: document.getElementById("btnLogout"),
  chooserStatus: document.getElementById("chooserStatus")
};

function goLogin() {
  window.location.href = "./index.html";
}

function goApp() {
  window.location.href = "./app.html";
}

function goAdmin() {
  window.location.href = "./admin.html";
}

async function initAuthGuard() {
  watchAuth(async (user) => {
    if (!user) {
      goLogin();
      return;
    }

    const claims = await getUserClaims(user);

    if (claims.adminPanel !== true) {
      goApp();
      return;
    }

    elements.chooserStatus.textContent = `Admin hesabı aktif. Alan seçebilirsiniz.`;
  });
}

function bindEvents() {
  elements.btnGoApp?.addEventListener("click", goApp);
  elements.btnGoAdmin?.addEventListener("click", goAdmin);
  elements.btnLogout?.addEventListener("click", async () => {
    await logout();
    goLogin();
  });
}

function init() {
  bindEvents();
  initAuthGuard();
}

document.addEventListener("DOMContentLoaded", init);