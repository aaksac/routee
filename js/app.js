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
  focusMapToPoints
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
  appStartupSplashText: document.getElementById("appStartupSplashText")
};

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

  state.editingPointId = null;
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
    elements.authStatus.textContent = `Başlangıç bilgisi yüklendi: ${pointData.name}`;
    return;
  }

  state.editingPointId = pointData.id;
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
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="tiny-btn" type="button" data-action="directions-start">Yol Tarifi</button>
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
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="tiny-btn" type="button" data-action="directions-point" data-id="${point.id}">Yol Tarifi</button>
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
        orderLabel: String(index + 1)
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
}

function buildPointFromForm() {
  const name = elements.pointName.value.trim();
  const latText = elements.pointLat.value.trim();
  const lngText = elements.pointLng.value.trim();

  if (!name || !latText || !lngText) return null;

  const lat = Number.parseFloat(latText);
  const lng = Number.parseFloat(lngText);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id: state.editingPointId || Date.now() + Math.random(),
    name,
    lat,
    lng,
    distanceFromPrevious: 0,
    type: "point"
  };
}

function addOrUpdatePoint() {
  if (!hasActiveAccess()) {
    alert("Erişim süreniz dolmuş.");
    return;
  }

  const point = buildPointFromForm();

  if (!point) {
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
    state.points = state.points.map((existingPoint) =>
      existingPoint.id === state.editingPointId
        ? {
            ...existingPoint,
            name: point.name,
            lat: point.lat,
            lng: point.lng
          }
        : existingPoint
    );
  } else {
    state.points.push(point);
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

  const loadBtn = event.target.closest("[data-action='load-map']");
  if (!loadBtn) return;

  const mapId = loadBtn.dataset.mapId;
  if (!mapId || !state.currentUser) return;

  if (!canReadMapId(mapId)) {
    alert("Bu haritayı açmak için premium erişim gerekir.");
    return;
  }

  if (state.hasUnsavedChanges && hasMapContent()) {
    const confirmed = window.confirm(
      "Mevcut kaydedilmemiş değişiklikler silinecektir. Haritayı açmak istiyor musunuz?"
    );
    if (!confirmed) return;
  }

  try {
    const mapData = await getMapById(state.currentUser.uid, mapId);
    if (!mapData) {
      elements.authStatus.textContent = "Harita bulunamadı.";
      return;
    }

    state.selectedMapId = mapData.id || mapId;
    elements.mapName.value = mapData.name || "";

    const rawStartPoint = mapData.startPoint
      ? {
          id: "start-point",
          name: mapData.startPoint.name,
          lat: Number(mapData.startPoint.lat),
          lng: Number(mapData.startPoint.lng),
          type: "start"
        }
      : null;

    const rawPoints = Array.isArray(mapData.points)
      ? mapData.points.map((point, index) => ({
          id: point.id || `loaded-${Date.now()}-${index}`,
          name: point.name,
          lat: Number(point.lat),
          lng: Number(point.lng),
          distanceFromPrevious: Number(point.distanceFromPrevious || 0),
          type: "point"
        }))
      : [];

    state.startPoint = rawStartPoint;
    state.points = rawPoints;
    state.editingPointId = null;
    setStartForm(rawStartPoint);

    if (rawStartPoint) {
      showStartMarker({
        lat: rawStartPoint.lat,
        lng: rawStartPoint.lng,
        title: rawStartPoint.name,
        pointData: {
          ...rawStartPoint,
          orderLabel: "S"
        },
        onClick: fillPointFormFromMarker
      });
    } else {
      clearStartMarker();
    }

    clearPointForm();
    recomputeRoute();
    markClean();
    closeSavedMapsOverlay();
    closeFloatingPanels();
    elements.authStatus.textContent = `Harita açıldı: ${mapData.name || "İsimsiz Harita"}`;
  } catch (error) {
    elements.authStatus.textContent = `Harita açma hatası: ${error.message}`;
  }
}

function renderMapList(items) {
  if (!items?.length) {
    elements.mapList.innerHTML = `
      <div class="empty-state">
        Henüz kayıtlı harita yok.
      </div>
    `;
    return;
  }

  elements.mapList.innerHTML = items
    .map((mapItem) => {
      const locked = !canReadMapId(mapItem.id);
      const locationCount = Number(mapItem.locationCount || 0);

      return `
        <div class="saved-map-card">
          <div class="saved-map-head">
            <div>
              <strong>${escapeHtml(mapItem.name || "İsimsiz Harita")}</strong>
              <p>${locationCount} konum</p>
            </div>
            ${locked ? `<span class="saved-map-badge">Kilitli</span>` : ""}
          </div>
          <div class="saved-map-actions">
            <button class="tiny-btn" type="button" data-action="load-map" data-map-id="${mapItem.id}" ${
              locked ? "disabled" : ""
            }>Aç</button>
            <button class="tiny-btn danger" type="button" data-action="delete-map" data-map-id="${mapItem.id}" ${
              locked ? "disabled" : ""
            }>Sil</button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadUserMaps(userId, includeAll = false) {
  if (!userId) return;

  try {
    const maps = await getMaps(userId, { includeAll });
    renderMapList(maps);
  } catch (error) {
    elements.authStatus.textContent = `Harita listesi yüklenemedi: ${error.message}`;
  }
}

function openSavedMapsOverlay() {
  elements.savedMapsOverlay?.classList.remove("hidden");
  document.body.classList.add("overlay-open");
}

function closeSavedMapsOverlay() {
  elements.savedMapsOverlay?.classList.add("hidden");
  document.body.classList.remove("overlay-open");
}

function closeFloatingPanels() {
  state.activeFloatingPanel = null;
  elements.startPanel?.classList.add("hidden");
  elements.pointPanel?.classList.add("hidden");
  elements.savePanel?.classList.add("hidden");
  elements.importExportPanel?.classList.add("hidden");
  document.body.classList.remove("menu-open");
  if (elements.mapMenu) {
    elements.mapMenu.classList.add("hidden");
    state.mapMenuOpen = false;
  }
}

function openFloatingPanel(type) {
  closeFloatingPanels();

  state.activeFloatingPanel = type;

  if (type === "start") {
    elements.startPanel?.classList.remove("hidden");
  }

  if (type === "point") {
    elements.pointPanel?.classList.remove("hidden");
  }

  if (type === "save") {
    elements.savePanel?.classList.remove("hidden");
  }

  if (type === "import-export") {
    elements.importExportPanel?.classList.remove("hidden");
  }
}

function toggleMapMenu(forceValue) {
  state.mapMenuOpen =
    typeof forceValue === "boolean" ? forceValue : !state.mapMenuOpen;

  if (state.mapMenuOpen) {
    document.body.classList.add("menu-open");
    elements.mapMenu?.classList.remove("hidden");
  } else {
    document.body.classList.remove("menu-open");
    elements.mapMenu?.classList.add("hidden");
  }
}

function syncMobilePanelState() {
  const isMobile = window.innerWidth <= 768;
  document.body.classList.toggle("mobile-floating-open", isMobile && !!state.activeFloatingPanel);
}

function initPanelButtons() {
  elements.btnOpenStartPanel?.addEventListener("click", () => {
    openFloatingPanel("start");
    syncMobilePanelState();
  });

  elements.btnOpenPointPanel?.addEventListener("click", () => {
    openFloatingPanel("point");
    syncMobilePanelState();
  });

  elements.btnOpenSavePanel?.addEventListener("click", () => {
    openFloatingPanel("save");
    syncMobilePanelState();
  });

  elements.btnOpenImportExportPanel?.addEventListener("click", () => {
    openFloatingPanel("import-export");
    syncMobilePanelState();
  });

  elements.btnOpenMapListPanel?.addEventListener("click", () => {
    openSavedMapsOverlay();
  });

  elements.btnCloseStartPanel?.addEventListener("click", () => {
    closeFloatingPanels();
    syncMobilePanelState();
  });

  elements.btnClosePointPanel?.addEventListener("click", () => {
    closeFloatingPanels();
    syncMobilePanelState();
  });

  elements.btnCloseSavePanel?.addEventListener("click", () => {
    closeFloatingPanels();
    syncMobilePanelState();
  });

  elements.btnCloseImportExportPanel?.addEventListener("click", () => {
    closeFloatingPanels();
    syncMobilePanelState();
  });

  elements.btnCloseMapListPanel?.addEventListener("click", () => {
    closeSavedMapsOverlay();
  });

  elements.savedMapsBackdrop?.addEventListener("click", () => {
    closeSavedMapsOverlay();
  });

  elements.btnToggleMenu?.addEventListener("click", () => {
    toggleMapMenu();
  });

  document.addEventListener("click", (event) => {
    const menuWrapper = event.target.closest(".menu-wrapper");
    const menuButton = event.target.closest("#btnToggleMenu");

    if (!menuWrapper && !menuButton && state.mapMenuOpen) {
      toggleMapMenu(false);
    }
  });
}

async function handleExport() {
  const exportType = elements.exportType?.value || "csv";

  const exportRows = [];

  if (state.startPoint) {
    exportRows.push({
      type: "start",
      name: state.startPoint.name,
      lat: state.startPoint.lat,
      lng: state.startPoint.lng
    });
  }

  state.points.forEach((point) => {
    exportRows.push({
      type: "point",
      name: point.name,
      lat: point.lat,
      lng: point.lng
    });
  });

  if (!exportRows.length) {
    alert("Dışa aktarım için veri bulunamadı.");
    return;
  }

  const filenameBase = (elements.mapName.value.trim() || "harita").replace(/[^\p{L}\p{N}_-]+/gu, "_");

  if (exportType === "xlsx") {
    exportToXlsx(exportRows, filenameBase);
  } else {
    exportToCsv(exportRows, filenameBase);
  }

  elements.authStatus.textContent = "Dışa aktarma tamamlandı.";
  closeFloatingPanels();
}

function getImportedStartAndPoints(rows) {
  const normalized = convertImportedRowsToState(rows);

  const startPoint = normalized.startPoint
    ? {
        id: "start-point",
        name: normalized.startPoint.name,
        lat: Number(normalized.startPoint.lat),
        lng: Number(normalized.startPoint.lng),
        type: "start"
      }
    : null;

  const points = normalized.points.map((point, index) => ({
    id: point.id || `imported-${Date.now()}-${index}`,
    name: point.name,
    lat: Number(point.lat),
    lng: Number(point.lng),
    distanceFromPrevious: Number(point.distanceFromPrevious || 0),
    type: "point"
  }));

  return { startPoint, points };
}

async function handleImportFile(file, type) {
  if (!file) return;

  try {
    const rows =
      type === "xlsx" ? await importFromXlsxFile(file) : await importFromCsvFile(file);

    const { startPoint, points } = getImportedStartAndPoints(rows);
    const applied = applyImportedData(startPoint, points);

    if (applied) {
      elements.authStatus.textContent = "İçe aktarma tamamlandı.";
      closeFloatingPanels();
    }
  } catch (error) {
    alert(`İçe aktarma hatası: ${error.message}`);
  }
}

function bindImportExportEvents() {
  elements.btnExport?.addEventListener("click", handleExport);

  elements.btnImport?.addEventListener("click", () => {
    const importType = elements.importType?.value || "csv";
    if (importType === "xlsx") {
      elements.xlsxFileInput?.click();
    } else {
      elements.csvFileInput?.click();
    }
  });

  elements.csvFileInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await handleImportFile(file, "csv");
  });

  elements.xlsxFileInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await handleImportFile(file, "xlsx");
  });
}

function hasDraftCoordinates() {
  const lat = elements.pointLat.value.trim();
  const lng = elements.pointLng.value.trim();
  return Boolean(lat && lng);
}

function initMapInteractions() {
  initMap();

  enableMapClickPicker(({ lat, lng, label }) => {
    state.editingPointId = null;
    elements.pointLat.value = Number(lat).toFixed(6);
    elements.pointLng.value = Number(lng).toFixed(6);

    if (!elements.pointName.value.trim()) {
      elements.pointName.value = label || "Seçili Konum";
    }

    elements.authStatus.textContent = "Haritadan konum seçildi.";
    if (window.innerWidth <= 768) {
      syncMobilePanelState();
    }
  });

  initPlaceSearch(elements.placeSearch, ({ name, lat, lng }) => {
    state.editingPointId = null;
    elements.pointName.value = name || "Seçili Konum";
    elements.pointLat.value = Number(lat).toFixed(6);
    elements.pointLng.value = Number(lng).toFixed(6);
    elements.authStatus.textContent = "Konum araması tamamlandı.";
  });

  elements.btnCurrentLocation?.addEventListener("click", async () => {
    try {
      const location = await locateAndShowUser();
      if (!location) return;

      elements.startName.value = location.name || "Mevcut Konum";
      elements.startLat.value = Number(location.lat).toFixed(6);
      elements.startLng.value = Number(location.lng).toFixed(6);
      elements.authStatus.textContent = "Mevcut konum başlangıç alanına eklendi.";
    } catch (error) {
      alert(`Konum alınamadı: ${error.message}`);
    }
  });
}

function initTopbarAutoHide() {
  if (!elements.topbar) return;

  window.addEventListener(
    "scroll",
    () => {
      const currentScrollY = window.scrollY || window.pageYOffset || 0;
      const isMobile = window.innerWidth <= 768;

      if (!isMobile) {
        elements.topbar.classList.remove("topbar-hidden");
        state.lastScrollY = currentScrollY;
        return;
      }

      if (currentScrollY <= 0) {
        elements.topbar.classList.remove("topbar-hidden");
        state.lastScrollY = 0;
        return;
      }

      if (currentScrollY > state.lastScrollY && currentScrollY > 80) {
        elements.topbar.classList.add("topbar-hidden");
      } else if (currentScrollY < state.lastScrollY) {
        elements.topbar.classList.remove("topbar-hidden");
      }

      state.lastScrollY = currentScrollY;
    },
    { passive: true }
  );
}

function bindMainEvents() {
  elements.btnToggleTripPanel?.addEventListener("click", () => toggleTripPanel());
  elements.btnCloseTripPanel?.addEventListener("click", () => toggleTripPanel(false));
  elements.btnTripList?.addEventListener("click", () => toggleTripPanel());

  elements.btnAddPoint?.addEventListener("click", addOrUpdatePoint);
  elements.btnAddStartPoint?.addEventListener("click", commitStartPoint);
  elements.btnClearForm?.addEventListener("click", () => {
    clearPointForm();
    clearDraftMarker();
  });

  elements.tripList?.addEventListener("click", (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const pointId = actionBtn.dataset.id;

    if (action === "delete-point") {
      deletePoint(pointId);
      return;
    }

    if (action === "delete-start") {
      state.startPoint = null;
      clearStartMarker();
      recomputeRoute();
      markDirty();
      elements.authStatus.textContent = "Başlangıç noktası silindi.";
      return;
    }

    if (action === "directions-start") {
      if (!state.startPoint) return;
      const url = `https://www.google.com/maps/dir/?api=1&destination=${state.startPoint.lat},${state.startPoint.lng}`;
      window.open(url, "_blank");
      return;
    }

    if (action === "directions-point") {
      const point = state.points.find((item) => String(item.id) === String(pointId));
      if (!point) return;
      const url = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
      window.open(url, "_blank");
    }
  });

  elements.btnSaveMap?.addEventListener("click", handleSaveMap);
  elements.btnNewMap?.addEventListener("click", handleNewMap);
  elements.btnNewMapInline?.addEventListener("click", handleNewMap);
  elements.btnNewMapMobile?.addEventListener("click", handleNewMap);

  elements.mapList?.addEventListener("click", handleMapListClick);
  elements.btnLogoutTop?.addEventListener("click", async () => {
    try {
      await logout();
      goToLogin();
    } catch (error) {
      alert(`Çıkış yapılamadı: ${error.message}`);
    }
  });

  window.addEventListener("resize", () => {
    syncMobilePanelState();
  });
}

