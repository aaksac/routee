import { getLocalSession } from "./local-session.js";
import { getLocalMaps, getLocalMapById } from "./local-maps.js";

const session = getLocalSession();

const elements = {
  authStatus: document.getElementById("authStatus"),
  mapCanvas: document.getElementById("mapCanvas"),
  mapList: document.getElementById("mapList"),
  tripList: document.getElementById("tripList"),
  totalPoints: document.getElementById("totalPoints"),
  totalDistance: document.getElementById("totalDistance"),
  badgeDistance: document.getElementById("badgeDistance"),
  mapName: document.getElementById("mapName"),
  savedMapsOverlay: document.getElementById("savedMapsOverlay"),
  savedMapsBackdrop: document.getElementById("savedMapsBackdrop"),
  btnOpenMapListPanel: document.getElementById("btnOpenMapListPanel"),
  btnCloseMapListPanel: document.getElementById("btnCloseMapListPanel"),
  btnNewMap: document.getElementById("btnNewMap"),
  btnNewMapInline: document.getElementById("btnNewMapInline"),
  btnNewMapMobile: document.getElementById("btnNewMapMobile"),
  btnSaveMap: document.getElementById("btnSaveMap"),
  btnImport: document.getElementById("btnImport"),
  btnExport: document.getElementById("btnExport"),
  btnAddPoint: document.getElementById("btnAddPoint"),
  btnAddStartPoint: document.getElementById("btnAddStartPoint"),
  btnCurrentLocation: document.getElementById("btnCurrentLocation"),
  btnLogoutTop: document.getElementById("btnLogoutTop"),
  btnToggleMenu: document.getElementById("btnToggleMenu"),
  mapMenu: document.getElementById("mapMenu")
};

let selectedMapId = null;
let mapMenuOpen = false;

function formatKm(value) {
  const num = Number(value) || 0;
  if (num < 1) return `${Math.round(num * 1000)} m`;
  const formatted = Number(num.toFixed(2)).toString();
  return `${formatted} km`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(text) {
  if (!elements.authStatus) return;
  elements.authStatus.textContent = text;
}

function showOfflineCanvasNotice() {
  if (!elements.mapCanvas) return;
  elements.mapCanvas.innerHTML = `
    <div style="height:100%; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; background:linear-gradient(180deg, rgba(15,23,42,0.02), rgba(15,23,42,0.06));">
      <div style="max-width:520px; width:100%; background:#ffffff; border:1px solid rgba(148,163,184,0.28); border-radius:20px; padding:20px; box-shadow:0 18px 36px rgba(15,23,42,0.10); color:#0f172a;">
        <div style="font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:#1d4ed8; margin-bottom:10px;">Çevrimdışı mod</div>
        <div style="font-size:20px; font-weight:800; margin-bottom:10px;">Canlı harita şu an yüklenemiyor</div>
        <div style="font-size:14px; line-height:1.6; color:#475569;">Daha önce kaydedilmiş haritalarınız ve konum bilgileriniz kullanılabilir durumda. <strong>Harita Listelerim</strong> bölümünden kayıtlı rotaları açabilirsiniz.</div>
      </div>
    </div>
  `;
}

function disableOnlineOnlyButtons() {
  [
    elements.btnSaveMap,
    elements.btnImport,
    elements.btnExport,
    elements.btnAddPoint,
    elements.btnAddStartPoint,
    elements.btnCurrentLocation,
    elements.btnNewMap,
    elements.btnNewMapInline,
    elements.btnNewMapMobile
  ].forEach((button) => {
    if (!button) return;
    button.disabled = true;
    button.style.opacity = "0.55";
    button.title = "Bu işlem çevrimdışı modda kapalıdır";
  });
}

function openSavedMapsOverlay() {
  closeMapMenu();
  elements.savedMapsOverlay?.classList.remove("hidden");
}

function closeSavedMapsOverlay() {
  elements.savedMapsOverlay?.classList.add("hidden");
}

function toggleMapMenu(forceValue) {
  mapMenuOpen = typeof forceValue === "boolean" ? forceValue : !mapMenuOpen;
  elements.mapMenu?.classList.toggle("hidden", !mapMenuOpen);
}

function closeMapMenu() {
  mapMenuOpen = false;
  elements.mapMenu?.classList.add("hidden");
}

function getMaps() {
  if (!session?.uid) return [];
  return getLocalMaps(session.uid);
}

function renderMapList() {
  const maps = getMaps();
  if (!elements.mapList) return;

  if (!maps.length) {
    elements.mapList.innerHTML =
      '<div class="map-list-item"><strong>Çevrimdışı kayıt bulunamadı</strong><span>İnternet varken kaydedilmiş haritalar burada görünür.</span></div>';
    return;
  }

  elements.mapList.innerHTML = maps
    .map(
      (map) => `
        <div class="map-list-row">
          <button class="map-list-item ${selectedMapId === map.id ? "active" : ""}" type="button" data-map-id="${escapeHtml(map.id)}">
            <strong>${escapeHtml(map.name || "İsimsiz Harita")}</strong>
            <span>Toplam mesafe: ${formatKm(map.totalDistance || 0)}</span>
          </button>
        </div>
      `
    )
    .join("");
}

function renderTripList(mapData) {
  if (!elements.tripList) return;

  const startHtml = mapData?.startPoint
    ? `
      <div class="trip-item start">
        <div class="trip-order">S</div>
        <div class="trip-content">
          <strong>${escapeHtml(mapData.startPoint.name)}</strong>
          <span>${Number(mapData.startPoint.lat).toFixed(6)}, ${Number(mapData.startPoint.lng).toFixed(6)}</span>
        </div>
        <button class="tiny-btn" type="button" disabled>Çevrimdışı</button>
      </div>
    `
    : `
      <div class="trip-item start">
        <div class="trip-order">S</div>
        <div class="trip-content">
          <strong>Başlangıç</strong>
          <span>Bu haritada başlangıç noktası yok</span>
        </div>
        <button class="tiny-btn" type="button" disabled>Çevrimdışı</button>
      </div>
    `;

  const points = Array.isArray(mapData?.points) ? mapData.points : [];
  const pointHtml = points
    .map(
      (point, index) => `
        <div class="trip-item">
          <div class="trip-order">${index + 1}</div>
          <div class="trip-content">
            <strong>${escapeHtml(point.name)}</strong>
            <span>${Number(point.lat).toFixed(6)}, ${Number(point.lng).toFixed(6)}</span>
          </div>
          <button class="tiny-btn" type="button" disabled>Çevrimdışı</button>
        </div>
      `
    )
    .join("");

  elements.tripList.innerHTML = startHtml + pointHtml;
}

function renderSummary(mapData) {
  const pointCount =
    Number(mapData?.locationCount) ||
    ((mapData?.points?.length || 0) + (mapData?.startPoint ? 1 : 0));
  const totalDistance = Number(mapData?.totalDistance) || 0;

  if (elements.totalPoints) elements.totalPoints.textContent = String(pointCount);
  if (elements.totalDistance) elements.totalDistance.textContent = formatKm(totalDistance);
  if (elements.badgeDistance) elements.badgeDistance.textContent = `Toplam: ${formatKm(totalDistance)}`;
  if (elements.mapName) elements.mapName.value = mapData?.name || "";
}

function highlightSelectedMap() {
  document.querySelectorAll(".map-list-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.mapId === String(selectedMapId || ""));
  });
}

