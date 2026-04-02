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
  tripSearchQuery: "",
  tripFilterMode: "all"
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
  tripSearchInput: document.getElementById("tripSearchInput"),
  tripFilterSelect: document.getElementById("tripFilterSelect"),
  pointName: document.getElementById("pointName"),
  pointLat: document.getElementById("pointLat"),
  pointLng: document.getElementById("pointLng"),
  startName: document.getElementById("startName"),
  startLat: document.getElementById("startLat"),
  startLng: document.getElementById("startLng"),
  mapName: document.getElementById("mapName"),
  authStatus: document.getElementById("authStatus"),
  mapList: document.getElementById("mapList"),
  summaryPoints: document.getElementById("summaryPoints"),
  btnMenu: document.getElementById("btnMenu"),
  mapMenu: document.getElementById("mapMenu"),
  btnOpenSavedMaps: document.getElementById("btnOpenSavedMaps"),
  btnOpenImportCard: document.getElementById("btnOpenImportCard"),
  btnOpenExportCard: document.getElementById("btnOpenExportCard"),
  startPointCard: document.getElementById("startPointCard"),
  pointCard: document.getElementById("pointCard"),
  exportCard: document.getElementById("exportCard"),
  importCard: document.getElementById("importCard"),
  btnOpenStartPanel: document.getElementById("btnOpenStartPanel"),
  btnOpenPointPanel: document.getElementById("btnOpenPointPanel"),
  btnCloseStartCard: document.getElementById("btnCloseStartCard"),
  btnClosePointCard: document.getElementById("btnClosePointCard"),
  btnCloseExportCard: document.getElementById("btnCloseExportCard"),
  btnCloseImportCard: document.getElementById("btnCloseImportCard"),
  savedMapsOverlay: document.getElementById("savedMapsOverlay"),
  savedMapsBackdrop: document.getElementById("savedMapsBackdrop"),
  btnCloseMapListPanel: document.getElementById("btnCloseMapListPanel")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatKm(value) {
  const distance = Number(value) || 0;

  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }

  const rounded = Math.round(distance * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded} km` : `${rounded.toFixed(2)} km`;
}

function getCurrentLocationCount() {
  return state.points.length + (state.startPoint ? 1 : 0);
}

function hasMapContent() {
  return Boolean(state.startPoint) || state.points.length > 0 || elements.mapName.value.trim();
}

function canSaveAnotherMap() {
  return isPremiumAccessActive() || !state.selectedMapId;
}

function isPremiumAccessActive() {
  return Boolean(state.fullAccess || state.accessActive || state.claims?.fullAccess);
}

function hasActiveAccess() {
  return isPremiumAccessActive() || state.locationQuota > 0;
}

function getAccessStatusText() {
  if (isPremiumAccessActive()) {
    return "Premium erişim aktif.";
  }

  return `Deneme hesabı: en fazla ${state.locationQuota} konum ve 1 kayıtlı harita hakkı.`;
}

function markDirty() {
  state.hasUnsavedChanges = true;
}

function markClean() {
  state.hasUnsavedChanges = false;
}

function hasDraftCoordinates() {
  return Boolean(elements.pointLat.value && elements.pointLng.value);
}

function setPointForm(point) {
  elements.pointName.value = point?.name || "";
  elements.pointLat.value = point?.lat ?? "";
  elements.pointLng.value = point?.lng ?? "";
}

function setStartForm(point) {
  elements.startName.value = point?.name || "";
  elements.startLat.value = point?.lat ?? "";
  elements.startLng.value = point?.lng ?? "";
}

function clearPointForm() {
  state.editingPointId = null;
  elements.pointName.value = "";
  elements.pointLat.value = "";
  elements.pointLng.value = "";
}

function fillBothFormsFromMap(lat, lng, name = "") {
  const pointName = name || "İşaretli Konum";

  elements.pointLat.value = Number(lat).toFixed(6);
  elements.pointLng.value = Number(lng).toFixed(6);
  elements.pointName.value = pointName;

  elements.startLat.value = Number(lat).toFixed(6);
  elements.startLng.value = Number(lng).toFixed(6);
  elements.startName.value = pointName;
}

function toggleTripPanel(forceOpen) {
  const nextState = typeof forceOpen === "boolean" ? forceOpen : !state.tripPanelOpen;
  state.tripPanelOpen = nextState;
  elements.tripPanel.classList.toggle("open", nextState);
}

function closeMapMenu() {
  state.mapMenuOpen = false;
  elements.mapMenu.classList.add("hidden");
}

function toggleMapMenu(forceOpen) {
  const next = typeof forceOpen === "boolean" ? forceOpen : !state.mapMenuOpen;
  state.mapMenuOpen = next;
  elements.mapMenu.classList.toggle("hidden", !next);
}

function openFloatingPanel(name) {
  state.activeFloatingPanel = name;

  elements.startPointCard.classList.toggle("hidden", name !== "start");
  elements.pointCard.classList.toggle("hidden", name !== "point");
  elements.exportCard.classList.toggle("hidden", name !== "export");
  elements.importCard.classList.toggle("hidden", name !== "import");
}

function closeFloatingPanels() {
  state.activeFloatingPanel = null;
  elements.startPointCard.classList.add("hidden");
  elements.pointCard.classList.add("hidden");
  elements.exportCard.classList.add("hidden");
  elements.importCard.classList.add("hidden");
}

function openSavedMapsOverlay() {
  elements.savedMapsOverlay.classList.remove("hidden");
}

function closeSavedMapsOverlay() {
  elements.savedMapsOverlay.classList.add("hidden");
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
  elements.summaryPoints.textContent = String(pointCount);
}

function getFilteredTripItems() {
  const query = (state.tripSearchQuery || "").trim().toLocaleLowerCase("tr");
  const filterMode = state.tripFilterMode || "all";

  const shouldShowStartByFilter = filterMode === "all" || filterMode === "start";
  const shouldShowPointsByFilter = filterMode === "all" || filterMode === "points";

  const startMatchesQuery =
    !query ||
    (state.startPoint?.name || "").toLocaleLowerCase("tr").includes(query) ||
    "başlangıç".includes(query);

  const filteredPoints = shouldShowPointsByFilter
    ? state.points.filter((point) => {
        if (!query) return true;
        return (point.name || "").toLocaleLowerCase("tr").includes(query);
      })
    : [];

  const showStart = shouldShowStartByFilter && (!state.startPoint ? !query : startMatchesQuery);

  return {
    showStart,
    filteredPoints
  };
}

function getTripEmptyMessage() {
  const hasSearch = Boolean((state.tripSearchQuery || "").trim());
  const filterMode = state.tripFilterMode || "all";

  if (hasSearch) {
    return "Arama kriterine uygun kayıt bulunamadı.";
  }

  if (filterMode === "start") {
    return "Başlangıç noktası henüz eklenmedi.";
  }

  if (filterMode === "points") {
    return "Henüz eklenmiş konum bulunmuyor.";
  }

  return "Henüz gezi noktası bulunmuyor.";
}

function renderTripList() {
  const { showStart, filteredPoints } = getFilteredTripItems();

  let startHtml = "";

  if (showStart) {
    startHtml = state.startPoint
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
  }

  const pointHtml = filteredPoints
    .map((point) => {
      const realIndex = state.points.findIndex((item) => item.id === point.id);

      return `
        <div class="trip-item">
          <div class="trip-order">${realIndex + 1}</div>
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

  const finalHtml = startHtml + pointHtml;

  elements.tripList.innerHTML =
    finalHtml ||
    `<div class="trip-empty-state">${getTripEmptyMessage()}</div>`;
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
    return;
  }

  const sorted = nearestNeighborRoute(state.startPoint, state.points);
  let total = 0;

  state.points = sorted.map((point, index) => {
    const prev = index === 0 ? state.startPoint : sorted[index - 1];
    const distanceFromPrevious = getDistanceKm(prev, point);
    total += distanceFromPrevious;

    return {
      ...point,
      distanceFromPrevious
    };
  });

  state.totalDistance = total;

  drawRouteSegments(state.startPoint, state.points);

  renderSummary();
  renderTripList();
  redrawPointMarkers();
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

