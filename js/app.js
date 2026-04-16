import { logout, watchAuth, getUserClaims } from "./auth.js";
import {
  ensureUserProfile,
  getUserProfile,
  getMaps,
  getMapById,
  saveMap,
  updateMap,
  removeMap,
  TRIAL_LOCATION_QUOTA,
  TRIAL_MAP_ID
} from "./firestore.js";
import {
  initMap,
  addMarker,
  clearMarkers,
  showStartMarker,
  clearStartMarker,
  enableMapClickPicker,
  initPlaceSearch,
  clearDraftMarker,
  clearRouteLines,
  drawRouteSegments,
  focusMapToPoints,
  focusToLocation,
  openInfoForPoint
} from "./map.js";
import { locateAndShowUser } from "./location.js";
import { nearestNeighborRoute } from "./route.js";
import {
  exportToCsv,
  exportToXlsx,
  importFromCsvFile,
  importFromXlsxFile,
  convertImportedRowsToState
} from "./import-export.js";

const state = {
  tripPanelOpen: true,
  activeFloatingPanel: null,
  mapMenuOpen: false,
  points: [],
  totalDistance: 0,
  currentUser: null,
  startPoint: null,
  editingPointId: null,
  selectedMapId: null,
  hasUnsavedChanges: false,
  claims: {},
  profile: null,
  fullAccess: false,
  accessActive: false,
  locationQuota: TRIAL_LOCATION_QUOTA,
  mapQuota: 1,
  lastScrollY: 0,
  appStartupSplash: null
};

const elements = {
  topbar: document.querySelector(".topbar"),
  tripPanel: document.getElementById("tripPanel"),
  btnToggleTripPanel: document.getElementById("btnToggleTripPanel"),
  btnCloseTripPanel: document.getElementById("btnCloseTripPanel"),
  btnTripList: document.getElementById("btnTripList"),
  btnAddPoint: document.getElementById("btnAddPoint"),
  btnAddStartPoint: document.getElementById("btnAddStartPoint"),
  btnClearForm: document.getElementById("btnClearForm"),
  btnCurrentLocation: document.getElementById("btnCurrentLocation"),
  btnSaveMap: document.getElementById("btnSaveMap"),
  btnNewMap: document.getElementById("btnNewMap"),
  btnNewMapInline: document.getElementById("btnNewMapInline"),
  btnNewMapMobile: document.getElementById("btnNewMapMobile"),
  btnLogoutTop: document.getElementById("btnLogoutTop"),
  btnExport: document.getElementById("btnExport"),
  btnImport: document.getElementById("btnImport"),
  exportType: document.getElementById("exportType"),
  importType: document.getElementById("importType"),
  csvFileInput: document.getElementById("csvFileInput"),
  xlsxFileInput: document.getElementById("xlsxFileInput"),
  totalPoints: document.getElementById("totalPoints"),
  totalDistance: document.getElementById("totalDistance"),
  badgeDistance: document.getElementById("badgeDistance"),
  tripList: document.getElementById("tripList"),
  pointName: document.getElementById("pointName"),
  pointLat: document.getElementById("pointLat"),
  pointLng: document.getElementById("pointLng"),
  pointColor: document.getElementById("pointColor"),
  pointColorPalette: document.getElementById("pointColorPalette"),
  startName: document.getElementById("startName"),
  startLat: document.getElementById("startLat"),
  startLng: document.getElementById("startLng"),
  mapName: document.getElementById("mapName"),
  authStatus: document.getElementById("authStatus"),
  mapList: document.getElementById("mapList"),
  placeSearch: document.getElementById("placeSearch"),
  btnOpenStartPanel: document.getElementById("btnOpenStartPanel"),
  btnOpenPointPanel: document.getElementById("btnOpenPointPanel"),
  btnCloseStartPanel: document.getElementById("btnCloseStartPanel"),
  btnClosePointPanel: document.getElementById("btnClosePointPanel"),
  btnToggleMenu: document.getElementById("btnToggleMenu"),
  mapMenu: document.getElementById("mapMenu"),
  btnOpenSavePanel: document.getElementById("btnOpenSavePanel"),
  btnOpenImportExportPanel: document.getElementById("btnOpenImportExportPanel"),
  btnOpenMapListPanel: document.getElementById("btnOpenMapListPanel"),
  btnCloseSavePanel: document.getElementById("btnCloseSavePanel"),
  btnCloseImportExportPanel: document.getElementById("btnCloseImportExportPanel"),
  btnCloseMapListPanel: document.getElementById("btnCloseMapListPanel"),
  savedMapsOverlay: document.getElementById("savedMapsOverlay"),
  savedMapsBackdrop: document.getElementById("savedMapsBackdrop"),
  startPanel: document.getElementById("startPanel"),
  pointPanel: document.getElementById("pointPanel"),
  savePanel: document.getElementById("savePanel"),
  importExportPanel: document.getElementById("importExportPanel"),
  appStartupSplash: document.getElementById("appStartupSplash"),
  appStartupSplashText: document.getElementById("appStartupSplashText"),
  mobileFloatingBackdrop: document.getElementById("mobileFloatingBackdrop")
};

const DEFAULT_POINT_COLOR = "#dc2626";

