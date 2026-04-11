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
  elements.authStatus.textContent = `Başlangıç noktası güncellendi: ${startPoint.name}`;
  closeFloatingPanels();
}

function generatePointId() {
  return `point-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clearPointForm() {
  elements.pointName.value = "";
  elements.pointLat.value = "";
  elements.pointLng.value = "";
  state.editingPointId = null;
  elements.btnAddPoint.textContent = "Ekle";
  clearDraftMarker();
}

function setPointForm(point) {
  if (!point) {
    clearPointForm();
    return;
  }

  elements.pointName.value = point.name || "";
  elements.pointLat.value = Number(point.lat).toFixed(6);
  elements.pointLng.value = Number(point.lng).toFixed(6);
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
    id: state.editingPointId || generatePointId(),
    name,
    lat,
    lng,
    type: "point"
  };
}

function blurActiveInputSafely() {
  const active = document.activeElement;
  if (active && typeof active.blur === "function") {
    active.blur();
  }
}

function addOrUpdatePoint() {
  try {
    if (!hasActiveAccess()) {
      alert("Erişim süreniz dolmuş.");
      return;
    }

    blurActiveInputSafely();

    const point = buildPointFromForm();

    if (!point) {
      alert("Lütfen konum adı, enlem ve boylamı geçerli şekilde gir.");
      return;
    }

    const existingIndex = state.points.findIndex((item) => item.id === point.id);
    const isNewPoint = existingIndex === -1;

    if (isNewPoint && !canAddMoreLocations(1)) {
      alert(`En fazla ${state.locationQuota} konum ekleyebilirsiniz.`);
      return;
    }

    if (existingIndex >= 0) {
      state.points[existingIndex] = point;
    } else {
      state.points.push(point);
    }

    recomputeRoute();
    markDirty();

    elements.authStatus.textContent =
      existingIndex >= 0
        ? `Konum güncellendi: ${point.name}`
        : `Konum eklendi: ${point.name}`;

    clearPointForm();
    closeFloatingPanels();
  } catch (error) {
    console.error("Konum ekleme hatası:", error);
    alert("Konum eklenirken bir hata oluştu.");
  }
}

function syncMarkersFromState() {
  clearMarkers();
  clearRouteLines();
  clearStartMarker();

  if (state.startPoint) {
    showStartMarker({
      lat: state.startPoint.lat,
      lng: state.startPoint.lng,
      title: state.startPoint.name,
      pointData: {
        ...state.startPoint,
        orderLabel: "S"
      },
      onClick: fillPointFormFromMarker
    });
  }

  state.points.forEach((point, index) => {
    addMarker({
      lat: point.lat,
      lng: point.lng,
      title: point.name,
      pointData: {
        ...point,
        orderLabel: String(index + 1)
      },
      onClick: fillPointFormFromMarker
    });
  });
}

function recomputeRoute() {
  syncMarkersFromState();

  if (!state.startPoint || !state.points.length) {
    state.totalDistance = 0;
    renderSummary();
    renderTripList();
    return;
  }

  const { orderedPoints, totalDistance } = nearestNeighborRoute(
    state.startPoint,
    state.points
  );

  state.points = orderedPoints.map((point) => ({
    id: point.id,
    name: point.name,
    lat: point.lat,
    lng: point.lng,
    type: "point"
  }));

  state.totalDistance = totalDistance;

  syncMarkersFromState();

  const routePoints = [state.startPoint, ...state.points];
  drawRouteSegments(routePoints);

  renderSummary();
  renderTripList();
}

function renderSummary() {
  elements.totalPoints.textContent = String(state.points.length + (state.startPoint ? 1 : 0));
  const distanceText = formatKm(state.totalDistance);
  elements.totalDistance.textContent = distanceText;
  elements.badgeDistance.textContent = distanceText;
}

function createTripListItem(point, index, isStart = false) {
  const label = isStart ? "S" : String(index + 1);
  const actions = isStart
    ? `
      <button class="trip-action ghost" data-action="directions-start">Yol Tarifi</button>
      <button class="trip-action danger" data-action="delete-start">Sil</button>
    `
    : `
      <button class="trip-action ghost" data-action="directions-point" data-id="${escapeHtml(point.id)}">Yol Tarifi</button>
      <button class="trip-action danger" data-action="delete-point" data-id="${escapeHtml(point.id)}">Sil</button>
    `;

  return `
    <article class="trip-item ${isStart ? "is-start" : ""}">
      <div class="trip-item-order">${label}</div>
      <div class="trip-item-body">
        <strong>${escapeHtml(point.name)}</strong>
        <span>${Number(point.lat).toFixed(6)}, ${Number(point.lng).toFixed(6)}</span>
      </div>
      <div class="trip-item-actions">
        ${actions}
      </div>
    </article>
  `;
}

function renderTripList() {
  const items = [];

  if (state.startPoint) {
    items.push(createTripListItem(state.startPoint, 0, true));
  }

  state.points.forEach((point, index) => {
    items.push(createTripListItem(point, index, false));
  });

  elements.tripList.innerHTML = items.length
    ? items.join("")
    : `<div class="empty-state">Henüz konum eklenmedi.</div>`;
}

function fillPointFormFromMarker(pointData) {
  if (!pointData) return;

  if (pointData.type === "start") {
    setStartForm(pointData);
    elements.authStatus.textContent = `Başlangıç seçildi: ${pointData.name}`;
    openFloatingPanel("start");
    return;
  }

  state.editingPointId = pointData.id;
  setPointForm(pointData);
  elements.btnAddPoint.textContent = "Güncelle";
  elements.authStatus.textContent = `Konum seçildi: ${pointData.name}`;
  openFloatingPanel("point");
}

function fillBothFormsFromMap(lat, lng, name = "") {
  const safeName = String(name || "").trim();

  elements.startName.value = safeName;
  elements.startLat.value = Number(lat).toFixed(6);
  elements.startLng.value = Number(lng).toFixed(6);

  elements.pointName.value = safeName;
  elements.pointLat.value = Number(lat).toFixed(6);
  elements.pointLng.value = Number(lng).toFixed(6);

  state.editingPointId = null;
  elements.btnAddPoint.textContent = "Ekle";
}

function deletePoint(pointId) {
  state.points = state.points.filter((item) => String(item.id) !== String(pointId));
  recomputeRoute();
  markDirty();
  elements.authStatus.textContent = "Konum silindi.";
}

function clearStartPoint() {
  state.startPoint = null;
  setStartForm(null);
  recomputeRoute();
  markDirty();
  elements.authStatus.textContent = "Başlangıç noktası temizlendi.";
}

async function focusCurrentMap() {
  const points = [];
  if (state.startPoint) points.push(state.startPoint);
  if (state.points.length) points.push(...state.points);

  focusMapToPoints(points);
}

async function handleCurrentLocationClick() {
  try {
    if (!hasActiveAccess()) {
      alert("Erişim süreniz dolmuş.");
      return;
    }

    const location = await locateAndShowUser();
    if (!location) {
      alert("Konum alınamadı.");
      return;
    }

    fillBothFormsFromMap(location.lat, location.lng, location.name || "Mevcut Konum");
    markDirty();
    elements.authStatus.textContent = "Mevcut konum forma dolduruldu.";
  } catch (error) {
    console.error("Mevcut konum hatası:", error);
    alert("Mevcut konum alınırken hata oluştu.");
  }
}

function createMapPayload() {
  return {
    name: elements.mapName.value.trim() || "Adsız Harita",
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
      lng: point.lng
    })),
    totalDistance: state.totalDistance
  };
}

async function handleSaveMap() {
  try {
    if (!state.currentUser) return;

    if (!hasActiveAccess()) {
      alert("Erişim süreniz dolmuş.");
      return;
    }

    if (!canSaveAnotherMap()) {
      alert("Deneme hesabında yalnızca tek kayıtlı harita tutulabilir.");
      return;
    }

    const payload = createMapPayload();

    if (state.selectedMapId) {
      if (!canReadMapId(state.selectedMapId)) {
        alert("Bu haritayı güncelleme yetkiniz yok.");
        return;
      }

      await updateMap(state.currentUser.uid, state.selectedMapId, payload);
      elements.authStatus.textContent = `Harita güncellendi: ${payload.name}`;
    } else {
      const createdId = await saveMap(state.currentUser.uid, payload, {
        forceTrialMapId: !isPremiumAccessActive() ? TRIAL_MAP_ID : undefined
      });
      state.selectedMapId = createdId;
      elements.authStatus.textContent = `Harita kaydedildi: ${payload.name}`;
    }

    markClean();
    await loadUserMaps(state.currentUser.uid, isPremiumAccessActive());
    closeFloatingPanels();
    closeSavedMapsOverlay();
  } catch (error) {
    console.error("Harita kaydetme hatası:", error);
    alert("Harita kaydedilirken hata oluştu.");
  }
}

async function confirmDiscardChanges() {
  if (!state.hasUnsavedChanges && !hasMapContent()) {
    return true;
  }

  return window.confirm("Kaydedilmemiş değişiklikler silinecek. Devam edilsin mi?");
}

async function resetWorkspace() {
  state.points = [];
  state.totalDistance = 0;
  state.startPoint = null;
  state.editingPointId = null;
  state.selectedMapId = null;

  elements.mapName.value = "";
  setStartForm(null);
  clearPointForm();

  recomputeRoute();
  markClean();
  await focusCurrentMap();
}

async function handleNewMap() {
  const confirmed = await confirmDiscardChanges();
  if (!confirmed) return;

  await resetWorkspace();
  elements.authStatus.textContent = "Yeni harita hazır.";
}

function applyMapData(mapData) {
  state.selectedMapId = mapData.id;
  elements.mapName.value = mapData.name || "";

  state.startPoint = mapData.startPoint
    ? {
        id: "start-point",
        name: mapData.startPoint.name,
        lat: Number(mapData.startPoint.lat),
        lng: Number(mapData.startPoint.lng),
        type: "start"
      }
    : null;

  state.points = Array.isArray(mapData.points)
    ? mapData.points.map((point, index) => ({
        id: point.id || `loaded-${index}-${Date.now()}`,
        name: point.name,
        lat: Number(point.lat),
        lng: Number(point.lng),
        type: "point"
      }))
    : [];

  state.totalDistance = Number(mapData.totalDistance) || 0;

  setStartForm(state.startPoint);
  clearPointForm();
  recomputeRoute();
  markClean();
}

function renderMapList(maps) {
  if (!elements.mapList) return;

  if (!maps.length) {
    elements.mapList.innerHTML = `<div class="empty-state">Kayıtlı harita bulunamadı.</div>`;
    return;
  }

  elements.mapList.innerHTML = maps
    .map((map) => {
      const locked = !canReadMapId(map.id);
      return `
        <article class="map-list-item ${locked ? "is-locked" : ""}" data-id="${escapeHtml(map.id)}">
          <div class="map-list-content">
            <strong>${escapeHtml(map.name || "Adsız Harita")}</strong>
            <span>${(map.points?.length || 0) + (map.startPoint ? 1 : 0)} konum</span>
          </div>
          <div class="map-list-actions">
            ${
              locked
                ? `<span class="map-lock-label">Kilitli</span>`
                : `<button class="trip-action danger" data-action="delete-map" data-id="${escapeHtml(map.id)}">Sil</button>`
            }
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadUserMaps(uid, premiumMode = false) {
  try {
    const maps = await getMaps(uid, { includeAll: premiumMode });
    renderMapList(maps);
  } catch (error) {
    console.error("Haritalar yüklenemedi:", error);
    elements.authStatus.textContent = "Haritalar yüklenemedi.";
  }
}

async function handleMapListClick(event) {
  const deleteButton = event.target.closest("[data-action='delete-map']");
  if (deleteButton) {
    const mapId = deleteButton.dataset.id;
    if (!mapId || !state.currentUser) return;

    const confirmed = window.confirm("Harita silinsin mi?");
    if (!confirmed) return;

    await removeMap(state.currentUser.uid, mapId);

    if (state.selectedMapId === mapId) {
      await resetWorkspace();
    }

    await loadUserMaps(state.currentUser.uid, isPremiumAccessActive());
    elements.authStatus.textContent = "Harita silindi.";
    return;
  }

  const mapItem = event.target.closest(".map-list-item");
  if (!mapItem || !state.currentUser) return;

  const mapId = mapItem.dataset.id;
  if (!mapId) return;

  if (!canReadMapId(mapId)) {
    alert("Bu haritayı açmak için premium erişim gerekiyor.");
    return;
  }

  if (state.hasUnsavedChanges) {
    const confirmed = window.confirm(
      "Kaydedilmemiş değişiklikler kaybolacak. Seçili harita açılsın mı?"
    );
    if (!confirmed) return;
  }

  try {
    const mapData = await getMapById(state.currentUser.uid, mapId);
    if (!mapData) {
      alert("Harita bulunamadı.");
      return;
    }

    applyMapData(mapData);
    elements.authStatus.textContent = `Harita açıldı: ${mapData.name || "Adsız Harita"}`;
    closeFloatingPanels();
  } catch (error) {
    console.error("Harita açma hatası:", error);
    alert("Harita açılırken hata oluştu.");
  }
}

async function handleExport() {
  try {
    const type = elements.exportType?.value || "csv";
    const rows = [
      ...(state.startPoint
        ? [
            {
              type: "start",
              name: state.startPoint.name,
              lat: state.startPoint.lat,
              lng: state.startPoint.lng
            }
          ]
        : []),
      ...state.points.map((point) => ({
        type: "point",
        name: point.name,
        lat: point.lat,
        lng: point.lng
      }))
    ];

    if (!rows.length) {
      alert("Dışa aktarmak için önce konum ekleyin.");
      return;
    }

    const fileName = (elements.mapName.value.trim() || "rota-planim").replace(/[^\p{L}\p{N}\-_ ]/gu, "_");

    if (type === "xlsx") {
      exportToXlsx(rows, fileName);
    } else {
      exportToCsv(rows, fileName);
    }

    elements.authStatus.textContent = "Veriler dışa aktarıldı.";
  } catch (error) {
    console.error("Dışa aktarma hatası:", error);
    alert("Dışa aktarma sırasında hata oluştu.");
  }
}

function triggerFilePickerByType(type) {
  if (type === "xlsx") {
    elements.xlsxFileInput?.click();
  } else {
    elements.csvFileInput?.click();
  }
}

async function handleImport() {
  const type = elements.importType?.value || "csv";
  triggerFilePickerByType(type);
}

async function applyImportedState(nextState) {
  if (!nextState) return;

  state.startPoint = nextState.startPoint
    ? {
        id: "start-point",
        name: nextState.startPoint.name,
        lat: Number(nextState.startPoint.lat),
        lng: Number(nextState.startPoint.lng),
        type: "start"
      }
    : null;

  state.points = Array.isArray(nextState.points)
    ? nextState.points.map((point, index) => ({
        id: point.id || `imported-${index}-${Date.now()}`,
        name: point.name,
        lat: Number(point.lat),
        lng: Number(point.lng),
        type: "point"
      }))
    : [];

  if (!canAddMoreLocations(0)) {
    alert("İçe aktarılan veri mevcut kota ile uyumlu değil.");
    return;
  }

  setStartForm(state.startPoint);
  clearPointForm();
  recomputeRoute();
  markDirty();
  elements.authStatus.textContent = "Dosya içe aktarıldı.";
}

async function handleCsvFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const rows = await importFromCsvFile(file);
    const nextState = convertImportedRowsToState(rows);
    await applyImportedState(nextState);
  } catch (error) {
    console.error("CSV içe aktarma hatası:", error);
    alert("CSV dosyası okunamadı.");
  }
}

