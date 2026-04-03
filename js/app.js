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
import {
  OFFLINE_TRIAL_MAP_ID,
  isLocalMapId,
  persistOfflineSession,
  getOfflineSession,
  clearOfflineSession,
  getOfflineMaps,
  setOfflineMaps,
  getOfflineMapById,
  saveOfflineMap,
  removeOfflineMap,
  toMillis
} from "./offline-storage.js";

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
  offlineMode: false
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
  importExportPanel: document.getElementById("importExportPanel")
};

function goToLogin() {
  window.location.href = "./index.html";
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

function normalizeStoredTime(value) {
  const millis = toMillis(value);
  return Number.isFinite(millis) ? millis : 0;
}

function isOfflineRuntime() {
  return state.offlineMode || !navigator.onLine;
}

function getOfflineStatusLabel() {
  return "Çevrimdışı mod · Haritalar cihazda saklanır";
}

function buildStatusText(prefix) {
  if (!prefix) return getOfflineStatusLabel();
  return isOfflineRuntime() ? `${prefix} · ${getOfflineStatusLabel()}` : prefix;
}

function mergeMapsForList(remoteMaps = [], localMaps = []) {
  const merged = new Map();

  remoteMaps.forEach((map) => {
    merged.set(String(map.id), {
      ...map,
      storage: "cloud"
    });
  });

  localMaps.forEach((map) => {
    if (map?.storage === "offline" || isLocalMapId(map?.id)) {
      merged.set(String(map.id), {
        ...map,
        storage: "offline"
      });
      return;
    }

    if (!merged.has(String(map.id))) {
      merged.set(String(map.id), {
        ...map,
        storage: map?.storage === "offline" ? "offline" : "cloud"
      });
    }
  });

  return Array.from(merged.values()).sort(
    (a, b) =>
      Number(b.updatedAt?.toMillis?.() || b.updatedAt || 0) -
      Number(a.updatedAt?.toMillis?.() || a.updatedAt || 0)
  );
}

function syncMapsToOfflineCache(uid, remoteMaps = []) {
  if (!uid) return;

  const localMaps = getOfflineMaps(uid);
  const localOnlyMaps = localMaps.filter(
    (map) => map?.storage === "offline" || isLocalMapId(map?.id)
  );

  const normalizedRemote = remoteMaps.map((map) => ({
    ...map,
    storage: "cloud",
    createdAt: map?.createdAt?.toMillis?.() || map?.createdAt || Date.now(),
    updatedAt: map?.updatedAt?.toMillis?.() || map?.updatedAt || Date.now()
  }));

  setOfflineMaps(uid, [...normalizedRemote, ...localOnlyMaps]);
}

function persistCurrentOfflineSnapshot() {
  if (!state.currentUser?.uid || !state.currentUser?.email) return;

  persistOfflineSession(state.currentUser, {
    claims: state.claims,
    profile: state.profile,
    fullAccess: state.fullAccess
  });
}

function applyOfflineUserSession(session) {
  if (!session?.uid) return false;

  state.offlineMode = true;
  state.currentUser = {
    uid: session.uid,
    email: session.email
  };
  state.claims = session.claims || {};
  state.profile = session.profile || null;
  state.fullAccess = session.fullAccess === true || session?.claims?.fullAccess === true;
  state.locationQuota =
    Number(session?.profile?.locationQuota ?? TRIAL_LOCATION_QUOTA) || TRIAL_LOCATION_QUOTA;
  state.mapQuota = Number(session?.profile?.mapQuota ?? 1) || 1;
  state.accessActive = hasActiveAccess();
  return true;
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
  return normalizeStoredTime(state.profile?.trialEndsAt);
}

function getAccessUntilMs() {
  return normalizeStoredTime(state.profile?.accessUntil);
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
  if (isLocalMapId(mapId)) return true;
  if (isPremiumAccessActive()) return true;
  return mapId === TRIAL_MAP_ID || mapId === OFFLINE_TRIAL_MAP_ID;
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

  return state.selectedMapId === TRIAL_MAP_ID || state.selectedMapId === OFFLINE_TRIAL_MAP_ID;
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

function addOrUpdatePoint() {
  if (!hasActiveAccess()) {
    alert("Erişim süreniz dolmuş.");
    return;
  }

  const name = elements.pointName.value.trim();
  const lat = elements.pointLat.value.trim();
  const lng = elements.pointLng.value.trim();

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
            lng: Number(lng)
          }
        : point
    );
  } else {
    state.points.push({
      id: Date.now() + Math.random(),
      name,
      lat: Number(lat),
      lng: Number(lng),
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
  elements.authStatus.textContent = buildStatusText(
    `Yeni harita oluşturuluyor. ${getAccessStatusText()}`
  );
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
  const shouldUseLocalSave = isOfflineRuntime() || isLocalMapId(state.selectedMapId);

  try {
    if (shouldUseLocalSave) {
      const result = saveOfflineMap(state.currentUser.uid, payload, {
        mapId: state.selectedMapId || null,
        fullAccess: isPremiumAccessActive()
      });

      state.selectedMapId = result?.id || state.selectedMapId || OFFLINE_TRIAL_MAP_ID;
      await refreshMapList();
      markClean();
      closeFloatingPanels();
      alert("Harita cihazda çevrimdışı kullanım için kaydedildi.");
      resetMapEditor();
      return;
    }

    if (isPremiumAccessActive()) {
      if (state.selectedMapId) {
        await updateMap(state.currentUser.uid, state.selectedMapId, payload);
        elements.authStatus.textContent = buildStatusText("Harita güncellendi.");
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
    if (state.currentUser?.uid) {
      const result = saveOfflineMap(state.currentUser.uid, payload, {
        mapId: state.selectedMapId || null,
        fullAccess: isPremiumAccessActive()
      });
      state.selectedMapId = result?.id || state.selectedMapId || OFFLINE_TRIAL_MAP_ID;
      await refreshMapList();
      markClean();
      closeFloatingPanels();
      elements.authStatus.textContent = buildStatusText(
        "Bağlantı olmadığı için harita cihazda kaydedildi."
      );
      return;
    }

    elements.authStatus.textContent = buildStatusText(`Kaydetme hatası: ${error.message}`);
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
    if (isLocalMapId(mapId) || isOfflineRuntime()) {
      removeOfflineMap(state.currentUser.uid, mapId);
    } else {
      await removeMap(state.currentUser.uid, mapId);
      const cachedMaps = getOfflineMaps(state.currentUser.uid).filter(
        (item) => item.id !== String(mapId)
      );
      setOfflineMaps(state.currentUser.uid, cachedMaps);
    }

    if (state.selectedMapId === mapId) {
      resetMapEditor();
    }

    await refreshMapList();
    elements.authStatus.textContent = buildStatusText("Harita silindi.");
  } catch (error) {
    elements.authStatus.textContent = buildStatusText(`Silme hatası: ${error.message}`);
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
    elements.authStatus.textContent = buildStatusText(
      "Bu harita yalnızca premium erişimde görüntülenebilir."
    );
    return;
  }

  try {
    let mapData = null;

    if (isLocalMapId(mapId) || isOfflineRuntime()) {
      mapData = getOfflineMapById(state.currentUser.uid, mapId);
    } else {
      try {
        mapData = await getMapById(state.currentUser.uid, mapId, {
          fullAccess: isPremiumAccessActive()
        });
      } catch {
        mapData = getOfflineMapById(state.currentUser.uid, mapId);
      }
    }

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
          distanceFromPrevious: 0,
          type: "point"
        }))
      : [];

    const applied = applyImportedData(startPoint, points);
    if (!applied) return;

    focusMapToPoints(startPoint, points);

    markClean();
    elements.authStatus.textContent = buildStatusText(
      `Harita yüklendi: ${mapData.name || "İsimsiz Harita"}`
    );
    highlightSelectedMap(mapId);
  } catch (error) {
    elements.authStatus.textContent = buildStatusText(
      `Harita yükleme hatası: ${error.message}`
    );
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
    elements.authStatus.textContent = buildStatusText(
      "Mevcut konum haritada gösterildi."
    );
  } catch (error) {
    elements.authStatus.textContent = buildStatusText(
      `Konum alınamadı: ${error.message}`
    );
  }
}

async function handleLogout() {
  try {
    clearOfflineSession();

    if (isOfflineRuntime()) {
      goToLogin();
      return;
    }

    await logout();
    goToLogin();
  } catch (error) {
    elements.authStatus.textContent = buildStatusText(`Çıkış hatası: ${error.message}`);
  }
}

function loadEmptyMapListMessage() {
  elements.mapList.innerHTML =
    `<div class="map-list-item"><strong>Henüz kayıtlı harita yok</strong></div>`;
}

async function loadUserMaps(uid, fullAccess) {
  try {
    let maps = [];

    if (isOfflineRuntime()) {
      maps = getOfflineMaps(uid);
    } else {
      const remoteMaps = await getMaps(uid, { fullAccess });
      syncMapsToOfflineCache(uid, remoteMaps);
      maps = mergeMapsForList(remoteMaps, getOfflineMaps(uid));
    }

    if (!maps.length) {
      if (
        !fullAccess &&
        state.selectedMapId &&
        state.selectedMapId !== TRIAL_MAP_ID &&
        state.selectedMapId !== OFFLINE_TRIAL_MAP_ID
      ) {
        resetMapEditor();
      }
      loadEmptyMapListMessage();
      return;
    }

    if (
      !fullAccess &&
      state.selectedMapId &&
      state.selectedMapId !== TRIAL_MAP_ID &&
      state.selectedMapId !== OFFLINE_TRIAL_MAP_ID &&
      !isLocalMapId(state.selectedMapId)
    ) {
      resetMapEditor();
    }

    elements.mapList.innerHTML = maps
      .map(
        (map) => `
          <div class="map-list-row">
            <button class="map-list-item ${state.selectedMapId === map.id ? "active" : ""}" type="button" data-map-id="${map.id}">
              <strong>${escapeHtml(map.name || "İsimsiz Harita")}</strong>
              <span>Toplam mesafe: ${formatKm(map.totalDistance || 0)}</span>
              <span>${map.storage === "offline" ? "Cihazda kayıtlı" : "Bulutta kayıtlı"}</span>
            </button>
            <button class="tiny-btn danger-outline" type="button" data-action="delete-map" data-map-id="${map.id}">
              Sil
            </button>
          </div>
        `
      )
      .join("");
  } catch {
    const fallbackMaps = getOfflineMaps(uid);

    if (!fallbackMaps.length) {
      elements.mapList.innerHTML =
        `<div class="map-list-item"><strong>Haritalar yüklenemedi</strong></div>`;
      return;
    }

    elements.mapList.innerHTML = fallbackMaps
      .map(
        (map) => `
          <div class="map-list-row">
            <button class="map-list-item ${state.selectedMapId === map.id ? "active" : ""}" type="button" data-map-id="${map.id}">
              <strong>${escapeHtml(map.name || "İsimsiz Harita")}</strong>
              <span>Toplam mesafe: ${formatKm(map.totalDistance || 0)}</span>
              <span>Cihazda kayıtlı</span>
            </button>
            <button class="tiny-btn danger-outline" type="button" data-action="delete-map" data-map-id="${map.id}">
              Sil
            </button>
          </div>
        `
      )
      .join("");
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
    window.location.href = url;
    return;
  }

  if (action === "directions-point") {
    const point = state.points.find(
      (item) => String(item.id) === String(target.dataset.id)
    );
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

  document.body.classList.toggle(
    "has-mobile-floating-panel",
    isMobile && Boolean(panelName)
  );
  document.body.dataset.mobilePanel = isMobile ? panelName : "";
}

function toggleMapMenu(forceValue) {
  state.mapMenuOpen =
    typeof forceValue === "boolean" ? forceValue : !state.mapMenuOpen;
  elements.mapMenu?.classList.toggle("hidden", !state.mapMenuOpen);
}

function closeFloatingPanels() {
  [
    elements.startPanel,
    elements.pointPanel,
    elements.savePanel,
    elements.importExportPanel
  ].forEach((panel) => {
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
  elements.btnOpenImportExportPanel?.addEventListener("click", () =>
    openFloatingPanel("importExport")
  );
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
      elements.authStatus.textContent = buildStatusText(
        `Haritadan seçim yapıldı: ${name}`
      );
    } else {
      elements.authStatus.textContent = buildStatusText(
        `Haritadan seçim yapıldı: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
      );
    }
  });
}

function initSearchBox() {
  initPlaceSearch(elements.placeSearch, ({ name, lat, lng }) => {
    if (!hasActiveAccess()) return;
    fillBothFormsFromMap(lat, lng, name);
    markDirty();
    elements.authStatus.textContent = buildStatusText(
      `Arama ile yer seçildi: ${name}`
    );
  });
}

async function loadAccessModel(user) {
  state.claims = await getUserClaims(user);
  state.profile = await getUserProfile(user.uid);
  state.fullAccess = state.claims.fullAccess === true;
  state.locationQuota = state.profile?.locationQuota || TRIAL_LOCATION_QUOTA;
  state.mapQuota = state.profile?.mapQuota || 1;
  state.accessActive = hasActiveAccess();
  persistCurrentOfflineSnapshot();
}

async function bootstrapOfflineMode() {
  const offlineSession = getOfflineSession();
  if (!applyOfflineUserSession(offlineSession)) {
    goToLogin();
    return;
  }

  elements.authStatus.textContent = buildStatusText(
    `Aktif kullanıcı: ${state.currentUser.email} · ${getAccessStatusText()}`
  );
  await loadUserMaps(state.currentUser.uid, isPremiumAccessActive());
}

function initConnectionWatcher() {
  window.addEventListener("offline", async () => {
    state.offlineMode = true;

    if (state.currentUser?.uid) {
      elements.authStatus.textContent = buildStatusText(
        `Aktif kullanıcı: ${state.currentUser.email} · ${getAccessStatusText()}`
      );
      await loadUserMaps(state.currentUser.uid, isPremiumAccessActive());
    }
  });

  window.addEventListener("online", async () => {
    state.offlineMode = false;

    if (state.currentUser?.uid) {
      elements.authStatus.textContent = `Aktif kullanıcı: ${state.currentUser.email} · ${getAccessStatusText()}`;
      await loadUserMaps(state.currentUser.uid, isPremiumAccessActive());
    }
  });
}

function initAuthWatcher() {
  if (!navigator.onLine) {
    bootstrapOfflineMode();
    return;
  }

  watchAuth(async (user) => {
    state.currentUser = user;
    state.offlineMode = false;

    if (user) {
      await ensureUserProfile(user.uid, user.email);
      await loadAccessModel(user);
      elements.authStatus.textContent = `Aktif kullanıcı: ${user.email} · ${getAccessStatusText()}`;
      await loadUserMaps(user.uid, isPremiumAccessActive());
    } else {
      const offlineSession = getOfflineSession();

      if (!navigator.onLine && offlineSession?.uid) {
        await bootstrapOfflineMode();
        return;
      }

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
  initConnectionWatcher();
  initAuthWatcher();
}

document.addEventListener("DOMContentLoaded", init);