function goToLogin() {
  window.location.href = "./index.html";
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function hydrateAppStartupSplash() {
  if (!elements.appStartupSplash) return null;

  try {
    if (sessionStorage.getItem("routeeStartupSplash") !== "1") {
      return null;
    }

    const message = sessionStorage.getItem("routeeStartupSplashText");
    const startedAt = Number(sessionStorage.getItem("routeeStartupSplashAt")) || Date.now();

    if (message && elements.appStartupSplashText) {
      elements.appStartupSplashText.textContent = message;
    }

    elements.appStartupSplash.setAttribute("aria-hidden", "false");
    return { startedAt };
  } catch (error) {
    console.warn("Startup splash verisi okunamadı:", error);
    return { startedAt: Date.now() };
  }
}

function clearAppStartupSplashSession() {
  try {
    sessionStorage.removeItem("routeeStartupSplash");
    sessionStorage.removeItem("routeeStartupSplashText");
    sessionStorage.removeItem("routeeStartupSplashAt");
  } catch (error) {
    console.warn("Startup splash session temizliği başarısız:", error);
  }
}

async function closeAppStartupSplash(splashState) {
  if (!splashState || !elements.appStartupSplash) {
    clearAppStartupSplashSession();
    return;
  }

  const elapsed = Date.now() - (splashState.startedAt || Date.now());
  const remaining = Math.max(0, 900 - elapsed);

  if (remaining > 0) {
    await wait(remaining);
  }

  elements.appStartupSplash.classList.remove("is-visible");
  elements.appStartupSplash.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("show-app-startup-splash");
  clearAppStartupSplashSession();
}

function formatKm(value) {
  const num = Number(value) || 0;

  if (num < 1) {
    return `${Math.round(num * 1000)} m`;
  }

  const formatted = Number(num.toFixed(2)).toString();
  return `${formatted} km`;
}

function scrollToMapArea() {
  const mapCanvas = document.getElementById("mapCanvas");
  if (!mapCanvas) return;

  const topbarHeight = elements.topbar?.offsetHeight || 0;
  const extraOffset = 16;
  const rect = mapCanvas.getBoundingClientRect();
  const targetTop = window.scrollY + rect.top - topbarHeight - extraOffset;

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: "smooth"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markDirty() {
  state.hasUnsavedChanges = true;
}

function markClean() {
  state.hasUnsavedChanges = false;
}

function hasMapContent() {
  return Boolean(
    elements.mapName.value.trim() ||
      state.startPoint ||
      state.points.length ||
      elements.startName.value.trim() ||
      elements.startLat.value.trim() ||
      elements.startLng.value.trim() ||
      elements.pointName.value.trim() ||
      elements.pointLat.value.trim() ||
      elements.pointLng.value.trim()
  );
}

function getCurrentLocationCount() {
  return state.points.length + (state.startPoint ? 1 : 0);
}

function getTrialEndsAtMs() {
  return state.profile?.trialEndsAt?.toMillis?.() || 0;
}

function getAccessUntilMs() {
  return state.profile?.accessUntil?.toMillis?.() || 0;
}

function isTrialActive() {
  return getTrialEndsAtMs() > Date.now();
}

function isPremiumAccessActive() {
  if (!state.fullAccess) return false;
  const accessUntil = getAccessUntilMs();
  if (!accessUntil) return true;
  return accessUntil > Date.now();
}

function hasActiveAccess() {
  return isPremiumAccessActive() || isTrialActive();
}

function canReadMapId(mapId) {
  if (isPremiumAccessActive()) return true;
  return mapId === TRIAL_MAP_ID;
}

function canAddMoreLocations(extraCount = 1) {
  if (isPremiumAccessActive()) return true;
  return getCurrentLocationCount() + extraCount <= state.locationQuota;
}

function canSaveAnotherMap() {
  if (isPremiumAccessActive()) return true;

  if (!isTrialActive()) return false;

  if (!state.selectedMapId) {
    return true;
  }

  return state.selectedMapId === TRIAL_MAP_ID;
}

function getAccessStatusText() {
  if (isPremiumAccessActive()) {
    const accessUntil = getAccessUntilMs();
    if (accessUntil) {
      return `Premium Abonelik · Bitiş: ${new Date(accessUntil).toLocaleDateString("tr-TR")}`;
    }
    return "Premium Abonelik";
  }

  if (isTrialActive()) {
    return `Deneme Üyeliği · En fazla ${state.locationQuota} konum · Tek kayıtlı harita`;
  }

  return "Deneme süresi dolmuş";
}

function buildStartPointFromForm() {
  const name = elements.startName.value.trim();
  const lat = elements.startLat.value.trim();
  const lng = elements.startLng.value.trim();

  if (!name || !lat || !lng) return null;

  return {
    id: "start-point",
    name,
    lat: Number(lat),
    lng: Number(lng),
    type: "start"
  };
}

function setStartForm(startPoint) {
  if (!startPoint) {
    elements.startName.value = "";
    elements.startLat.value = "";
    elements.startLng.value = "";
    return;
  }

  elements.startName.value = startPoint.name || "";
  elements.startLat.value = Number(startPoint.lat).toFixed(6);
  elements.startLng.value = Number(startPoint.lng).toFixed(6);
}

function setSelectedPointColor(color = DEFAULT_POINT_COLOR) {
  if (elements.pointColor) {
    elements.pointColor.value = color;
  }

  if (!elements.pointColorPalette) return;

  const buttons = elements.pointColorPalette.querySelectorAll(".marker-color-option");
  buttons.forEach((button) => {
    const isSelected = String(button.dataset.color).toLowerCase() === String(color).toLowerCase();
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
}

function commitStartPoint() {
  if (!hasActiveAccess()) {
    alert("Erişim süreniz dolmuş.");
    return;
  }

  const startPoint = buildStartPointFromForm();

  if (!startPoint) {
    alert("Lütfen başlangıç adı, enlem ve boylam gir.");
    return;
  }

  const addingNewStart = !state.startPoint;
  if (addingNewStart && !canAddMoreLocations(1)) {
    alert(`Başlangıç dahil en fazla ${state.locationQuota} konum eklenebilir.`);
    return;
  }

  state.startPoint = startPoint;

  showStartMarker({
    lat: startPoint.lat,
    lng: startPoint.lng,
    title: startPoint.name,
    pointData: {
      ...startPoint,
      orderLabel: "S"
    },
    onClick: fillPointFormFromMarker
  });

  recomputeRoute();
  markDirty();
  elements.authStatus.textContent = `Başlangıç eklendi: ${startPoint.name}`;
  closeFloatingPanels();
}

function clearStartPoint() {
  state.startPoint = null;
  clearStartMarker();
  clearRouteLines();
  setStartForm(null);
  renderSummary();
  renderTripList();
  recomputeRoute();
  markDirty();
  elements.authStatus.textContent = "Başlangıç kaldırıldı.";
}

function fillStartFormFromMap(lat, lng, suggestedName = "") {
  elements.startLat.value = lat.toFixed(6);
  elements.startLng.value = lng.toFixed(6);

  if (suggestedName) {
    elements.startName.value = suggestedName;
  } else {
    elements.startName.value = "İşaretli Konum";
  }
}

function fillPointFormFromMap(lat, lng, suggestedName = "") {
  elements.pointLat.value = lat.toFixed(6);
  elements.pointLng.value = lng.toFixed(6);

  if (suggestedName) {
    elements.pointName.value = suggestedName;
  } else {
    elements.pointName.value = "İşaretli Konum";
  }
}

function fillBothFormsFromMap(lat, lng, suggestedName = "") {
  fillPointFormFromMap(lat, lng, suggestedName);
  fillStartFormFromMap(lat, lng, suggestedName);
}

function fillPointFormFromMarker(pointData) {
  if (!pointData) return;

  fillBothFormsFromMap(
    Number(pointData.lat),
    Number(pointData.lng),
    pointData.name || ""
  );

  if (pointData.type === "start") {
    state.editingPointId = null;
    setSelectedPointColor(DEFAULT_POINT_COLOR);
    elements.authStatus.textContent = `Başlangıç bilgisi yüklendi: ${pointData.name}`;
    return;
  }

  state.editingPointId = pointData.id;
  setSelectedPointColor(pointData.color || DEFAULT_POINT_COLOR);
  elements.authStatus.textContent = `Nokta düzenleme için yüklendi: ${pointData.name}`;
}

function renderSummary() {
  const pointCount = getCurrentLocationCount();
  elements.totalPoints.textContent = String(pointCount);
  elements.totalDistance.textContent = formatKm(state.totalDistance);
  elements.badgeDistance.textContent = `Toplam: ${formatKm(state.totalDistance)}`;
}

function renderTripList() {
  const startHtml = state.startPoint
    ? `
      <div class="trip-item start">
        <div class="trip-order">S</div>
        <div class="trip-content">
          <strong>${escapeHtml(state.startPoint.name)}</strong>
          <span>Önceki mesafe: —</span>
        </div>
        <div class="trip-actions">
          <button class="tiny-btn" type="button" data-action="directions-start">Yol Tarifi</button>
          <button class="tiny-btn" type="button" data-action="focus-start">Odakla</button>
          <button class="tiny-btn" type="button" data-action="delete-start">Sil</button>
        </div>
      </div>
    `
    : `
      <div class="trip-item start">
        <div class="trip-order">S</div>
        <div class="trip-content">
          <strong>Başlangıç</strong>
          <span>Henüz eklenmedi</span>
        </div>
        <button class="tiny-btn" type="button" disabled>Yol Tarifi</button>
      </div>
    `;

  const pointHtml = state.points
    .map((point, index) => {
      return `
        <div class="trip-item">
          <div class="trip-order">${index + 1}</div>
          <div class="trip-content">
            <strong>${escapeHtml(point.name)}</strong>
            <span>Önceki mesafe: ${formatKm(point.distanceFromPrevious || 0)}</span>
          </div>
          <div class="trip-actions">
            <button class="tiny-btn" type="button" data-action="directions-point" data-id="${point.id}">Yol Tarifi</button>
            <button class="tiny-btn" type="button" data-action="focus-point" data-id="${point.id}">Odakla</button>
            <button class="tiny-btn" type="button" data-action="delete-point" data-id="${point.id}">Sil</button>
          </div>
        </div>
      `;
    })
    .join("");

  elements.tripList.innerHTML = startHtml + pointHtml;
}

function redrawPointMarkers() {
  clearMarkers();

  state.points.forEach((point, index) => {
    addMarker({
      lat: point.lat,
      lng: point.lng,
      title: point.name,
      label: String(index + 1),
      pointData: {
        ...point,
        orderLabel: String(index + 1),
        color: point.color || DEFAULT_POINT_COLOR
      },
      onClick: fillPointFormFromMarker
    });
  });
}

function recomputeRoute() {
  if (!state.startPoint) {
    state.totalDistance = 0;
    clearRouteLines();
    renderSummary();
    renderTripList();
    redrawPointMarkers();
    return;
  }

  if (!state.points.length) {
    state.totalDistance = 0;
    clearRouteLines();
    renderSummary();
    renderTripList();
    redrawPointMarkers();
    return;
  }

  const result = nearestNeighborRoute(state.startPoint, state.points);
  state.points = result.orderedPoints;
  state.totalDistance = result.totalDistance;

  redrawPointMarkers();
  drawRouteSegments(state.startPoint, state.points);
  renderSummary();
  renderTripList();
}

function toggleTripPanel(forceValue) {
  state.tripPanelOpen =
    typeof forceValue === "boolean" ? forceValue : !state.tripPanelOpen;

  elements.tripPanel.classList.toggle("hidden", !state.tripPanelOpen);
}

function clearPointForm() {
  elements.pointName.value = "";
  elements.pointLat.value = "";
  elements.pointLng.value = "";
  state.editingPointId = null;
  setSelectedPointColor(DEFAULT_POINT_COLOR);
}

function bindTapSafe(button, handler) {
  if (!button) return;

  let touchHandled = false;

  button.addEventListener(
    "touchend",
    (event) => {
      touchHandled = true;
      event.preventDefault();

      const active = document.activeElement;
      if (active && active !== document.body && typeof active.blur === "function") {
        active.blur();
      }

      window.setTimeout(() => {
        handler();
      }, 80);
    },
    { passive: false }
  );

  button.addEventListener("click", (event) => {
    if (touchHandled) {
      touchHandled = false;
      event.preventDefault();
      return;
    }

    handler();
  });
}

function addOrUpdatePoint() {
  if (!hasActiveAccess()) {
    alert("Erişim süreniz dolmuş.");
    return;
  }

  const name = elements.pointName.value.trim();
  const lat = elements.pointLat.value.trim();
  const lng = elements.pointLng.value.trim();
  const color = elements.pointColor?.value || DEFAULT_POINT_COLOR;

  if (!name || !lat || !lng) {
    alert("Lütfen nokta adı, enlem ve boylam gir.");
    return;
  }

  if (!state.startPoint) {
    alert("Önce başlangıç noktasını doldur ve Başlangıç Ekle butonuna bas.");
    return;
  }

  const isNewPoint = !state.editingPointId;
  if (isNewPoint && !canAddMoreLocations(1)) {
    alert(`Başlangıç dahil en fazla ${state.locationQuota} konum eklenebilir.`);
    return;
  }

  if (state.editingPointId) {
    state.points = state.points.map((point) =>
      point.id === state.editingPointId
        ? {
            ...point,
            name,
            lat: Number(lat),
            lng: Number(lng),
            color
          }
        : point
    );
  } else {
    state.points.push({
      id: Date.now() + Math.random(),
      name,
      lat: Number(lat),
      lng: Number(lng),
      color,
      distanceFromPrevious: 0,
      type: "point"
    });
  }

  clearDraftMarker();
  clearPointForm();
  recomputeRoute();
  markDirty();
  closeFloatingPanels();
}

function deletePoint(pointId) {
  state.points = state.points.filter((point) => String(point.id) !== String(pointId));
  if (state.editingPointId && String(state.editingPointId) === String(pointId)) {
    clearPointForm();
  }
  recomputeRoute();
  markDirty();
  elements.authStatus.textContent = "Nokta silindi.";
}

function handleMarkerDeleteRequest(event) {
  const pointData = event?.detail?.pointData;
  if (!pointData) return;

  if (pointData.type === "start") {
    clearStartPoint();
    return;
  }

  if (pointData.id == null) return;
  deletePoint(pointData.id);
}

function applyImportedData(startPoint, points) {
  const importedCount = points.length + (startPoint ? 1 : 0);
  if (!isPremiumAccessActive() && importedCount > state.locationQuota) {
    alert(`İçe aktarılan veride başlangıç dahil en fazla ${state.locationQuota} konum olabilir.`);
    return false;
  }

  state.startPoint = startPoint;
  state.points = points;
  state.editingPointId = null;

  setStartForm(startPoint);

  if (startPoint) {
    showStartMarker({
      lat: startPoint.lat,
      lng: startPoint.lng,
      title: startPoint.name,
      pointData: {
        ...startPoint,
        orderLabel: "S"
      },
      onClick: fillPointFormFromMarker
    });
  } else {
    clearStartMarker();
  }

  clearPointForm();
  recomputeRoute();
  markDirty();
  return true;
}

function getMapPayload() {
  return {
    name: elements.mapName.value.trim() || "İsimsiz Harita",
    startPoint: state.startPoint
      ? {
          name: state.startPoint.name,
          lat: state.startPoint.lat,
          lng: state.startPoint.lng
        }
      : null,
    points: state.points.map((point) => ({
      name: point.name,
      lat: point.lat,
      lng: point.lng,
      color: point.color || DEFAULT_POINT_COLOR,
      type: "point"
    })),
    totalDistance: state.totalDistance,
    locationCount: getCurrentLocationCount()
  };
}

async function refreshMapList() {
  if (!state.currentUser) return;
  await loadUserMaps(state.currentUser.uid, isPremiumAccessActive());
}

function resetMapEditor() {
  state.selectedMapId = null;
  state.startPoint = null;
  state.points = [];
  state.totalDistance = 0;
  state.editingPointId = null;

  elements.mapName.value = "";
  setStartForm(null);
  clearPointForm();
  clearStartMarker();
  clearMarkers();
  clearDraftMarker();
  clearRouteLines();

  renderSummary();
  renderTripList();
  markClean();
  elements.authStatus.textContent = `Yeni harita oluşturuluyor. ${getAccessStatusText()}`;
}

async function handleSaveMap() {
  if (!state.currentUser) {
    alert("Önce giriş yapmalısın.");
    return;
  }

  if (!hasActiveAccess()) {
    alert("Deneme süreniz dolmuş ya da erişim süreniz sona ermiş.");
    return;
  }

  const mapName = elements.mapName.value.trim();
  if (!mapName) {
    alert("Lütfen harita adı gir.");
    return;
  }

  if (!state.startPoint) {
    alert("Kaydetmeden önce başlangıç noktası ekle.");
    return;
  }

  if (!canSaveAnotherMap()) {
    alert("Deneme hesabında yalnızca 1 kayıtlı harita hakkı vardır.");
    return;
  }

  if (!isPremiumAccessActive() && getCurrentLocationCount() > state.locationQuota) {
    alert(`Deneme hesabında başlangıç dahil en fazla ${state.locationQuota} konum kaydedilebilir.`);
    return;
  }

  const payload = getMapPayload();

  try {
    if (isPremiumAccessActive()) {
      if (state.selectedMapId) {
        await updateMap(state.currentUser.uid, state.selectedMapId, payload);
        elements.authStatus.textContent = "Harita güncellendi.";
        markClean();
        await refreshMapList();
        closeFloatingPanels();
        return;
      }

      await saveMap(state.currentUser.uid, payload, { fullAccess: true });
      await refreshMapList();
      markClean();
      closeFloatingPanels();
      alert("Haritanız kaydedilmiştir. Harita Listelerim kısmından ulaşabilirsiniz.");
      resetMapEditor();
      return;
    }

    const trialMapId = state.selectedMapId || TRIAL_MAP_ID;

    if (state.selectedMapId) {
      await updateMap(state.currentUser.uid, trialMapId, payload);
    } else {
      await saveMap(
        state.currentUser.uid,
        {
          id: TRIAL_MAP_ID,
          ...payload
        },
        { fullAccess: false }
      );
    }

    await refreshMapList();
    markClean();
    closeFloatingPanels();
    alert("Haritanız kaydedilmiştir. Harita Listelerim kısmından ulaşabilirsiniz.");
    resetMapEditor();
  } catch (error) {
    elements.authStatus.textContent = `Kaydetme hatası: ${error.message}`;
  }
}

async function handleNewMap() {
  if (state.hasUnsavedChanges && hasMapContent()) {
    const confirmed = window.confirm(
      "Kaydedilmemiş değişiklikler silinecektir. Devam etmek istiyor musunuz?"
    );

    if (!confirmed) return;
  }

  resetMapEditor();
}

async function handleDeleteMap(mapId) {
  if (!state.currentUser || !mapId) return;

  const confirmed = window.confirm("Silmek istiyor musunuz?");
  if (!confirmed) return;

  try {
    await removeMap(state.currentUser.uid, mapId);

    if (state.selectedMapId === mapId) {
      resetMapEditor();
    }

    await refreshMapList();
    elements.authStatus.textContent = "Harita silindi.";
  } catch (error) {
    elements.authStatus.textContent = `Silme hatası: ${error.message}`;
  }
}

async function handleMapListClick(event) {
  const deleteBtn = event.target.closest("[data-action='delete-map']");
  if (deleteBtn) {
    const mapId = deleteBtn.dataset.mapId;
    await handleDeleteMap(mapId);
    return;
  }

  const button = event.target.closest(".map-list-item");
  if (!button) return;

  const mapId = button.dataset.mapId;
  if (!mapId || !state.currentUser) return;

  if (!canReadMapId(mapId)) {
    elements.authStatus.textContent = "Bu harita yalnızca premium erişimde görüntülenebilir.";
    return;
  }

  try {
    const mapData = await getMapById(state.currentUser.uid, mapId, {
      fullAccess: isPremiumAccessActive()
    });
    if (!mapData) return;

    state.selectedMapId = mapData.id;
    elements.mapName.value = mapData.name || "";

    const startPoint = mapData.startPoint
      ? {
          id: "start-point",
          name: mapData.startPoint.name,
          lat: Number(mapData.startPoint.lat),
          lng: Number(mapData.startPoint.lng),
          type: "start"
        }
      : null;

    const points = Array.isArray(mapData.points)
      ? mapData.points.map((point) => ({
          id: Date.now() + Math.random(),
          name: point.name,
          lat: Number(point.lat),
          lng: Number(point.lng),
          color: point.color || DEFAULT_POINT_COLOR,
          distanceFromPrevious: 0,
          type: "point"
        }))
      : [];

    const applied = applyImportedData(startPoint, points);
    if (!applied) return;

    focusMapToPoints(startPoint, points);

    markClean();
    elements.authStatus.textContent = `Harita yüklendi: ${mapData.name || "İsimsiz Harita"}`;
    highlightSelectedMap(mapId);
  } catch (error) {
    elements.authStatus.textContent = `Harita yükleme hatası: ${error.message}`;
  }
}

function highlightSelectedMap(mapId) {
  elements.mapList.querySelectorAll(".map-list-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.mapId === String(mapId));
  });
}

function handleExport() {
  const type = elements.exportType?.value || "csv";

  if (type === "xlsx") {
    exportToXlsx("gezi-listesi.xlsx", state.startPoint, state.points);
    elements.authStatus.textContent = "XLSX dışa aktarıldı.";
    return;
  }

  exportToCsv("gezi-listesi.csv", state.startPoint, state.points);
  elements.authStatus.textContent = "CSV dışa aktarıldı.";
}

function handleImport() {
  if (!hasActiveAccess()) {
    alert("Erişim süreniz dolmuş.");
    return;
  }

  const type = elements.importType?.value || "csv";

  if (type === "xlsx") {
    elements.xlsxFileInput?.click();
    return;
  }

  elements.csvFileInput?.click();
}

async function handleCsvFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const rows = await importFromCsvFile(file);
    const { startPoint, points } = convertImportedRowsToState(rows);
    const applied = applyImportedData(startPoint, points);
    if (!applied) return;
    state.selectedMapId = null;
    focusMapToPoints(startPoint, points);
    elements.authStatus.textContent = "CSV içe aktarıldı.";
    closeFloatingPanels();
  } catch (error) {
    elements.authStatus.textContent = `CSV içe aktarma hatası: ${error.message}`;
  } finally {
    event.target.value = "";
  }
}

async function handleXlsxFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const rows = await importFromXlsxFile(file);
    const { startPoint, points } = convertImportedRowsToState(rows);
    const applied = applyImportedData(startPoint, points);
    if (!applied) return;
    state.selectedMapId = null;
    focusMapToPoints(startPoint, points);
    elements.authStatus.textContent = "XLSX içe aktarıldı.";
    closeFloatingPanels();
  } catch (error) {
    elements.authStatus.textContent = `XLSX içe aktarma hatası: ${error.message}`;
  } finally {
    event.target.value = "";
  }
}

