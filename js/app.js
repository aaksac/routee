# js/app.js

```javascript
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
  drawRouteSegments
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
  lastScrollY: 0
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
  importExportPanel: document.getElementById("importExportPanel")
};

function goToLogin() {
  window.location.href = "./index.html";
}

function formatKm(value) {
  return `${Number(value).toFixed(2)} km`;
}

function sanitizeText(value, maxLength = 120) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function parseCoordinate(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function isValidLatitude(lat) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

function isValidLongitude(lng) {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function isValidCoordinatePair(lat, lng) {
  return isValidLatitude(lat) && isValidLongitude(lng);
}

function createPointId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const name = sanitizeText(elements.startName.value, 120);
  const lat = parseCoordinate(elements.startLat.value);
  const lng = parseCoordinate(elements.startLng.value);

  if (!name || lat === null || lng === null) return null;
  if (!isValidCoordinatePair(lat, lng)) return null;

  return {
    id: "start-point",
    name,
    lat,
    lng,
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
    alert("Geçerli bir başlangıç adı, enlem (-90 ile 90) ve boylam (-180 ile 180) gir.");
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
  } else if (!elements.startName.value.trim()) {
    elements.startName.value = "Başlangıç";
  }
}

function fillPointFormFromMap(lat, lng, suggestedName = "") {
  elements.pointLat.value = lat.toFixed(6);
  elements.pointLng.value = lng.toFixed(6);

  if (suggestedName) {
    elements.pointName.value = suggestedName;
    return;
  }

  if (!elements.pointName.value.trim()) {
    elements.pointName.value = `Nokta ${state.points.length + 1}`;
  }
}

function fillBothFormsFromMap(lat, lng, suggestedName = "") {
  fillPointFormFromMap(lat, lng, suggestedName);
  fillStartFormFromMap(lat, lng, suggestedName);
}

function fillPointFormFromMarker(pointData) {
  if (!pointData) return;

  if (pointData.type === "start") {
    elements.startName.value = pointData.name || "";
    elements.startLat.value = Number(pointData.lat).toFixed(6);
    elements.startLng.value = Number(pointData.lng).toFixed(6);
    elements.authStatus.textContent = `Başlangıç bilgisi yüklendi: ${pointData.name}`;
    return;
  }

  elements.pointName.value = pointData.name || "";
  elements.pointLat.value = Number(pointData.lat).toFixed(6);
  elements.pointLng.value = Number(pointData.lng).toFixed(6);
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
          <button class="tiny-btn" type="button" data-action="directions-start">Yol Tarifi Al</button>
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
        <button class="tiny-btn" type="button" disabled>Yol Tarifi Al</button>
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
            <button class="tiny-btn" type="button" data-action="directions-point" data-id="${point.id}">Yol Tarifi Al</button>
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

function addOrUpdatePoint() {
  if (!hasActiveAccess()) {
    alert("Erişim süreniz dolmuş.");
    return;
  }

  const name = sanitizeText(elements.pointName.value, 120);
  const lat = parseCoordinate(elements.pointLat.value);
  const lng = parseCoordinate(elements.pointLng.value);

  if (!name || lat === null || lng === null) {
    alert("Geçerli bir nokta adı, enlem ve boylam gir.");
    return;
  }

  if (!isValidCoordinatePair(lat, lng)) {
    alert("Enlem -90 ile 90 arasında, boylam -180 ile 180 arasında olmalı.");
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
            lat,
            lng
          }
        : point
    );
  } else {
    state.points.push({
      id: createPointId(),
      name,
      lat,
      lng,
      distanceFromPrevious: 0,
      type: "point"
    });
  }

  clearDraftMarker();
  clearPointForm();
  recomputeRoute();
  markDirty();
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

function refreshMapList() {
  if (!state.currentUser) return Promise.resolve();
  return loadUserMaps(state.currentUser.uid, isPremiumAccessActive());
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
      await saveMap(state.currentUser.uid, payload, { fullAccess: false });
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
          id: createPointId(),
          name: point.name,
          lat: Number(point.lat),
          lng: Number(point.lng),
          distanceFromPrevious: 0,
          type: "point"
        }))
      : [];

    const applied = applyImportedData(startPoint, points);
    if (!applied) return;

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
    elements.authStatus.textContent = "CSV içe aktarıldı.";
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
    elements.authStatus.textContent = "XLSX içe aktarıldı.";
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
            <button class="map-list-item ${state.selectedMapId === map.id ? "active" : ""}" type="button" data-map-id="${String(map.id)}">
              <strong>${escapeHtml(map.name || "İsimsiz Harita")}</strong>
              <span>Toplam mesafe: ${formatKm(map.totalDistance || 0)}</span>
            </button>
            <button class="tiny-btn danger-outline" type="button" data-action="delete-map" data-map-id="${String(map.id)}">
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

  if (action === "directions-start") {
    if (!state.startPoint) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${state.startPoint.lat},${state.startPoint.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  if (action === "directions-point") {
    const point = state.points.find((item) => String(item.id) === String(target.dataset.id));
    if (!point) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function closeMapMenu() {
  state.mapMenuOpen = false;
  elements.mapMenu?.classList.add("hidden");
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
  elements.btnAddStartPoint?.addEventListener("click", commitStartPoint);
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
  elements.mapList?.addEventListener("click", async (event) => {
    await handleMapListClick(event);
    const clickedMap = event.target.closest(".map-list-item");
    if (clickedMap && !event.target.closest("[data-action='delete-map']")) {
      closeSavedMapsOverlay();
    }
  });
  elements.btnLogoutTop?.addEventListener("click", handleLogout);

  elements.btnOpenStartPanel?.addEventListener("click", () => openFloatingPanel("start"));
  elements.btnOpenPointPanel?.addEventListener("click", () => openFloatingPanel("point"));
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

  elements.mapName?.addEventListener("input", markDirty);
  elements.startName?.addEventListener("input", markDirty);
  elements.startLat?.addEventListener("input", markDirty);
  elements.startLng?.addEventListener("input", markDirty);
  elements.pointName?.addEventListener("input", markDirty);
  elements.pointLat?.addEventListener("input", markDirty);
  elements.pointLng?.addEventListener("input", markDirty);
}

function initMapClickPicker() {
  enableMapClickPicker(({ lat, lng }) => {
    if (!hasActiveAccess()) return;
    fillBothFormsFromMap(lat, lng);
    markDirty();
    elements.authStatus.textContent = `Haritadan seçim yapıldı: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
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

    if (user) {
      await ensureUserProfile(user.uid, user.email);
      await loadAccessModel(user);
      elements.authStatus.textContent = `Aktif kullanıcı: ${user.email} · ${getAccessStatusText()}`;
      await loadUserMaps(user.uid, isPremiumAccessActive());
    } else {
      goToLogin();
    }
  });
}