function getDistanceKm(a, b) {
  const lat1 = Number(a.lat) * (Math.PI / 180);
  const lng1 = Number(a.lng) * (Math.PI / 180);
  const lat2 = Number(b.lat) * (Math.PI / 180);
  const lng2 = Number(b.lng) * (Math.PI / 180);

  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const haversine =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return 6371 * c;
}

function upsertPoint(point) {
  if (state.editingPointId) {
    state.points = state.points.map((item) =>
      item.id === state.editingPointId ? { ...item, ...point } : item
    );
  } else {
    state.points.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      ...point
    });
  }

  state.editingPointId = null;
}

function addOrUpdatePoint() {
  const name = elements.pointName.value.trim();
  const lat = Number(elements.pointLat.value);
  const lng = Number(elements.pointLng.value);

  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
    alert("Konum adı ve koordinatlar gerekli.");
    return false;
  }

  if (!isPremiumAccessActive() && getCurrentLocationCount() >= state.locationQuota && !state.editingPointId) {
    alert(`Deneme hesabında başlangıç dahil en fazla ${state.locationQuota} konum ekleyebilirsin.`);
    return false;
  }

  upsertPoint({
    name,
    lat,
    lng,
    type: "point",
    distanceFromPrevious: 0
  });

  clearDraftMarker();
  clearPointForm();
  recomputeRoute();
  markDirty();
  closeFloatingPanels();
  elements.authStatus.textContent = state.editingPointId
    ? "Konum güncellendi."
    : "Konum eklendi.";
  return true;
}