function attachDirtyWatchers() {
  [
    elements.mapName,
    elements.startName,
    elements.startLat,
    elements.startLng,
    elements.pointName,
    elements.pointLat,
    elements.pointLng
  ].forEach((input) => {
    input?.addEventListener("input", markDirty);
  });
}

async function initializeUser(user) {
  state.currentUser = user;

  if (!user) {
    await closeAppStartupSplash(state.appStartupSplash);
    goToLogin();
    return;
  }

  try {
    await ensureUserProfile(user.uid, user.email);
    state.claims = await getUserClaims();
    state.profile = await getUserProfile(user.uid);
    state.fullAccess = Boolean(state.claims?.fullAccess);

    if (!state.profile?.locationQuota) {
      state.locationQuota = TRIAL_LOCATION_QUOTA;
    } else {
      state.locationQuota = Number(state.profile.locationQuota) || TRIAL_LOCATION_QUOTA;
    }

    if (!state.profile?.mapQuota) {
      state.mapQuota = 1;
    } else {
      state.mapQuota = Number(state.profile.mapQuota) || 1;
    }

    state.accessActive = hasActiveAccess();

    elements.authStatus.textContent = `${user.email} · ${getAccessStatusText()}`;

    await loadUserMaps(user.uid, isPremiumAccessActive());
    await closeAppStartupSplash(state.appStartupSplash);
  } catch (error) {
    elements.authStatus.textContent = `Kullanıcı başlatma hatası: ${error.message}`;
    await closeAppStartupSplash(state.appStartupSplash);
  }
}

function initAuth() {
  watchAuth(async (user) => {
    await initializeUser(user);
  });
}

function initializeApp() {
  state.appStartupSplash = hydrateAppStartupSplash();

  renderSummary();
  renderTripList();
  initMapInteractions();
  initPanelButtons();
  bindImportExportEvents();
  bindMainEvents();
  attachDirtyWatchers();
  initTopbarAutoHide();
  initAuth();
  syncMobilePanelState();

  if (state.appStartupSplash && elements.appStartupSplash) {
    elements.appStartupSplash.classList.add("is-visible");
    document.documentElement.classList.add("show-app-startup-splash");
  }
}

document.addEventListener("DOMContentLoaded", initializeApp);