function init() {
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
```

# js/admin.js

```javascript
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
```

# js/import-export.js

```javascript
function isValidLatitude(lat) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

function isValidLongitude(lng) {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function createPointId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildExportRows(startPoint, points) {
  const rows = [];

  if (startPoint) {
    rows.push({
      type: "start",
      name: startPoint.name || "",
      lat: Number(startPoint.lat),
      lng: Number(startPoint.lng)
    });
  }

  points.forEach((point) => {
    rows.push({
      type: "point",
      name: point.name || "",
      lat: Number(point.lat),
      lng: Number(point.lng)
    });
  });

  return rows;
}

function exportToCsv(filename, startPoint, points) {
  const rows = buildExportRows(startPoint, points);
  const headers = ["type", "name", "lat", "lng"];

  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        escapeCsvValue(row.type),
        escapeCsvValue(row.name),
        escapeCsvValue(row.lat),
        escapeCsvValue(row.lng)
      ].join(",")
    )
  ];

  const blob = new Blob([csvLines.join("\n")], {
    type: "text/csv;charset=utf-8;"
  });

  downloadBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

function escapeCsvValue(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportToXlsx(filename, startPoint, points) {
  const rows = buildExportRows(startPoint, points);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "GeziListesi");
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsvText(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] ?? "";
    });

    return normalizeImportedRow(obj);
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function normalizeImportedRow(row) {
  return {
    type: String(row.type || "").trim().toLowerCase(),
    name: String(row.name || "").trim(),
    lat: Number(row.lat),
    lng: Number(row.lng)
  };
}

function validateImportedRows(rows) {
  return rows.filter(
    (row) =>
      (row.type === "start" || row.type === "point") &&
      row.name &&
      Number.isFinite(row.lat) &&
      Number.isFinite(row.lng) &&
      isValidLatitude(row.lat) &&
      isValidLongitude(row.lng)
  );
}

async function importFromCsvFile(file) {
  const text = await file.text();
  const parsed = parseCsvText(text);
  return validateImportedRows(parsed);
}

async function importFromXlsxFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  const parsed = jsonRows.map(normalizeImportedRow);
  return validateImportedRows(parsed);
}

function convertImportedRowsToState(rows) {
  const startRow = rows.find((row) => row.type === "start") || null;
  const pointRows = rows.filter((row) => row.type === "point");

  const startPoint = startRow
    ? {
        id: "start-point",
        name: startRow.name,
        lat: Number(startRow.lat),
        lng: Number(startRow.lng),
        type: "start"
      }
    : null;

  const points = pointRows.map((row) => ({
    id: createPointId(),
    name: row.name,
    lat: Number(row.lat),
    lng: Number(row.lng),
    distanceFromPrevious: 0,
    type: "point"
  }));

  return { startPoint, points };
}

