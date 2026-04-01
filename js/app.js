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
  startSelectionStatus: document.getElementById("startSelectionStatus"),
  pointSelectionStatus: document.getElementById("pointSelectionStatus")
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
    .replace(/"/g, "&quot;");
}

function markDirty() {
  state.hasUnsavedChanges = true;
}

function setSelectionStatus(element, isSelected) {
  if (!element) return;
  element.textContent = isSelected ? "Konum seçildi" : "Konum seçilmedi";
  element.classList.toggle("is-selected", isSelected);
  element.classList.toggle("is-pending", !isSelected);
}

function updateSelectionStatuses() {
  const startSelected =
    elements.startLat?.value.trim() && elements.startLng?.value.trim();
  const pointSelected =
    elements.pointLat?.value.trim() && elements.pointLng?.value.trim();

  setSelectionStatus(elements.startSelectionStatus, Boolean(startSelected));
  setSelectionStatus(elements.pointSelectionStatus, Boolean(pointSelected));
}

function clearDirty() {
  state.hasUnsavedChanges = false;
}

function hasAccessProfile() {
  return Boolean(state.profile);
}

function getCurrentLocationCount() {
  return state.points.length + (state.startPoint ? 1 : 0);
}

function getAccessUntilMs() {
  return state.profile?.accessUntil?.toMillis?.() || 0;
}

function getTrialEndsAtMs() {
  return state.profile?.trialEndsAt?.toMillis?.() || 0;
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
    updateSelectionStatuses();
    return;
  }

  elements.startName.value = startPoint.name || "";
  elements.startLat.value = Number(startPoint.lat).toFixed(6);
  elements.startLng.value = Number(startPoint.lng).toFixed(6);
  updateSelectionStatuses();
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

  if (!canAddMoreLocations(0)) {
    alert(`Başlangıç dahil en fazla ${state.locationQuota} konum eklenebilir.`);
    return;
  }

  state.startPoint = {
    ...startPoint,
    type: "start"
  };

  showStartMarker(state.startPoint, {
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

  updateSelectionStatuses();
}

function fillPointFormFromMap(lat, lng, suggestedName = "") {
  elements.pointLat.value = lng !== undefined ? lat.toFixed(6) : "";
  elements.pointLng.value = lng !== undefined ? lng.toFixed(6) : "";

  if (suggestedName) {
    elements.pointName.value = suggestedName;
    updateSelectionStatuses();
    return;
  }

  if (!elements.pointName.value.trim()) {
    elements.pointName.value = `Nokta ${state.points.length + 1}`;
  }

  updateSelectionStatuses();
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
    elements.authStatus.textContent = "Başlangıç bilgisi forma aktarıldı.";
    return;
  }

  state.editingPointId = pointData.id;
  elements.authStatus.textContent = `Nokta düzenleniyor: ${pointData.name}`;
}