function commitStartPoint() {
  const name = elements.startName.value.trim();
  const lat = Number(elements.startLat.value);
  const lng = Number(elements.startLng.value);

  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
    alert("Başlangıç noktası bilgileri eksik.");
    return false;
  }

  if (!isPremiumAccessActive() && !state.startPoint && getCurrentLocationCount() >= state.locationQuota) {
    alert(`Deneme hesabında başlangıç dahil en fazla ${state.locationQuota} konum ekleyebilirsin.`);
    return false;
  }

  const startPoint = {
    id: "start-point",
    name,
    lat,
    lng,
    type: "start"
  };

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

  clearPointForm();
  recomputeRoute();
  markDirty();
  closeFloatingPanels();
  elements.authStatus.textContent = "Başlangıç noktası kaydedildi.";
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

  try {
    const map = await getMapById(state.currentUser.uid, mapId);
    if (!map) {
      elements.authStatus.textContent = "Harita bulunamadı.";
      return;
    }

    state.selectedMapId = mapId;
    state.startPoint = map.startPoint
      ? {
          id: "start-point",
          ...map.startPoint,
          type: "start"
        }
      : null;

    state.points = Array.isArray(map.points)
      ? map.points.map((point) => ({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          name: point.name,
          lat: Number(point.lat),
          lng: Number(point.lng),
          type: "point",
          distanceFromPrevious: 0
        }))
      : [];

    state.totalDistance = Number(map.totalDistance) || 0;
    state.editingPointId = null;

    elements.mapName.value = map.name || "";
    setStartForm(state.startPoint);
    clearPointForm();
    clearDraftMarker();
    recomputeRoute();
    markClean();
    closeFloatingPanels();
    elements.authStatus.textContent = "Harita yüklendi.";
  } catch (error) {
    elements.authStatus.textContent = `Harita yükleme hatası: ${error.message}`;
  }
}

function getMapListItemHtml(map) {
  const locationCount = Number(map.locationCount) || 0;
  const totalDistance = Number(map.totalDistance) || 0;

  return `
    <button class="map-list-item" type="button" data-map-id="${escapeHtml(map.id)}">
      <div class="map-list-item-info">
        <h3>${escapeHtml(map.name || "İsimsiz Harita")}</h3>
        <p>${locationCount} konum • ${formatKm(totalDistance)}</p>
      </div>
      <div class="map-list-item-actions">
        <span class="tiny-btn" data-action="delete-map" data-map-id="${escapeHtml(map.id)}">Sil</span>
      </div>
    </button>
  `;
}