export {
  exportToCsv,
  exportToXlsx,
  importFromCsvFile,
  importFromXlsxFile,
  convertImportedRowsToState
};
```

# js/map.js

```javascript
let map;
let markers = [];
let currentLocationMarker = null;
let mapClickListener = null;
let draftMarker = null;
let searchMarker = null;
let autocomplete = null;
let startMarker = null;
let routePolylines = [];
let distanceOverlays = [];
let activeInfoWindow = null;

function initMap() {
  const mapElement = document.getElementById("mapCanvas");
  if (!mapElement) return null;

  mapElement.innerHTML = "";

  const defaultCenter = { lat: 37.0, lng: 35.3213 };

  map = new google.maps.Map(mapElement, {
    center: defaultCenter,
    zoom: 11,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: "greedy"
  });

  activeInfoWindow = new google.maps.InfoWindow();

  return map;
}

function getMap() {
  return map;
}

function createCircleSymbol(fillColor, strokeColor = "#ffffff", scale = 10) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor,
    fillOpacity: 1,
    strokeColor,
    strokeWeight: 2,
    scale
  };
}

function createGoogleMapsDirectionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function getPointDisplayTitle(pointData) {
  if (!pointData) return "Seçilen Konum";

  if (pointData.type === "start") {
    return `S. ${pointData.name || "Başlangıç"}`;
  }

  if (pointData.orderLabel) {
    return `${pointData.orderLabel}. ${pointData.name || "Nokta"}`;
  }

  return pointData.name || "Nokta";
}

function createInfoWindowContent(pointData) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "auto";
  wrapper.style.maxWidth = "120px";
  wrapper.style.padding = "0";
  wrapper.style.textAlign = "center";
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "6px";

  const title = document.createElement("div");
  title.textContent = getPointDisplayTitle(pointData);
  title.style.fontSize = "12px";
  title.style.fontWeight = "700";
  title.style.lineHeight = "1.2";
  title.style.color = "#0f172a";
  title.style.maxWidth = "110px";
  title.style.wordBreak = "break-word";
  title.style.margin = "0 auto";

  const button = document.createElement("button");
  button.textContent = "Yol Tarifi";
  button.style.background = "#2563eb";
  button.style.color = "#ffffff";
  button.style.border = "none";
  button.style.borderRadius = "999px";
  button.style.padding = "6px 10px";
  button.style.fontSize = "11px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.minWidth = "88px";
  button.style.height = "30px";

  button.addEventListener("click", () => {
    const url = createGoogleMapsDirectionsUrl(pointData.lat, pointData.lng);
    window.open(url, "_blank", "noopener,noreferrer");
  });

  wrapper.appendChild(title);
  wrapper.appendChild(button);

  return wrapper;
}

function openMarkerInfo(marker, pointData) {
  if (!map || !marker || !activeInfoWindow || !pointData) return;

  activeInfoWindow.setContent(createInfoWindowContent(pointData));
  activeInfoWindow.setOptions({
    maxWidth: 140
  });

  activeInfoWindow.open({
    anchor: marker,
    map
  });
}

function addMarker({ lat, lng, title, label, onClick, pointData }) {
  if (!map) return null;

  const marker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title: title || "",
    label: label
      ? {
          text: String(label),
          color: "#ffffff",
          fontWeight: "700"
        }
      : undefined,
    icon: createCircleSymbol("#dc2626")
  });

  marker.__pointData = pointData || null;

  marker.addListener("click", () => {
    openMarkerInfo(marker, marker.__pointData);
    if (typeof onClick === "function") {
      onClick(marker.__pointData);
    }
  });

  markers.push(marker);
  return marker;
}

function clearMarkers() {
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
}

function showStartMarker({ lat, lng, title, onClick, pointData }) {
  if (!map) return null;

  if (startMarker) {
    startMarker.setMap(null);
  }

  startMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title: title || "Başlangıç",
    label: {
      text: "S",
      color: "#ffffff",
      fontWeight: "700"
    },
    icon: createCircleSymbol("#16a34a", "#ffffff", 12)
  });

  startMarker.__pointData = pointData || null;

  startMarker.addListener("click", () => {
    openMarkerInfo(startMarker, startMarker.__pointData);
    if (typeof onClick === "function") {
      onClick(startMarker.__pointData);
    }
  });

  return startMarker;
}

function clearStartMarker() {
  if (startMarker) {
    startMarker.setMap(null);
    startMarker = null;
  }
}