async function handleCurrentLocationClick() {
  try {
    await locateAndShowUser();
    elements.authStatus.textContent = "Mevcut konum haritada gösterildi.";
  } catch (error) {
    elements.authStatus.textContent = `Konum alınamadı: ${error.message}`;
  }
}

async function handleLogout() {
  try {
    await logout();
    goToLogin();
  } catch (error) {
    elements.authStatus.textContent = `Çıkış hatası: ${error.message}`;
  }
}

function loadEmptyMapListMessage() {
  elements.mapList.innerHTML = `<div class="map-list-item"><strong>Henüz kayıtlı harita yok</strong></div>`;
}

async function loadUserMaps(uid, fullAccess) {
  try {
    const maps = await getMaps(uid, { fullAccess });

    if (!maps.length) {
      if (!fullAccess && state.selectedMapId && state.selectedMapId !== TRIAL_MAP_ID) {
        resetMapEditor();
      }
      loadEmptyMapListMessage();
      return;
    }

    if (!fullAccess && state.selectedMapId && state.selectedMapId !== TRIAL_MAP_ID) {
      resetMapEditor();
    }

    elements.mapList.innerHTML = maps
      .map(
        (map) => `
          <div class="map-list-row">
            <button class="map-list-item ${state.selectedMapId === map.id ? "active" : ""}" type="button" data-map-id="${map.id}">
              <strong>${escapeHtml(map.name || "İsimsiz Harita")}</strong>
              <span>Toplam mesafe: ${formatKm(map.totalDistance || 0)}</span>
            </button>
            <button class="tiny-btn danger-outline" type="button" data-action="delete-map" data-map-id="${map.id}">
              Sil
            </button>
          </div>
        `
      )
      .join("");
  } catch {
    elements.mapList.innerHTML = `<div class="map-list-item"><strong>Haritalar yüklenemedi</strong></div>`;
  }
}