async function loadUserMaps(uid, fullAccess) {
  try {
    const maps = await getMaps(uid, { fullAccess });

    if (!maps.length) {
      elements.mapList.innerHTML = `<div class="map-list-empty">Henüz kayıtlı harita bulunmuyor.</div>`;
      return;
    }

    elements.mapList.innerHTML = maps.map(getMapListItemHtml).join("");
  } catch (error) {
    elements.mapList.innerHTML = `<div class="map-list-empty">Haritalar yüklenemedi: ${escapeHtml(error.message)}</div>`;
  }
}

async function handleLogout() {
  try {
    await logout();
    window.location.href = "./index.html";
  } catch (error) {
    elements.authStatus.textContent = `Çıkış yapılamadı: ${error.message}`;
  }
}

function getDownloadBaseName() {
  const mapName = elements.mapName.value.trim() || "gezi-listesi";
  return mapName
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function handleExport() {
  const exportType = elements.exportType.value;
  const baseName = getDownloadBaseName();

  if (!state.startPoint && !state.points.length) {
    alert("Dışa aktarmak için en az bir konum bulunmalıdır.");
    return;
  }

  if (exportType === "csv") {
    exportToCsv(baseName, state.startPoint, state.points);
  } else {
    exportToXlsx(baseName, state.startPoint, state.points);
  }

  elements.authStatus.textContent = `${exportType.toUpperCase()} dosyası indirildi.`;
  closeFloatingPanels();
  closeMapMenu();
}

function handleImport() {
  const importType = elements.importType.value;
  if (importType === "csv") {
    elements.csvFileInput.click();
  } else {
    elements.xlsxFileInput.click();
  }
}

function applyImportedState(importedState) {
  state.startPoint = importedState.startPoint
    ? {
        ...importedState.startPoint,
        type: "start"
      }
    : null;

  state.points = Array.isArray(importedState.points)
    ? importedState.points.map((point) => ({
        ...point,
        id: point.id || Date.now().toString(36) + Math.random().toString(36).slice(2),
        type: "point",
        distanceFromPrevious: 0
      }))
    : [];

  state.editingPointId = null;
  clearDraftMarker();
  clearPointForm();
  recomputeRoute();
  markDirty();
  closeFloatingPanels();
}

async function handleCsvFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const rows = await importFromCsvFile(file);
    const importedState = convertImportedRowsToState(rows);
    applyImportedState(importedState);
    elements.authStatus.textContent = "CSV içe aktarıldı.";
  } catch (error) {
    alert(`CSV içe aktarılamadı: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function handleXlsxFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const rows = await importFromXlsxFile(file);
    const importedState = convertImportedRowsToState(rows);
    applyImportedState(importedState);
    elements.authStatus.textContent = "XLSX içe aktarıldı.";
  } catch (error) {
    alert(`XLSX içe aktarılamadı: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function handleTripListClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  const pointId = actionTarget.dataset.id;

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
    openDirections(state.startPoint.lat, state.startPoint.lng);
    return;
  }

  if (!pointId) return;
  const point = state.points.find((item) => item.id === pointId);
  if (!point) return;

  if (action === "delete-point") {
    state.points = state.points.filter((item) => item.id !== pointId);
    if (state.editingPointId === pointId) {
      clearPointForm();
    }
    recomputeRoute();
    markDirty();
    elements.authStatus.textContent = "Konum silindi.";
    return;
  }

  if (action === "directions-point") {
    openDirections(point.lat, point.lng);
  }
}

function openDirections(lat, lng) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function handleCurrentLocationClick() {
  try {
    const result = await locateAndShowUser();
    if (!result) return;

    fillBothFormsFromMap(result.lat, result.lng, result.name || "Mevcut Konumum");
    elements.authStatus.textContent = "Mevcut konum forma aktarıldı.";
  } catch (error) {
    alert(`Konum alınamadı: ${error.message}`);
  }
}

function handleMapClickSelection({ lat, lng, name }) {
  fillBothFormsFromMap(lat, lng, name || "İşaretli Konum");
  elements.authStatus.textContent = "Haritadaki konum forma aktarıldı.";
}