function focusToLocation(lat, lng, zoom = 15) {
  if (!map) return;
  map.setCenter({ lat, lng });
  map.setZoom(zoom);
}

function showCurrentLocationMarker(lat, lng) {
  if (!map) return;

  if (currentLocationMarker) {
    currentLocationMarker.setMap(null);
  }

  currentLocationMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title: "Mevcut Konumum",
    icon: createCircleSymbol("#2563eb")
  });

  focusToLocation(lat, lng, 15);
}

function showDraftMarker(lat, lng) {
  if (!map) return;

  if (draftMarker) {
    draftMarker.setMap(null);
  }

  draftMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title: "Seçilen Nokta",
    icon: createCircleSymbol("#facc15", "#92400e")
  });
}

function clearDraftMarker() {
  if (draftMarker) {
    draftMarker.setMap(null);
    draftMarker = null;
  }
}

function clearRouteLines() {
  routePolylines.forEach((line) => line.setMap(null));
  routePolylines = [];

  distanceOverlays.forEach((overlay) => overlay.setMap(null));
  distanceOverlays = [];
}

function createDistanceOverlay(position, text) {
  class DistanceOverlay extends google.maps.OverlayView {
    constructor(pos, labelText) {
      super();
      this.position = pos;
      this.text = labelText;
      this.div = null;
    }

    onAdd() {
      const div = document.createElement("div");
      div.style.position = "absolute";
      div.style.background = "#ffffff";
      div.style.border = "1px solid #cbd5e1";
      div.style.borderRadius = "999px";
      div.style.padding = "4px 8px";
      div.style.fontSize = "12px";
      div.style.fontWeight = "600";
      div.style.color = "#0f172a";
      div.style.boxShadow = "0 4px 12px rgba(15,23,42,0.12)";
      div.style.whiteSpace = "nowrap";
      div.innerText = this.text;
      this.div = div;

      const panes = this.getPanes();
      panes.floatPane.appendChild(div);
    }

    draw() {
      if (!this.div) return;

      const projection = this.getProjection();
      const pixel = projection.fromLatLngToDivPixel(this.position);

      if (!pixel) return;

      this.div.style.left = `${pixel.x - 24}px`;
      this.div.style.top = `${pixel.y - 14}px`;
    }

    onRemove() {
      if (this.div) {
        this.div.remove();
        this.div = null;
      }
    }
  }

  const overlay = new DistanceOverlay(position, text);
  overlay.setMap(map);
  distanceOverlays.push(overlay);
}

function drawRouteSegments(startPoint, orderedPoints) {
  if (!map) return;

  clearRouteLines();

  if (!startPoint || !orderedPoints.length) return;

  let previous = startPoint;

  orderedPoints.forEach((point) => {
    const path = [
      { lat: previous.lat, lng: previous.lng },
      { lat: point.lat, lng: point.lng }
    ];

    const polyline = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.95,
      strokeWeight: 3,
      map
    });

    routePolylines.push(polyline);

    const midLat = (previous.lat + point.lat) / 2;
    const midLng = (previous.lng + point.lng) / 2;

    createDistanceOverlay(
      new google.maps.LatLng(midLat, midLng),
      `${point.distanceFromPrevious.toFixed(2)} km`
    );

    previous = point;
  });
}

function enableMapClickPicker(callback) {
  if (!map) return;

  if (mapClickListener) {
    google.maps.event.removeListener(mapClickListener);
  }

  mapClickListener = map.addListener("click", (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

    showDraftMarker(lat, lng);
    callback({ lat, lng });
  });
}

function initPlaceSearch(inputElement, onPlaceSelected) {
  if (!map || !inputElement) return;

  autocomplete = new google.maps.places.Autocomplete(inputElement, {
    fields: ["formatted_address", "geometry", "name"]
  });

  autocomplete.bindTo("bounds", map);

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    if (!place.geometry || !place.geometry.location) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();

    if (searchMarker) {
      searchMarker.setMap(null);
    }

    searchMarker = new google.maps.Marker({
      map,
      position: { lat, lng },
      title: place.name || "Arama Sonucu",
      icon: createCircleSymbol("#facc15", "#92400e")
    });

    focusToLocation(lat, lng, 15);
    showDraftMarker(lat, lng);

    onPlaceSelected({
      name: place.name || place.formatted_address || "Seçilen Yer",
      lat,
      lng
    });
  });
}

export {
  initMap,
  getMap,
  addMarker,
  clearMarkers,
  showStartMarker,
  clearStartMarker,
  focusToLocation,
  showCurrentLocationMarker,
  enableMapClickPicker,
  initPlaceSearch,
  clearDraftMarker,
  clearRouteLines,
  drawRouteSegments
};
```