async function handleXlsxFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const rows = await importFromXlsxFile(file);
    const nextState = convertImportedRowsToState(rows);
    await applyImportedState(nextState);
  } catch (error) {
    console.error("Excel içe aktarma hatası:", error);
    alert("Excel dosyası okunamadı.");
  }
}

async function handleLogout() {
  try {
    await logout();
    goToLogin();
  } catch (error) {
    console.error("Çıkış hatası:", error);
    alert("Çıkış yapılamadı.");
  }
}

function toggleTripPanel(forceValue) {
  state.tripPanelOpen =
    typeof forceValue === "boolean" ? forceValue : !state.tripPanelOpen;

  elements.tripPanel?.classList.toggle("is-collapsed", !state.tripPanelOpen);
}

function handleTripListClick(event) {
  const target = event.target.closest("[data-action]");
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

  if (action === "directions-start") {
    if (!state.startPoint) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${state.startPoint.lat},${state.startPoint.lng}`;
    window.location.href = url;
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

  document.body.classList.toggle("has-mobile-floating-panel", isMobile && Boolean(panelName));
  document.body.dataset.mobilePanel = isMobile ? panelName : "";
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

function bindEvents() {
  elements.btnToggleTripPanel?.addEventListener("click", () => toggleTripPanel());
  elements.btnCloseTripPanel?.addEventListener("click", () => toggleTripPanel(false));
  elements.btnTripList?.addEventListener("click", () => toggleTripPanel());
  elements.btnAddPoint?.addEventListener("click", addOrUpdatePoint);
  elements.btnAddPoint?.addEventListener("touchend", (event) => {
    event.preventDefault();
    addOrUpdatePoint();
  }, { passive: false });

  elements.btnAddStartPoint?.addEventListener("click", commitStartPoint);
  elements.btnAddStartPoint?.addEventListener("touchend", (event) => {
    event.preventDefault();
    commitStartPoint();
  }, { passive: false });
  elements.btnClearForm?.addEventListener("click", clearPointForm);
  elements.btnCurrentLocation?.addEventListener("click", handleCurrentLocationClick);
  elements.tripList?.addEventListener("click", handleTripListClick);

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
  document.addEventListener("click", handleShellClick);
  window.addEventListener("resize", syncMobilePanelState);

  elements.mapName?.addEventListener("input", markDirty);
  elements.startName?.addEventListener("input", markDirty);
  elements.startLat?.addEventListener("input", markDirty);
  elements.startLng?.addEventListener("input", markDirty);
  elements.pointName?.addEventListener("input", markDirty);
  elements.pointLat?.addEventListener("input", markDirty);
  elements.pointLng?.addEventListener("input", markDirty);
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
