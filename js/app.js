// js/app.js
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
  btnOpenMapMenu: document.getElementById("btnOpenMapMenu"),
  btnOpenAddPointPanel: document.getElementById("btnOpenAddPointPanel"),
  btnOpenAddStartPanel: document.getElementById("btnOpenAddStartPanel"),
  btnOpenImportExportPanel: document.getElementById("btnOpenImportExportPanel"),
  btnCloseMapMenu: document.getElementById("btnCloseMapMenu"),
  btnCloseAddPointPanel: document.getElementById("btnCloseAddPointPanel"),
  btnCloseAddStartPanel: document.getElementById("btnCloseAddStartPanel"),
  btnCloseImportExportPanel: document.getElementById("btnCloseImportExportPanel"),
  btnLocateMe: document.getElementById("btnLocateMe"),
  btnOptimizeRoute: document.getElementById("btnOptimizeRoute"),
  btnClearAll: document.getElementById("btnClearAll"),
  btnSaveMap: document.getElementById("btnSaveMap"),
  pointsContainer: document.getElementById("pointsContainer"),
  summaryStartName: document.getElementById("summaryStartName"),
  summaryStartMeta: document.getElementById("summaryStartMeta"),
  summaryPointCount: document.getElementById("summaryPointCount"),
  summaryDistance: document.getElementById("summaryDistance"),
  startPointCard: document.getElementById("startPointCard"),
  authStatus: document.getElementById("authStatus"),
  toast: document.getElementById("toast"),
  placeSearchInput: document.getElementById("placeSearchInput"),
  searchDropdown: document.getElementById("searchDropdown"),
  floatingBackdrop: document.getElementById("floatingBackdrop"),
  mapMenuPanel: document.getElementById("mapMenuPanel"),
  addPointPanel: document.getElementById("addPointPanel"),
  addStartPanel: document.getElementById("addStartPanel"),
  importExportPanel: document.getElementById("importExportPanel"),
  pointNameInput: document.getElementById("pointNameInput"),
  pointSelectionStatus: document.getElementById("pointSelectionStatus"),
  btnPickPointFromMap: document.getElementById("btnPickPointFromMap"),
  btnConfirmPoint: document.getElementById("btnConfirmPoint"),
  startPointNameInput: document.getElementById("startPointNameInput"),
  startSelectionStatus: document.getElementById("startSelectionStatus"),
  btnPickStartFromMap: document.getElementById("btnPickStartFromMap"),
  btnConfirmStartPoint: document.getElementById("btnConfirmStartPoint"),
  btnExportCsv: document.getElementById("btnExportCsv"),
  btnExportXlsx: document.getElementById("btnExportXlsx"),
  fileImportCsv: document.getElementById("fileImportCsv"),
  fileImportXlsx: document.getElementById("fileImportXlsx"),
  trialBadge: document.getElementById("trialBadge"),
  trialQuotaText: document.getElementById("trialQuotaText"),
  btnUpgradeNow: document.getElementById("btnUpgradeNow"),
  planBadge: document.getElementById("planBadge"),
  planQuotaText: document.getElementById("planQuotaText"),
  mapSelector: document.getElementById("mapSelector"),
  btnRefreshMaps: document.getElementById("btnRefreshMaps"),
  btnNewMap: document.getElementById("btnNewMap"),
  btnRenameMap: document.getElementById("btnRenameMap"),
  btnDeleteMap: document.getElementById("btnDeleteMap"),
  mapNameInput: document.getElementById("mapNameInput"),
  btnSaveMapName: document.getElementById("btnSaveMapName"),
  mapQuotaBadge: document.getElementById("mapQuotaBadge"),
  mapListBox: document.getElementById("mapListBox"),
  btnRefreshMapsMobile: document.getElementById("btnRefreshMapsMobile"),
  btnNewMapMobile: document.getElementById("btnNewMapMobile"),
  btnRenameMapMobile: document.getElementById("btnRenameMapMobile"),
  btnDeleteMapMobile: document.getElementById("btnDeleteMapMobile"),
  btnLogoutTop: document.getElementById("btnLogoutTop")
};

const draftSelections = {
  point: null,
  start: null
};

let toastTimer = null;