function buildPointListHtml() {
  if (!state.points.length) {
    return `
      <div class="trip-empty-state">
        <strong>Henüz nokta yok</strong>
        <span>Konum ekleyerek rotanı oluşturmaya başlayabilirsin.</span>
      </div>
    `;
  }

  return state.points
    .map((point, index) => {
      const distanceLabel =
        Number(point.distanceFromPrevious || 0) > 0
          ? `${formatKm(point.distanceFromPrevious)}`
          : "Başlangıçtan ilk nokta";

      return `
        <article class="trip-item" data-point-id="${escapeHtml(point.id)}">
          <div class="trip-item-top">
            <div>
              <strong class="trip-item-title">${index + 1}. ${escapeHtml(point.name)}</strong>
              <div class="trip-item-meta">
                <span>${escapeHtml(distanceLabel)}</span>
                <span>${Number(point.lat).toFixed(6)}, ${Number(point.lng).toFixed(6)}</span>
              </div>
            </div>
            <div class="trip-item-actions">
              <button class="ghost-btn" data-action="edit-point">Düzenle</button>
              <button class="ghost-btn danger" data-action="delete-point">Sil</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTripList() {
  elements.tripList.innerHTML = buildPointListHtml();
}

function renderSummary() {
  elements.totalPoints.textContent = String(getCurrentLocationCount());
  elements.totalDistance.textContent = formatKm(state.totalDistance);
  elements.badgeDistance.textContent = `Toplam: ${formatKm(state.totalDistance)}`;
}

function redrawPointMarkers() {
  clearMarkers();

  state.points.forEach((point, index) => {
    addMarker(point, {
      orderLabel: String(index + 1),
      onClick: fillPointFormFromMarker
    });
  });

  if (state.startPoint) {
    showStartMarker(state.startPoint, {
      onClick: fillPointFormFromMarker
    });
  }
}

function recomputeRoute() {
  clearRouteLines();

  if (!state.startPoint || !state.points.length) {
    state.totalDistance = 0;
    state.points = state.points.map((point) => ({
      ...point,
      distanceFromPrevious: 0
    }));
    redrawPointMarkers();
    renderSummary();
    renderTripList();
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
  updateSelectionStatuses();
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
  elements.authStatus.textContent = `${name} kaydedildi.`;
}

function deletePoint(pointId) {
  state.points = state.points.filter((point) => String(point.id) !== String(pointId));

  if (String(state.editingPointId) === String(pointId)) {
    state.editingPointId = null;
    clearPointForm();
  }

  recomputeRoute();
  markDirty();
  elements.authStatus.textContent = "Konum silindi.";
}

function handleTripListClick(event) {
  const actionButton = event.target.closest("[data-action]");
  const item = event.target.closest("[data-point-id]");
  if (!actionButton || !item) return;

  const pointId = item.dataset.pointId;
  const action = actionButton.dataset.action;

  if (action === "delete-point") {
    deletePoint(pointId);
    return;
  }

  if (action === "edit-point") {
    const point = state.points.find((entry) => String(entry.id) === String(pointId));
    if (!point) return;
    fillPointFormFromMarker(point);
  }
}

async function handleCurrentLocationClick() {
  try {
    const result = await locateAndShowUser();
    if (!result) return;
    fillBothFormsFromMap(result.lat, result.lng, result.name || "");
    markDirty();
    elements.authStatus.textContent = "Mevcut konum forma aktarıldı.";
  } catch (error) {
    console.error(error);
    alert("Konum alınamadı.");
  }
}

async function handleSaveMap() {
  if (!hasActiveAccess()) {
    alert("Kaydetmek için aktif erişim gerekiyor.");
    return;
  }

  if (!state.currentUser) {
    alert("Önce giriş yap.");
    return;
  }

  const mapName = elements.mapName.value.trim();

  if (!mapName) {
    alert("Lütfen harita adı gir.");
    return;
  }

  if (!state.startPoint) {
    alert("Önce başlangıç noktası belirle.");
    return;
  }

  const payload = {
    name: mapName,
    startPoint: state.startPoint,
    points: state.points
  };

  if (state.selectedMapId) {
    if (!canReadMapId(state.selectedMapId)) {
      alert("Bu harita üzerinde işlem yetkin yok.");
      return;
    }

    await updateMap(state.currentUser.uid, state.selectedMapId, payload);
    clearDirty();
    elements.authStatus.textContent = "Harita güncellendi.";
    return;
  }

  if (!canSaveAnotherMap()) {
    alert("Deneme sürümünde yalnızca tek harita kaydedebilirsin.");
    return;
  }

  const forcedMapId = isPremiumAccessActive() ? undefined : TRIAL_MAP_ID;
  const savedId = await saveMap(state.currentUser.uid, payload, forcedMapId);
  state.selectedMapId = savedId;
  clearDirty();
  await loadUserMaps(state.currentUser.uid, isPremiumAccessActive());
  elements.authStatus.textContent = "Harita kaydedildi.";
}

async function handleNewMap() {
  if (state.hasUnsavedChanges) {
    const confirmed = window.confirm("Kaydedilmemiş değişiklikler silinecek. Devam edilsin mi?");
    if (!confirmed) return;
  }

  state.points = [];
  state.totalDistance = 0;
  state.startPoint = null;
  state.editingPointId = null;
  state.selectedMapId = null;

  elements.mapName.value = "";
  setStartForm(null);
  clearPointForm();
  clearMarkers();
  clearStartMarker();
  clearDraftMarker();
  clearRouteLines();
  renderSummary();
  renderTripList();
  clearDirty();
  elements.authStatus.textContent = "Yeni harita hazır.";
}

async function loadUserMaps(userId, includePremiumMaps = false) {
  const maps = await getMaps(userId);

  const filteredMaps = includePremiumMaps
    ? maps
    : maps.filter((item) => item.id === TRIAL_MAP_ID);

  if (!filteredMaps.length) {
    elements.mapList.innerHTML = `
      <div class="trip-empty-state">
        <strong>Kayıtlı harita yok</strong>
        <span>İlk haritanı kaydettiğinde burada görünecek.</span>
      </div>
    `;
    return;
  }

  elements.mapList.innerHTML = filteredMaps
    .map((item) => {
      const pointCount = Array.isArray(item.points) ? item.points.length : 0;

      return `
        <article class="map-list-item" data-map-id="${escapeHtml(item.id)}">
          <div class="map-list-item-body">
            <strong>${escapeHtml(item.name || "İsimsiz Harita")}</strong>
            <span>${pointCount} nokta · ${item.startPoint ? "Başlangıç var" : "Başlangıç yok"}</span>
          </div>
          <div class="map-list-item-actions">
            <button class="ghost-btn" data-action="open-map">Aç</button>
            <button class="ghost-btn danger" data-action="delete-map">Sil</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function openMapById(mapId) {
  if (!state.currentUser) return;
  if (!canReadMapId(mapId)) {
    alert("Bu haritayı açma yetkin yok.");
    return;
  }

  const mapData = await getMapById(state.currentUser.uid, mapId);
  if (!mapData) {
    alert("Harita bulunamadı.");
    return;
  }

  state.selectedMapId = mapId;
  state.startPoint = mapData.startPoint || null;
  state.points = Array.isArray(mapData.points) ? mapData.points : [];
  state.totalDistance = 0;
  state.editingPointId = null;

  elements.mapName.value = mapData.name || "";
  setStartForm(state.startPoint);
  clearPointForm();
  recomputeRoute();
  focusMapToPoints(state.startPoint, state.points);
  clearDirty();
  elements.authStatus.textContent = `Harita açıldı: ${mapData.name || "İsimsiz Harita"}`;
}

async function deleteMapById(mapId) {
  if (!state.currentUser) return;
  if (!canReadMapId(mapId)) {
    alert("Bu haritayı silme yetkin yok.");
    return;
  }

  const confirmed = window.confirm("Bu harita silinsin mi?");
  if (!confirmed) return;

  await removeMap(state.currentUser.uid, mapId);

  if (state.selectedMapId === mapId) {
    await handleNewMap();
  }

  await loadUserMaps(state.currentUser.uid, isPremiumAccessActive());
  elements.authStatus.textContent = "Harita silindi.";
}

async function handleMapListClick(event) {
  const actionButton = event.target.closest("[data-action]");
  const item = event.target.closest("[data-map-id]");
  if (!actionButton || !item) return;

  const mapId = item.dataset.mapId;
  const action = actionButton.dataset.action;

  if (action === "open-map") {
    await openMapById(mapId);
    return;
  }

  if (action === "delete-map") {
    await deleteMapById(mapId);
  }
}

function handleExport() {
  const fileName = (elements.mapName.value.trim() || "rota-planlayici").replace(/\s+/g, "-");

  if (elements.exportType.value === "xlsx") {
    exportToXlsx({
      fileName,
      startPoint: state.startPoint,
      points: state.points
    });
  } else {
    exportToCsv({
      fileName,
      startPoint: state.startPoint,
      points: state.points
    });
  }

  elements.authStatus.textContent = "Harita dışa aktarıldı.";
}

function importRowsIntoState(rows) {
  const imported = convertImportedRowsToState(rows);

  if (imported.startPoint) {
    state.startPoint = imported.startPoint;
  }

  state.points = imported.points;
  state.editingPointId = null;
  setStartForm(state.startPoint);
  clearPointForm();
  recomputeRoute();
  focusMapToPoints(state.startPoint, state.points);
  markDirty();
  elements.authStatus.textContent = "Veriler içe aktarıldı.";
}

async function handleCsvFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const rows = await importFromCsvFile(file);
    importRowsIntoState(rows);
  } catch (error) {
    console.error(error);
    alert("CSV içe aktarılamadı.");
  } finally {
    event.target.value = "";
  }
}

async function handleXlsxFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const rows = await importFromXlsxFile(file);
    importRowsIntoState(rows);
  } catch (error) {
    console.error(error);
    alert("XLSX içe aktarılamadı.");
  } finally {
    event.target.value = "";
  }
}