function loadMap(mapId) {
  if (!session?.uid || !mapId) return;
  const mapData = getLocalMapById(session.uid, mapId);
  if (!mapData) {
    setStatus("Seçilen çevrimdışı harita bulunamadı.");
    return;
  }

  selectedMapId = mapId;
  renderSummary(mapData);
  renderTripList(mapData);
  highlightSelectedMap();
  setStatus(`Çevrimdışı harita açıldı: ${mapData.name || "İsimsiz Harita"}`);
}

function bindEvents() {
  elements.btnToggleMenu?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleMapMenu();
  });

  elements.btnOpenMapListPanel?.addEventListener("click", () => {
    closeMapMenu();
    openSavedMapsOverlay();
  });

  elements.btnCloseMapListPanel?.addEventListener("click", closeSavedMapsOverlay);
  elements.savedMapsBackdrop?.addEventListener("click", closeSavedMapsOverlay);

  elements.mapList?.addEventListener("click", (event) => {
    const button = event.target.closest(".map-list-item");
    if (!button) return;
    loadMap(button.dataset.mapId);
    closeSavedMapsOverlay();
  });

  elements.btnLogoutTop?.addEventListener("click", () => {
    window.location.href = "./index.html";
  });

  document.addEventListener("click", (event) => {
    const insideMenu = event.target.closest(".menu-wrapper");
    if (!insideMenu) {
      closeMapMenu();
    }
  });
}

function init() {
  if (!session?.uid) {
    window.location.href = "./index.html";
    return;
  }

  showOfflineCanvasNotice();
  disableOnlineOnlyButtons();
  bindEvents();
  renderMapList();

  const maps = getMaps();
  if (maps.length) {
    loadMap(maps[0].id);
  } else {
    renderSummary(null);
    renderTripList(null);
    setStatus(`Çevrimdışı mod aktif · ${session.email}`);
  }
}

document.addEventListener("DOMContentLoaded", init);