function handleTripListClick(event) {
  const target = event.target.closest("button");
  if (!target) return;

  const action = target.dataset.action;
  if (!action) return;

  if (action === "delete-point") {
    deletePoint(target.dataset.id);
    return;
  }

  if (action === "delete-start") {
    clearStartPoint();
    return;
  }

  if (action === "focus-start") {
    if (!state.startPoint) return;
    const lat = Number(state.startPoint.lat);
    const lng = Number(state.startPoint.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    fillPointFormFromMarker({
      ...state.startPoint,
      orderLabel: "S"
    });

    scrollToMapArea();
    focusToLocation(lat, lng, 17);

    window.setTimeout(() => {
      openInfoForPoint({
        ...state.startPoint,
        orderLabel: "S"
      });
    }, 180);

    return;
  }

  if (action === "directions-start") {
    if (!state.startPoint) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${state.startPoint.lat},${state.startPoint.lng}`;
    window.location.href = url;
    return;
  }

  if (action === "focus-point") {
    const point = state.points.find((item) => String(item.id) === String(target.dataset.id));
    if (!point) return;

    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const pointIndex = state.points.findIndex(
      (item) => String(item.id) === String(target.dataset.id)
    );

    const pointDataForUi = {
      ...point,
      orderLabel: String(pointIndex + 1),
      color: point.color || DEFAULT_POINT_COLOR
    };

    fillPointFormFromMarker(pointDataForUi);

    scrollToMapArea();
    focusToLocation(lat, lng, 17);

    window.setTimeout(() => {
      openInfoForPoint(pointDataForUi);
    }, 180);

    return;
  }

  if (action === "directions-point") {
    const point = state.points.find((item) => String(item.id) === String(target.dataset.id));
    if (!point) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
    window.location.href = url;
  }
}

function closeMapMenu() {
  state.mapMenuOpen = false;
  elements.mapMenu?.classList.add("hidden");
}

function hasDraftCoordinates() {
  const hasStartCoords =
    elements.startLat?.value.trim() && elements.startLng?.value.trim();

  const hasPointCoords =
    elements.pointLat?.value.trim() && elements.pointLng?.value.trim();

  return Boolean(hasStartCoords || hasPointCoords);
}

function syncMobilePanelState() {
  const isMobile = window.innerWidth <= 720;
  const panelName = state.activeFloatingPanel || "";
  const hasOpenMobilePanel = isMobile && Boolean(panelName);

  document.body.classList.toggle("has-mobile-floating-panel", hasOpenMobilePanel);
  document.body.dataset.mobilePanel = isMobile ? panelName : "";

  if (elements.mobileFloatingBackdrop) {
    elements.mobileFloatingBackdrop.classList.toggle("hidden", !hasOpenMobilePanel);
    elements.mobileFloatingBackdrop.setAttribute("aria-hidden", hasOpenMobilePanel ? "false" : "true");
  }
}

function toggleMapMenu(forceValue) {
  state.mapMenuOpen = typeof forceValue === "boolean" ? forceValue : !state.mapMenuOpen;
  elements.mapMenu?.classList.toggle("hidden", !state.mapMenuOpen);
}

function closeFloatingPanels() {
  [elements.startPanel, elements.pointPanel, elements.savePanel, elements.importExportPanel].forEach((panel) => {
    panel?.classList.add("hidden");
  });
  state.activeFloatingPanel = null;
  syncMobilePanelState();
}

function openFloatingPanel(panelName) {
  const panelMap = {
    start: elements.startPanel,
    point: elements.pointPanel,
    save: elements.savePanel,
    importExport: elements.importExportPanel
  };

  const panel = panelMap[panelName];
  if (!panel) return;

  const isOpen = !panel.classList.contains("hidden");
  closeFloatingPanels();
  closeMapMenu();

  if (!isOpen) {
    panel.classList.remove("hidden");
    state.activeFloatingPanel = panelName;
  }

  syncMobilePanelState();
}

function openSavedMapsOverlay() {
  closeFloatingPanels();
  closeMapMenu();
  elements.savedMapsOverlay?.classList.remove("hidden");
}

function closeSavedMapsOverlay() {
  elements.savedMapsOverlay?.classList.add("hidden");
}

function handleShellClick(event) {
  const insideMenu = event.target.closest(".menu-wrapper");
  const insideFloatingCard = event.target.closest(".floating-card");
  const startTrigger = event.target.closest("#btnOpenStartPanel");
  const pointTrigger = event.target.closest("#btnOpenPointPanel");

  if (!insideMenu && !insideFloatingCard && !startTrigger && !pointTrigger) {
    closeMapMenu();
  }
}

function initMobileTopbarAutoHide() {
  if (!elements.topbar) return;

  state.lastScrollY = window.scrollY || 0;

  window.addEventListener(
    "scroll",
    () => {
      const isMobile = window.innerWidth <= 720;

      if (!isMobile) {
        elements.topbar.classList.remove("is-hidden-on-scroll");
        state.lastScrollY = window.scrollY || 0;
        return;
      }

      const currentY = window.scrollY || 0;
      const delta = currentY - state.lastScrollY;

      if (currentY <= 8) {
        elements.topbar.classList.remove("is-hidden-on-scroll");
        state.lastScrollY = currentY;
        return;
      }

      if (delta > 8) {
        elements.topbar.classList.add("is-hidden-on-scroll");
      } else if (delta < -8) {
        elements.topbar.classList.remove("is-hidden-on-scroll");
      }

      state.lastScrollY = currentY;
    },
    { passive: true }
  );
}

function bindPointColorPalette() {
  if (!elements.pointColorPalette) return;

  elements.pointColorPalette.addEventListener("click", (event) => {
    const button = event.target.closest(".marker-color-option");
    if (!button) return;

    const color = button.dataset.color || DEFAULT_POINT_COLOR;
    setSelectedPointColor(color);
    markDirty();
  });

  setSelectedPointColor(DEFAULT_POINT_COLOR);
}

function bindEvents() {
  elements.btnToggleTripPanel?.addEventListener("click", () => toggleTripPanel());
  elements.btnCloseTripPanel?.addEventListener("click", () => toggleTripPanel(false));
  elements.btnTripList?.addEventListener("click", () => toggleTripPanel());
  bindTapSafe(elements.btnAddPoint, addOrUpdatePoint);
  bindTapSafe(elements.btnAddStartPoint, commitStartPoint);
  elements.btnClearForm?.addEventListener("click", clearPointForm);
  elements.btnCurrentLocation?.addEventListener("click", handleCurrentLocationClick);
  elements.tripList?.addEventListener("click", handleTripListClick);
  window.addEventListener("routee:delete-point-request", handleMarkerDeleteRequest);

  elements.btnExport?.addEventListener("click", handleExport);
  elements.btnImport?.addEventListener("click", handleImport);
  elements.csvFileInput?.addEventListener("change", handleCsvFileChange);
  elements.xlsxFileInput?.addEventListener("change", handleXlsxFileChange);

  elements.btnSaveMap?.addEventListener("click", async () => {
    await handleSaveMap();
  });
  elements.btnNewMap?.addEventListener("click", async () => {
    await handleNewMap();
    closeSavedMapsOverlay();
  });

  elements.btnNewMapInline?.addEventListener("click", async () => {
    await handleNewMap();
    closeFloatingPanels();
    closeMapMenu();
  });

  elements.btnNewMapMobile?.addEventListener("click", async () => {
    await handleNewMap();
    closeFloatingPanels();
    closeMapMenu();
    closeSavedMapsOverlay();
  });

  elements.mapList?.addEventListener("click", async (event) => {
    await handleMapListClick(event);
    const clickedMap = event.target.closest(".map-list-item");
    if (clickedMap && !event.target.closest("[data-action='delete-map']")) {
      closeSavedMapsOverlay();
    }
  });
  elements.btnLogoutTop?.addEventListener("click", handleLogout);

  elements.btnOpenStartPanel?.addEventListener("click", () => {
    if (window.innerWidth <= 720 && !hasDraftCoordinates()) {
      alert("Önce konum seçiniz.");
      return;
    }

    openFloatingPanel("start");
  });

  elements.btnOpenPointPanel?.addEventListener("click", () => {
    if (window.innerWidth <= 720 && !hasDraftCoordinates()) {
      alert("Önce konum seçiniz.");
      return;
    }

    openFloatingPanel("point");
  });

  elements.btnCloseStartPanel?.addEventListener("click", closeFloatingPanels);
  elements.btnClosePointPanel?.addEventListener("click", closeFloatingPanels);
  elements.btnToggleMenu?.addEventListener("click", () => toggleMapMenu());
  elements.btnOpenSavePanel?.addEventListener("click", () => openFloatingPanel("save"));
  elements.btnOpenImportExportPanel?.addEventListener("click", () => openFloatingPanel("importExport"));
  elements.btnOpenMapListPanel?.addEventListener("click", openSavedMapsOverlay);
  elements.btnCloseSavePanel?.addEventListener("click", closeFloatingPanels);
  elements.btnCloseImportExportPanel?.addEventListener("click", closeFloatingPanels);
  elements.btnCloseMapListPanel?.addEventListener("click", closeSavedMapsOverlay);
  elements.savedMapsBackdrop?.addEventListener("click", closeSavedMapsOverlay);
  elements.mobileFloatingBackdrop?.addEventListener("click", closeFloatingPanels);
  document.addEventListener("click", handleShellClick);
  window.addEventListener("resize", syncMobilePanelState);

  elements.mapName?.addEventListener("input", markDirty);
  elements.startName?.addEventListener("input", markDirty);
  elements.startLat?.addEventListener("input", markDirty);
  elements.startLng?.addEventListener("input", markDirty);
  elements.pointName?.addEventListener("input", markDirty);
  elements.pointLat?.addEventListener("input", markDirty);
  elements.pointLng?.addEventListener("input", markDirty);

  bindPointColorPalette();
}

function initMapClickPicker() {
  enableMapClickPicker(({ lat, lng, name }) => {
    if (!hasActiveAccess()) return;
    fillBothFormsFromMap(lat, lng, name || "");
    markDirty();

    if (name) {
      elements.authStatus.textContent = `Haritadan seçim yapıldı: ${name}`;
    } else {
      elements.authStatus.textContent = `Haritadan seçim yapıldı: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  });
}