function generateId() {
  return `point-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDistance(km) {
  if (!Number.isFinite(km) || km <= 0) {
    return "0 km";
  }

  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }

  return `${km.toFixed(2)} km`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showToast(message, type = "info") {
  if (!elements.toast) return;

  elements.toast.textContent = message;
  elements.toast.dataset.type = type;
  elements.toast.hidden = false;
  elements.toast.classList.add("toast--visible");

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("toast--visible");
    elements.toast.hidden = true;
  }, 2800);
}

function openFloatingPanel(panelName) {
  const mapping = {
    mapMenu: elements.mapMenuPanel,
    addPoint: elements.addPointPanel,
    addStart: elements.addStartPanel,
    importExport: elements.importExportPanel
  };

  Object.entries(mapping).forEach(([name, panel]) => {
    const isTarget = name === panelName;
    if (!panel) return;
    panel.hidden = !isTarget;
    panel.setAttribute("aria-hidden", String(!isTarget));
  });

  state.activeFloatingPanel = panelName;
  elements.floatingBackdrop.hidden = !panelName;
  document.body.classList.toggle("body-has-floating-panel", Boolean(panelName));

  if (panelName === "mapMenu") {
    state.mapMenuOpen = true;
  } else {
    state.mapMenuOpen = false;
  }
}

function closeFloatingPanels() {
  openFloatingPanel(null);
}

function updateSelectionStatus(target, text, active = false) {
  const el =
    target === "start" ? elements.startSelectionStatus : elements.pointSelectionStatus;

  if (!el) return;

  el.textContent = text;
  el.classList.toggle("selection-status--active", active);
}

function syncInputWithDraft(target) {
  if (target === "start") {
    const draft = draftSelections.start;
    if (elements.startPointNameInput) {
      elements.startPointNameInput.value = draft?.name || "";
    }
    updateSelectionStatus(
      "start",
      draft ? "Konum seçildi" : "Konum seçilmedi",
      Boolean(draft)
    );
    return;
  }

  const draft = draftSelections.point;
  if (elements.pointNameInput) {
    elements.pointNameInput.value = draft?.name || "";
  }
  updateSelectionStatus(
    "point",
    draft ? "Konum seçildi" : "Konum seçilmedi",
    Boolean(draft)
  );
}

function buildDisplayName(baseName, prefix = "Nokta") {
  const trimmed = String(baseName || "").trim();
  if (trimmed) return trimmed;
  return `${prefix} ${state.points.length + 1}`;
}

function clearDraft(target) {
  if (target === "start") {
    draftSelections.start = null;
  } else {
    draftSelections.point = null;
  }
  syncInputWithDraft(target);
  clearDraftMarker();
}

function renderSummary() {
  elements.summaryPointCount.textContent = String(state.points.length);
  elements.summaryDistance.textContent = formatDistance(state.totalDistance);

  if (state.startPoint) {
    elements.summaryStartName.textContent = state.startPoint.name || "Başlangıç";
    elements.summaryStartMeta.textContent = `${state.startPoint.lat.toFixed(5)}, ${state.startPoint.lng.toFixed(5)}`;
  } else {
    elements.summaryStartName.textContent = "Henüz eklenmedi";
    elements.summaryStartMeta.textContent = "Haritadan veya konum servisinden seçin";
  }

  if (state.startPoint) {
    elements.startPointCard.classList.remove("point-card--empty");
    elements.startPointCard.innerHTML = `
      <div class="point-card-title">Başlangıç Noktası</div>
      <div class="point-card-name">${escapeHtml(state.startPoint.name || "Başlangıç")}</div>
      <div class="point-card-meta">${state.startPoint.lat.toFixed(5)}, ${state.startPoint.lng.toFixed(5)}</div>
      <div class="point-card-actions">
        <button class="ghost-btn" type="button" data-action="edit-start">Düzenle</button>
        <button class="danger-btn" type="button" data-action="remove-start">Kaldır</button>
      </div>
    `;
  } else {
    elements.startPointCard.classList.add("point-card--empty");
    elements.startPointCard.textContent = "Başlangıç noktası seçilmedi";
  }

  elements.pointsContainer.innerHTML = "";

  if (!state.points.length) {
    const empty = document.createElement("div");
    empty.className = "point-card point-card--empty";
    empty.textContent = "Henüz durak eklenmedi";
    elements.pointsContainer.appendChild(empty);
    return;
  }

  state.points.forEach((point, index) => {
    const card = document.createElement("article");
    card.className = "point-card";
    card.dataset.pointId = point.id;

    card.innerHTML = `
      <div class="point-card-header">
        <span class="point-order">${index + 1}</span>
        <div>
          <div class="point-card-name">${escapeHtml(point.name || `Nokta ${index + 1}`)}</div>
          <div class="point-card-meta">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</div>
        </div>
      </div>
      <div class="point-card-actions">
        <button class="ghost-btn" type="button" data-action="edit-point">Düzenle</button>
        <button class="danger-btn" type="button" data-action="remove-point">Sil</button>
      </div>
    `;

    elements.pointsContainer.appendChild(card);
  });
}

function renderMapPoints() {
  clearMarkers();
  clearStartMarker();
  clearRouteLines();

  if (state.startPoint) {
    showStartMarker({
      lat: state.startPoint.lat,
      lng: state.startPoint.lng,
      title: state.startPoint.name || "Başlangıç",
      pointData: {
        ...state.startPoint,
        type: "start",
        orderLabel: "S"
      },
      onClick: () => {
        draftSelections.start = { ...state.startPoint };
        syncInputWithDraft("start");
        openFloatingPanel("addStart");
      }
    });
  }

  state.points.forEach((point, index) => {
    addMarker({
      lat: point.lat,
      lng: point.lng,
      title: point.name || `Nokta ${index + 1}`,
      label: String(index + 1),
      pointData: {
        ...point,
        type: "point",
        orderLabel: index + 1
      },
      onClick: () => {
        state.editingPointId = point.id;
        draftSelections.point = { ...point };
        syncInputWithDraft("point");
        openFloatingPanel("addPoint");
      }
    });
  });

  const allPoints = [];
  if (state.startPoint) {
    allPoints.push(state.startPoint);
  }
  allPoints.push(...state.points);

  focusMapToPoints(allPoints);

  if (state.startPoint && state.points.length) {
    const routePoints = [state.startPoint, ...state.points];
    drawRouteSegments(routePoints);
  }
}

function recalculateDistance() {
  const routePoints = [];
  if (state.startPoint) {
    routePoints.push(state.startPoint);
  }
  routePoints.push(...state.points);

  if (routePoints.length < 2) {
    state.totalDistance = 0;
    return;
  }

  let total = 0;
  for (let i = 1; i < routePoints.length; i += 1) {
    const prev = routePoints[i - 1];
    const curr = routePoints[i];
    total += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
  }

  state.totalDistance = total;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function commitStateChanges() {
  recalculateDistance();
  renderSummary();
  renderMapPoints();
  state.hasUnsavedChanges = true;
  updateSaveButtonState();
}

function resetMapEditorInput() {
  if (elements.mapNameInput) {
    elements.mapNameInput.value = "";
  }
}

function updateQuotaBadges(mapCount = 0) {
  if (elements.trialBadge && elements.trialQuotaText) {
    if (state.fullAccess) {
      elements.trialBadge.hidden = true;
    } else {
      elements.trialBadge.hidden = false;
      const used = Math.min(state.points.length, state.locationQuota);
      elements.trialQuotaText.textContent = `${used} / ${state.locationQuota} konum`;
    }
  }

  if (elements.btnUpgradeNow) {
    elements.btnUpgradeNow.hidden = state.fullAccess;
  }

  if (elements.planBadge && elements.planQuotaText) {
    elements.planBadge.hidden = false;
    elements.planQuotaText.textContent = `${mapCount} / ${state.mapQuota} harita`;
  }

  if (elements.mapQuotaBadge) {
    elements.mapQuotaBadge.textContent = `${mapCount} / ${state.mapQuota}`;
  }
}

function updateSaveButtonState() {
  if (!elements.btnSaveMap) return;

  const hasSelection = Boolean(state.selectedMapId);
  const canSave = hasSelection && state.currentUser;

  elements.btnSaveMap.disabled = !canSave;
  elements.btnSaveMap.textContent = state.hasUnsavedChanges ? "Haritayı Kaydet*" : "Haritayı Kaydet";
}

function normalizePoint(point) {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id: point.id || generateId(),
    name: String(point.name || "").trim(),
    lat,
    lng
  };
}

function applyLoadedMapData(mapData) {
  state.startPoint = normalizePoint(mapData?.startPoint);
  state.points = Array.isArray(mapData?.points)
    ? mapData.points.map(normalizePoint).filter(Boolean)
    : [];
  state.totalDistance = Number(mapData?.totalDistance) || 0;
  state.hasUnsavedChanges = false;
  state.editingPointId = null;
  draftSelections.point = null;
  draftSelections.start = null;
  syncInputWithDraft("point");
  syncInputWithDraft("start");
  commitStateChanges();
  state.hasUnsavedChanges = false;
  updateSaveButtonState();
}

function getCurrentMapPayload() {
  return {
    startPoint: state.startPoint,
    points: state.points,
    totalDistance: state.totalDistance
  };
}

async function refreshMapCollections(selectMapId = state.selectedMapId) {
  if (!state.currentUser) return;

  try {
    const maps = await getMaps(state.currentUser.uid);
    const mapCount = maps.length;
    updateQuotaBadges(mapCount);

    if (elements.mapSelector) {
      elements.mapSelector.innerHTML = `<option value="">Harita seçin</option>`;
      maps.forEach((mapItem) => {
        const option = document.createElement("option");
        option.value = mapItem.id;
        option.textContent = mapItem.name || "İsimsiz Harita";
        if (selectMapId && mapItem.id === selectMapId) {
          option.selected = true;
        }
        elements.mapSelector.appendChild(option);
      });
    }

    if (elements.mapListBox) {
      elements.mapListBox.innerHTML = "";
      if (!maps.length) {
        const empty = document.createElement("div");
        empty.className = "point-card point-card--empty";
        empty.textContent = "Kayıtlı harita bulunamadı";
        elements.mapListBox.appendChild(empty);
      } else {
        maps.forEach((mapItem) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "point-card";
          if (mapItem.id === selectMapId) {
            item.classList.add("point-card--selected");
          }
          item.innerHTML = `
            <div class="point-card-title">${escapeHtml(mapItem.name || "İsimsiz Harita")}</div>
            <div class="point-card-meta">${mapItem.id === TRIAL_MAP_ID ? "Deneme Haritası" : "Kayıtlı Harita"}</div>
          `;
          item.addEventListener("click", async () => {
            await handleMapSelection(mapItem.id);
            closeFloatingPanels();
          });
          elements.mapListBox.appendChild(item);
        });
      }
    }

    updateSaveButtonState();
    return maps;
  } catch (error) {
    console.error(error);
    showToast("Haritalar yüklenemedi", "error");
    return [];
  }
}

async function ensureDefaultTrialMap() {
  if (!state.currentUser) return null;
  if (state.fullAccess) return null;

  try {
    const existing = await getMapById(state.currentUser.uid, TRIAL_MAP_ID);
    if (existing) {
      return existing;
    }

    const profile = await getUserProfile(state.currentUser.uid);
    const mapName = profile?.selectedMapName || "Deneme Haritam";

    await saveMap(state.currentUser.uid, {
      id: TRIAL_MAP_ID,
      name: mapName,
      ...getCurrentMapPayload()
    });

    return await getMapById(state.currentUser.uid, TRIAL_MAP_ID);
  } catch (error) {
    console.error(error);
    showToast("Deneme haritası oluşturulamadı", "error");
    return null;
  }
}

async function handleMapSelection(mapId) {
  if (!state.currentUser || !mapId) return;

  try {
    const mapData = await getMapById(state.currentUser.uid, mapId);
    if (!mapData) {
      showToast("Harita bulunamadı", "error");
      return;
    }

    state.selectedMapId = mapId;
    applyLoadedMapData(mapData);
    resetMapEditorInput();
    await ensureUserProfile(state.currentUser.uid, { selectedMapId: mapId });
    await refreshMapCollections(mapId);
    showToast("Harita yüklendi", "success");
  } catch (error) {
    console.error(error);
    showToast("Harita yüklenemedi", "error");
  }
}

async function createNewMap() {
  if (!state.currentUser) return;

  const currentMaps = await getMaps(state.currentUser.uid);
  if (!state.fullAccess && currentMaps.length >= state.mapQuota) {
    showToast("Deneme sürümünde sadece 1 harita oluşturabilirsiniz", "warning");
    return;
  }

  const providedName = String(elements.mapNameInput?.value || "").trim();
  const name = providedName || `Yeni Harita ${currentMaps.length + 1}`;

  try {
    const saved = await saveMap(state.currentUser.uid, {
      name,
      startPoint: null,
      points: [],
      totalDistance: 0
    });

    state.selectedMapId = saved.id;
    state.startPoint = null;
    state.points = [];
    state.totalDistance = 0;
    state.hasUnsavedChanges = false;
    state.editingPointId = null;
    draftSelections.point = null;
    draftSelections.start = null;
    syncInputWithDraft("point");
    syncInputWithDraft("start");
    commitStateChanges();
    state.hasUnsavedChanges = false;
    await ensureUserProfile(state.currentUser.uid, { selectedMapId: saved.id });
    await refreshMapCollections(saved.id);
    resetMapEditorInput();
    showToast("Yeni harita oluşturuldu", "success");
  } catch (error) {
    console.error(error);
    showToast("Yeni harita oluşturulamadı", "error");
  }
}

async function renameSelectedMap() {
  if (!state.currentUser || !state.selectedMapId) {
    showToast("Önce bir harita seçin", "warning");
    return;
  }

  const name = String(elements.mapNameInput?.value || "").trim();
  if (!name) {
    showToast("Yeni harita adını girin", "warning");
    return;
  }

  try {
    await updateMap(state.currentUser.uid, state.selectedMapId, { name });
    await refreshMapCollections(state.selectedMapId);
    resetMapEditorInput();
    showToast("Harita adı güncellendi", "success");
  } catch (error) {
    console.error(error);
    showToast("Harita adı güncellenemedi", "error");
  }
}

async function deleteSelectedMap() {
  if (!state.currentUser || !state.selectedMapId) {
    showToast("Silmek için bir harita seçin", "warning");
    return;
  }

  const confirmed = window.confirm("Seçili harita silinsin mi?");
  if (!confirmed) return;

  try {
    await removeMap(state.currentUser.uid, state.selectedMapId);

    const remainingMaps = await refreshMapCollections(null);
    const nextMapId = remainingMaps?.[0]?.id || null;

    if (nextMapId) {
      await handleMapSelection(nextMapId);
    } else {
      state.selectedMapId = null;
      state.startPoint = null;
      state.points = [];
      state.totalDistance = 0;
      state.hasUnsavedChanges = false;
      commitStateChanges();
      state.hasUnsavedChanges = false;
      updateSaveButtonState();
    }

    showToast("Harita silindi", "success");
  } catch (error) {
    console.error(error);
    showToast("Harita silinemedi", "error");
  }
}

async function saveCurrentMap() {
  if (!state.currentUser || !state.selectedMapId) {
    showToast("Kaydetmek için bir harita seçin", "warning");
    return;
  }

  try {
    await updateMap(state.currentUser.uid, state.selectedMapId, getCurrentMapPayload());
    state.hasUnsavedChanges = false;
    updateSaveButtonState();
    showToast("Harita kaydedildi", "success");
  } catch (error) {
    console.error(error);
    showToast("Harita kaydedilemedi", "error");
  }
}

function addPointFromDraft() {
  const draft = draftSelections.point;
  if (!draft) {
    showToast("Önce haritadan bir konum seçin", "warning");
    return;
  }

  const name = buildDisplayName(elements.pointNameInput?.value || draft.name, "Nokta");

  const normalized = {
    id: state.editingPointId || generateId(),
    name,
    lat: Number(draft.lat),
    lng: Number(draft.lng)
  };

  if (state.editingPointId) {
    const pointIndex = state.points.findIndex((item) => item.id === state.editingPointId);
    if (pointIndex >= 0) {
      state.points[pointIndex] = normalized;
      showToast("Konum güncellendi", "success");
    }
  } else {
    if (!state.fullAccess && state.points.length >= state.locationQuota) {
      showToast("Deneme sürümünde en fazla 20 konum ekleyebilirsiniz", "warning");
      return;
    }
    state.points.push(normalized);
    showToast("Konum eklendi", "success");
  }

  state.editingPointId = null;
  draftSelections.point = null;
  syncInputWithDraft("point");
  commitStateChanges();
  closeFloatingPanels();
}

function saveStartPointFromDraft() {
  const draft = draftSelections.start;
  if (!draft) {
    showToast("Önce haritadan başlangıç noktası seçin", "warning");
    return;
  }

  const name = buildDisplayName(elements.startPointNameInput?.value || draft.name, "Başlangıç");

  state.startPoint = {
    id: "start-point",
    name,
    lat: Number(draft.lat),
    lng: Number(draft.lng)
  };

  draftSelections.start = null;
  syncInputWithDraft("start");
  commitStateChanges();
  closeFloatingPanels();
  showToast("Başlangıç noktası kaydedildi", "success");
}

function removePoint(pointId) {
  state.points = state.points.filter((point) => point.id !== pointId);
  if (state.editingPointId === pointId) {
    state.editingPointId = null;
    draftSelections.point = null;
    syncInputWithDraft("point");
  }
  commitStateChanges();
  showToast("Konum silindi", "success");
}

function clearStartPoint() {
  state.startPoint = null;
  draftSelections.start = null;
  syncInputWithDraft("start");
  commitStateChanges();
  showToast("Başlangıç noktası kaldırıldı", "success");
}

function clearAllPoints() {
  const confirmed = window.confirm("Tüm konumlar ve başlangıç noktası temizlensin mi?");
  if (!confirmed) return;

  state.points = [];
  state.startPoint = null;
  state.totalDistance = 0;
  state.editingPointId = null;
  draftSelections.point = null;
  draftSelections.start = null;
  syncInputWithDraft("point");
  syncInputWithDraft("start");
  commitStateChanges();
  showToast("Tüm veriler temizlendi", "success");
}

function optimizeRoute() {
  if (!state.points.length) {
    showToast("Rota hesaplamak için en az 1 durak ekleyin", "warning");
    return;
  }

  const orderedPoints = nearestNeighborRoute(state.startPoint, state.points);
  state.points = orderedPoints.map((point) => ({ ...point }));
  commitStateChanges();
  showToast("Rota optimize edildi", "success");
}

async function handleLocateMe() {
  try {
    const location = await locateAndShowUser();
    if (!location) {
      showToast("Konum alınamadı", "error");
      return;
    }

    draftSelections.start = {
      lat: location.lat,
      lng: location.lng,
      name: location.name || "Bulunduğum Konum"
    };
    syncInputWithDraft("start");
    openFloatingPanel("addStart");
    showToast("Bulunduğunuz konum seçildi", "success");
  } catch (error) {
    console.error(error);
    showToast("Konum alınamadı", "error");
  }
}

function handleMapSelectionForDraft(target) {
  enableMapClickPicker((selection) => {
    const fallbackName =
      target === "start"
        ? "İşaretli konum"
        : `Nokta ${state.points.length + 1}`;

    const nextDraft = {
      lat: Number(selection.lat),
      lng: Number(selection.lng),
      name: String(selection.name || fallbackName).trim()
    };

    if (target === "start") {
      draftSelections.start = nextDraft;
    } else {
      draftSelections.point = nextDraft;
    }

    syncInputWithDraft(target);
    showToast("Haritadan konum seçildi", "success");
  });
}

function initMapClickPicker() {
  // intentionally left as no-op
}

function initSearchBox() {
  initPlaceSearch({
    inputElement: elements.placeSearchInput,
    dropdownElement: elements.searchDropdown,
    onPlaceSelected: (selection) => {
      draftSelections.point = {
        lat: Number(selection.lat),
        lng: Number(selection.lng),
        name: String(selection.name || `Nokta ${state.points.length + 1}`).trim()
      };
      syncInputWithDraft("point");
      openFloatingPanel("addPoint");
      showToast("Arama sonucu seçildi", "success");
    }
  });
}

function initImportExportHandlers() {
  elements.btnExportCsv?.addEventListener("click", () => {
    exportToCsv(getCurrentMapPayload(), state.selectedMapId || "rota-planlayici");
  });

  elements.btnExportXlsx?.addEventListener("click", () => {
    exportToXlsx(getCurrentMapPayload(), state.selectedMapId || "rota-planlayici");
  });

  elements.fileImportCsv?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await importFromCsvFile(file);
      const importedState = convertImportedRowsToState(rows);
      state.startPoint = importedState.startPoint;
      state.points = importedState.points;
      state.totalDistance = importedState.totalDistance || 0;
      state.hasUnsavedChanges = true;
      commitStateChanges();
      showToast("CSV içe aktarıldı", "success");
    } catch (error) {
      console.error(error);
      showToast("CSV içe aktarılamadı", "error");
    } finally {
      event.target.value = "";
      closeFloatingPanels();
    }
  });

  elements.fileImportXlsx?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await importFromXlsxFile(file);
      const importedState = convertImportedRowsToState(rows);
      state.startPoint = importedState.startPoint;
      state.points = importedState.points;
      state.totalDistance = importedState.totalDistance || 0;
      state.hasUnsavedChanges = true;
      commitStateChanges();
      showToast("XLSX içe aktarıldı", "success");
    } catch (error) {
      console.error(error);
      showToast("XLSX içe aktarılamadı", "error");
    } finally {
      event.target.value = "";
      closeFloatingPanels();
    }
  });
}

function attachEventListeners() {
  elements.btnToggleTripPanel?.addEventListener("click", () => {
    state.tripPanelOpen = !state.tripPanelOpen;
    elements.tripPanel.classList.toggle("trip-panel--desktop-open", state.tripPanelOpen);
    elements.tripPanel.classList.toggle("trip-panel--desktop-closed", !state.tripPanelOpen);
  });

  elements.btnCloseTripPanel?.addEventListener("click", () => {
    state.tripPanelOpen = false;
    elements.tripPanel.classList.remove("trip-panel--desktop-open");
    elements.tripPanel.classList.add("trip-panel--desktop-closed");
  });

  elements.btnTripList?.addEventListener("click", () => {
    state.tripPanelOpen = true;
    elements.tripPanel.classList.add("trip-panel--desktop-open");
    elements.tripPanel.classList.remove("trip-panel--desktop-closed");
  });

  elements.btnOpenMapMenu?.addEventListener("click", () => {
    openFloatingPanel("mapMenu");
  });

  elements.btnOpenAddPointPanel?.addEventListener("click", () => {
    state.editingPointId = null;
    draftSelections.point = null;
    syncInputWithDraft("point");
    openFloatingPanel("addPoint");
  });

  elements.btnOpenAddStartPanel?.addEventListener("click", () => {
    draftSelections.start = state.startPoint
      ? { ...state.startPoint }
      : null;
    syncInputWithDraft("start");
    openFloatingPanel("addStart");
  });

  elements.btnOpenImportExportPanel?.addEventListener("click", () => {
    openFloatingPanel("importExport");
  });

  elements.btnCloseMapMenu?.addEventListener("click", closeFloatingPanels);
  elements.btnCloseAddPointPanel?.addEventListener("click", closeFloatingPanels);
  elements.btnCloseAddStartPanel?.addEventListener("click", closeFloatingPanels);
  elements.btnCloseImportExportPanel?.addEventListener("click", closeFloatingPanels);
  elements.floatingBackdrop?.addEventListener("click", closeFloatingPanels);

  elements.btnLocateMe?.addEventListener("click", handleLocateMe);
  elements.btnOptimizeRoute?.addEventListener("click", optimizeRoute);
  elements.btnClearAll?.addEventListener("click", clearAllPoints);
  elements.btnSaveMap?.addEventListener("click", saveCurrentMap);

  elements.btnPickPointFromMap?.addEventListener("click", () => {
    handleMapSelectionForDraft("point");
  });

  elements.btnConfirmPoint?.addEventListener("click", addPointFromDraft);

  elements.btnPickStartFromMap?.addEventListener("click", () => {
    handleMapSelectionForDraft("start");
  });

  elements.btnConfirmStartPoint?.addEventListener("click", saveStartPointFromDraft);

  elements.pointsContainer?.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) return;

    const card = event.target.closest("[data-point-id]");
    const pointId = card?.dataset.pointId;
    if (!pointId) return;

    const point = state.points.find((item) => item.id === pointId);
    if (!point) return;

    const action = target.dataset.action;
    if (action === "edit-point") {
      state.editingPointId = point.id;
      draftSelections.point = { ...point };
      syncInputWithDraft("point");
      openFloatingPanel("addPoint");
      return;
    }

    if (action === "remove-point") {
      removePoint(pointId);
    }
  });

  elements.startPointCard?.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) return;

    const action = target.dataset.action;
    if (action === "edit-start") {
      draftSelections.start = state.startPoint ? { ...state.startPoint } : null;
      syncInputWithDraft("start");
      openFloatingPanel("addStart");
      return;
    }

    if (action === "remove-start") {
      clearStartPoint();
    }
  });

  elements.mapSelector?.addEventListener("change", async (event) => {
    const mapId = event.target.value;
    if (!mapId) return;
    await handleMapSelection(mapId);
  });

  elements.btnRefreshMaps?.addEventListener("click", () => refreshMapCollections());
  elements.btnRefreshMapsMobile?.addEventListener("click", () => refreshMapCollections());
  elements.btnNewMap?.addEventListener("click", createNewMap);
  elements.btnNewMapMobile?.addEventListener("click", createNewMap);
  elements.btnRenameMap?.addEventListener("click", renameSelectedMap);
  elements.btnRenameMapMobile?.addEventListener("click", renameSelectedMap);
  elements.btnDeleteMap?.addEventListener("click", deleteSelectedMap);
  elements.btnDeleteMapMobile?.addEventListener("click", deleteSelectedMap);
  elements.btnSaveMapName?.addEventListener("click", createNewMap);

  elements.btnLogoutTop?.addEventListener("click", async () => {
    try {
      await logout();
    } catch (error) {
      console.error(error);
      showToast("Çıkış yapılamadı", "error");
    }
  });

  elements.btnUpgradeNow?.addEventListener("click", () => {
    showToast("Tam sürüm aktivasyonu için yöneticinizle iletişime geçin", "info");
  });
}

async function bootstrapAuthenticatedExperience(user) {
  state.currentUser = user;

  try {
    state.claims = (await getUserClaims(user)) || {};
    state.fullAccess = Boolean(state.claims.fullAccess);
    state.accessActive = Boolean(state.claims.accessActive);
    state.profile = await ensureUserProfile(user.uid);
    state.mapQuota = state.fullAccess ? 999 : 1;
    state.locationQuota = state.fullAccess ? 9999 : TRIAL_LOCATION_QUOTA;

    const profileMapId = state.profile?.selectedMapId || null;
    const ensuredTrial = await ensureDefaultTrialMap();
    const preferredMapId = profileMapId || ensuredTrial?.id || null;

    const allMaps = await refreshMapCollections(preferredMapId);
    const nextMapId =
      preferredMapId ||
      allMaps?.[0]?.id ||
      ensuredTrial?.id ||
      null;

    if (nextMapId) {
      await handleMapSelection(nextMapId);
    } else {
      updateQuotaBadges(0);
      updateSaveButtonState();
    }

    elements.authStatus.textContent = `${user.email || "Kullanıcı"} olarak giriş yapıldı`;
  } catch (error) {
    console.error(error);
    elements.authStatus.textContent = "Profil yüklenemedi";
    showToast("Kullanıcı bilgileri yüklenemedi", "error");
  }
}

function bootstrapAnonymousExperience() {
  state.currentUser = null;
  state.claims = {};
  state.profile = null;
  state.fullAccess = false;
  state.accessActive = false;
  state.mapQuota = 1;
  state.locationQuota = TRIAL_LOCATION_QUOTA;
  updateQuotaBadges(0);
  updateSaveButtonState();
  elements.authStatus.textContent = "Oturum bilgisi bulunamadı";
}

async function initAuthFlow() {
  watchAuth(
    async (user) => {
      if (user) {
        await bootstrapAuthenticatedExperience(user);
      } else {
        bootstrapAnonymousExperience();
      }
    },
    (error) => {
      console.error(error);
      bootstrapAnonymousExperience();
      showToast("Oturum durumu izlenemedi", "error");
    }
  );
}

async function init() {
  await initMap();
  initMapClickPicker();
  initSearchBox();
  renderSummary();
  attachEventListeners();
  initImportExportHandlers();
  updateSaveButtonState();
  await initAuthFlow();
}

init().catch((error) => {
  console.error(error);
  showToast("Uygulama başlatılamadı", "error");
});