function handleImport() {
  if (elements.importType.value === "xlsx") {
    elements.xlsxFileInput.click();
    return;
  }

  elements.csvFileInput.click();
}

async function handleLogout() {
  const confirmed = window.confirm("Çıkış yapılsın mı?");
  if (!confirmed) return;

  await logout();
  goToLogin();
}

function closeFloatingPanels() {
  state.activeFloatingPanel = null;
  elements.startPanel?.classList.add("hidden");
  elements.pointPanel?.classList.add("hidden");
  elements.savePanel?.classList.add("hidden");
  elements.importExportPanel?.classList.add("hidden");
}

function toggleMapMenu(forceValue) {
  state.mapMenuOpen =
    typeof forceValue === "boolean" ? forceValue : !state.mapMenuOpen;

  elements.mapMenu?.classList.toggle("hidden", !state.mapMenuOpen);
}

function closeMapMenu() {
  toggleMapMenu(false);
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
    updateSelectionStatuses();
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
  elements.startLat?.addEventListener("input", () => {
    markDirty();
    updateSelectionStatuses();
  });
  elements.startLng?.addEventListener("input", () => {
    markDirty();
    updateSelectionStatuses();
  });
  elements.pointName?.addEventListener("input", markDirty);
  elements.pointLat?.addEventListener("input", () => {
    markDirty();
    updateSelectionStatuses();
  });
  elements.pointLng?.addEventListener("input", () => {
    markDirty();
    updateSelectionStatuses();
  });
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
  updateSelectionStatuses();
  renderSummary();
  renderTripList();
  bindEvents();
  initMobileTopbarAutoHide();
  initAuthWatcher();
}

document.addEventListener("DOMContentLoaded", init);