function initSearchBox() {
  initPlaceSearch(elements.placeSearch, ({ name, lat, lng }) => {
    if (!hasActiveAccess()) return;
    fillBothFormsFromMap(lat, lng, name);
    markDirty();
    elements.authStatus.textContent = `Arama ile yer seçildi: ${name}`;
  });
}

async function loadAccessModel(user) {
  state.claims = await getUserClaims(user);
  state.profile = await getUserProfile(user.uid);
  state.fullAccess = state.claims.fullAccess === true;
  state.locationQuota = state.profile?.locationQuota || TRIAL_LOCATION_QUOTA;
  state.mapQuota = state.profile?.mapQuota || 1;
  state.accessActive = hasActiveAccess();
}

function initAuthWatcher() {
  watchAuth(async (user) => {
    state.currentUser = user;

    try {
      if (user) {
        await ensureUserProfile(user.uid, user.email);
        await loadAccessModel(user);
        elements.authStatus.textContent = `Aktif kullanıcı: ${user.email} · ${getAccessStatusText()}`;
        await loadUserMaps(user.uid, isPremiumAccessActive());
        await closeAppStartupSplash(state.appStartupSplash);
        state.appStartupSplash = null;
      } else {
        await closeAppStartupSplash(state.appStartupSplash);
        state.appStartupSplash = null;
        goToLogin();
      }
    } catch (error) {
      await closeAppStartupSplash(state.appStartupSplash);
      state.appStartupSplash = null;
      elements.authStatus.textContent = `Oturum başlatılamadı: ${error.message}`;
    }
  });
}

function init() {
  state.appStartupSplash = hydrateAppStartupSplash();
  initMap();
  initMapClickPicker();
  initSearchBox();
  renderSummary();
  renderTripList();
  bindEvents();
  initMobileTopbarAutoHide();
  initAuthWatcher();
}

document.addEventListener("DOMContentLoaded", init);