async function initializeUserState(user) {
  state.currentUser = user;

  try {
    state.claims = (await getUserClaims()) || {};
  } catch (error) {
    state.claims = {};
  }

  try {
    await ensureUserProfile(user.uid, {
      email: user.email || "",
      displayName: user.displayName || ""
    });

    state.profile = await getUserProfile(user.uid);
    state.fullAccess = Boolean(state.profile?.fullAccess);
    state.accessActive = Boolean(state.profile?.accessActive);
    state.locationQuota = Number(state.profile?.locationQuota) || TRIAL_LOCATION_QUOTA;
    state.mapQuota = Number(state.profile?.mapQuota) || 1;
  } catch (error) {
    state.profile = null;
    state.fullAccess = false;
    state.accessActive = false;
    state.locationQuota = TRIAL_LOCATION_QUOTA;
    state.mapQuota = 1;
  }

  elements.authStatus.textContent = `Hoş geldiniz. ${getAccessStatusText()}`;
  await refreshMapList();
}

function bindStaticUiHandlers() {
  elements.btnMenu?.addEventListener("click", () => {
    toggleMapMenu();
  });

  elements.btnOpenSavedMaps?.addEventListener("click", () => {
    openSavedMapsOverlay();
    closeMapMenu();
  });

  elements.btnOpenImportCard?.addEventListener("click", () => {
    openFloatingPanel("import");
    closeMapMenu();
  });

  elements.btnOpenExportCard?.addEventListener("click", () => {
    openFloatingPanel("export");
    closeMapMenu();
  });

  elements.btnCloseStartCard?.addEventListener("click", () => closeFloatingPanels());
  elements.btnClosePointCard?.addEventListener("click", () => closeFloatingPanels());
  elements.btnCloseExportCard?.addEventListener("click", () => closeFloatingPanels());
  elements.btnCloseImportCard?.addEventListener("click", () => closeFloatingPanels());

  elements.btnCloseMapListPanel?.addEventListener("click", () => closeSavedMapsOverlay());
  elements.savedMapsBackdrop?.addEventListener("click", () => closeSavedMapsOverlay());

  document.addEventListener("click", (event) => {
    const clickedMenu = event.target.closest(".menu-wrapper");
    if (!clickedMenu) {
      closeMapMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFloatingPanels();
      closeMapMenu();
      closeSavedMapsOverlay();
    }
  });
}

function installScrollBehavior() {
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

  elements.tripSearchInput?.addEventListener("input", (event) => {
    state.tripSearchQuery = event.target.value || "";
    renderTripList();
  });

  elements.tripFilterSelect?.addEventListener("change", (event) => {
    state.tripFilterMode = event.target.value || "all";
    renderTripList();
  });

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

  elements.mapName?.addEventListener("input", () => {
    markDirty();
  });
}

function initGoogleMap() {
  initMap({
    elementId: "map",
    onMapClick: handleMapClickSelection,
    onInfoAction: fillPointFormFromMarker
  });

  initPlaceSearch({
    onSelect: ({ lat, lng, name }) => {
      fillBothFormsFromMap(lat, lng, name || "İşaretli Konum");
      elements.authStatus.textContent = "Arama sonucu forma aktarıldı.";
    }
  });

  enableMapClickPicker({
    onSelect: ({ lat, lng, name }) => {
      fillBothFormsFromMap(lat, lng, name || "İşaretli Konum");
      elements.authStatus.textContent = "Harita tıklaması forma aktarıldı.";
    }
  });
}

async function bootstrapApp() {
  bindStaticUiHandlers();
  bindEvents();
  installScrollBehavior();
  initGoogleMap();
  renderSummary();
  renderTripList();

  watchAuth(async (user) => {
    if (!user) {
      window.location.href = "./index.html";
      return;
    }

    await initializeUserState(user);
  });
}

window.initRoutePlanner = () => {
  bootstrapApp().catch((error) => {
    console.error(error);
    elements.authStatus.textContent = `Başlatma hatası: ${error.message}`;
  });
};
