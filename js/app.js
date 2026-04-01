import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";
import {
  initMap,
  getMap,
  addMarker,
  clearMarkers,
  showStartMarker,
  removeStartMarker,
  bindMapClickForSelection,
  showCurrentLocationMarker,
  clearCurrentLocationMarker,
  ensureSearchAutocomplete,
  fitMapToPoints,
  clearDraftMarker,
  clearSearchMarker,
  clearRouteLines,
  drawRouteSegments
} from "./map.js";
import { locateUser } from "./location.js";
import {
  exportPointsToCsv,
  exportPointsToXlsx,
  importPointsFromCsv,
  importPointsFromXlsx
} from "./import-export.js";
import { buildRouteDetails, calculateNearestRoute } from "./route.js";

const TRIAL_MAP_ID = "trial-map";
const DEFAULT_LOCATION_QUOTA = 5;
const DEFAULT_MAP_QUOTA = 1;

const state = {
  user: null,
  profile: null,
  fullAccess: false,
  locationQuota: DEFAULT_LOCATION_QUOTA,
  mapQuota: DEFAULT_MAP_QUOTA,
  startPoint: null,
  points: [],
  savedMaps: [],
  selectedMapId: null,
  unsubProfile: null,
  unsubMaps: null,
  hasUnsavedChanges: false,
  mapClickMode: null,
  routeOrder: [],
  routeLegs: [],
  totalDistanceKm: 0
};

const elements = {
  authStatus: document.getElementById("authStatus"),
  toast: document.getElementById("toast"),
  btnLogoutTop: document.getElementById("btnLogoutTop"),
  btnOpenStartPanel: document.getElementById("btnOpenStartPanel"),
  btnCloseStartPanel: document.getElementById("btnCloseStartPanel"),
  btnOpenPointPanel: document.getElementById("btnOpenPointPanel"),
  btnClosePointPanel: document.getElementById("btnClosePointPanel"),
  btnAddStartPoint: document.getElementById("btnAddStartPoint"),
  btnAddPoint: document.getElementById("btnAddPoint"),
  btnToggleMenu: document.getElementById("btnToggleMenu"),
  mapMenu: document.getElementById("mapMenu"),
  btnOpenSavePanel: document.getElementById("btnOpenSavePanel"),
  btnOpenImportExportPanel: document.getElementById("btnOpenImportExportPanel"),
  btnOpenMapListPanel: document.getElementById("btnOpenMapListPanel"),
  btnCloseMapListPanel: document.getElementById("btnCloseMapListPanel"),
  btnCloseSavePanel: document.getElementById("btnCloseSavePanel"),
  btnCloseImportExportPanel: document.getElementById("btnCloseImportExportPanel"),
  btnSaveMap: document.getElementById("btnSaveMap"),
  btnExport: document.getElementById("btnExport"),
  btnImport: document.getElementById("btnImport"),
  btnCreateRoute: document.getElementById("btnCreateRoute"),
  btnResetMap: document.getElementById("btnResetMap"),
  btnCurrentLocation: document.getElementById("btnCurrentLocation"),
  btnNewMapInline: document.getElementById("btnNewMapInline"),
  startPanel: document.getElementById("startPanel"),
  pointPanel: document.getElementById("pointPanel"),
  savePanel: document.getElementById("savePanel"),
  importExportPanel: document.getElementById("importExportPanel"),
  mapListPanel: document.getElementById("mapListPanel"),
  routeList: document.getElementById("routeList"),
  savedMapsList: document.getElementById("savedMapsList"),
  startName: document.getElementById("startName"),
  startLat: document.getElementById("startLat"),
  startLng: document.getElementById("startLng"),
  pointName: document.getElementById("pointName"),
  pointLat: document.getElementById("pointLat"),
  pointLng: document.getElementById("pointLng"),
  mapName: document.getElementById("mapName"),
  exportType: document.getElementById("exportType"),
  importType: document.getElementById("importType"),
  csvFileInput: document.getElementById("csvFileInput"),
  xlsxFileInput: document.getElementById("xlsxFileInput"),
  placeSearch: document.getElementById("placeSearch"),
  summaryStartName: document.getElementById("summaryStartName"),
  summaryPointCount: document.getElementById("summaryPointCount"),
  summaryDistance: document.getElementById("summaryDistance"),
  totalPoints: document.getElementById("totalPoints"),
  totalDistance: document.getElementById("totalDistance"),
  badgeDistance: document.getElementById("badgeDistance"),
  startSelectionStatus: document.getElementById("startSelectionStatus"),
  pointSelectionStatus: document.getElementById("pointSelectionStatus")
};

function showToast(message, type = "info") {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type}`;
  elements.toast.classList.remove("hidden");

  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2600);
}

function closeAllFloatingPanels() {
  [elements.startPanel, elements.pointPanel, elements.savePanel, elements.importExportPanel, elements.mapListPanel].forEach((panel) => {
    panel.classList.add("hidden");
  });
  elements.mapMenu.classList.add("hidden");
}

function closeTransientPanels() {
  [elements.startPanel, elements.pointPanel, elements.savePanel, elements.importExportPanel].forEach((panel) => {
    panel.classList.add("hidden");
  });
  elements.mapMenu.classList.add("hidden");
}

function setPanelVisibility(panel, visible) {
  if (!panel) return;
  panel.classList.toggle("hidden", !visible);
}

function resetPageZoomAfterSearch() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function setSelectionStatus(type, selected) {
  const target =
    type === "start" ? elements.startSelectionStatus : elements.pointSelectionStatus;

  if (!target) return;

  target.textContent = selected ? "Konum seçildi" : "Konum seçilmedi";
  target.classList.toggle("is-selected", selected);
  target.classList.toggle("is-pending", !selected);
}

function updateSelectionStatuses() {
  const hasStartCoords =
    Boolean(elements.startLat.value.trim()) && Boolean(elements.startLng.value.trim());
  const hasPointCoords =
    Boolean(elements.pointLat.value.trim()) && Boolean(elements.pointLng.value.trim());

  setSelectionStatus("start", hasStartCoords);
  setSelectionStatus("point", hasPointCoords);
}

function generatePointId() {
  return `point-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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
    updateSelectionStatuses();
    return;
  }

  elements.startName.value = startPoint.name || "";
  elements.startLat.value = Number.isFinite(startPoint.lat) ? String(startPoint.lat) : "";
  elements.startLng.value = Number.isFinite(startPoint.lng) ? String(startPoint.lng) : "";
  updateSelectionStatuses();
}

function clearPointForm() {
  elements.pointName.value = "";
  elements.pointLat.value = "";
  elements.pointLng.value = "";
  updateSelectionStatuses();
}

function normalizePointRecord(rawPoint, index = 0) {
  return {
    id: rawPoint.id || generatePointId(),
    name: rawPoint.name || `Nokta ${index + 1}`,
    lat: Number(rawPoint.lat),
    lng: Number(rawPoint.lng),
    type: "point",
    address: rawPoint.address || rawPoint.formatted_address || rawPoint.description || ""
  };
}

function normalizeStartRecord(rawPoint) {
  if (!rawPoint) return null;
  return {
    id: "start-point",
    name: rawPoint.name || "Başlangıç",
    lat: Number(rawPoint.lat),
    lng: Number(rawPoint.lng),
    type: "start",
    address: rawPoint.address || rawPoint.formatted_address || rawPoint.description || ""
  };
}

function updateSummaryDistanceDisplays() {
  const formatted = `${formatDistance(state.totalDistanceKm)} km`;
  elements.summaryDistance.textContent = formatted;
  elements.totalDistance.textContent = formatted;
  elements.badgeDistance.textContent = `Toplam: ${formatted}`;
}

function renderRouteList() {
  elements.routeList.innerHTML = "";

  if (!state.startPoint) {
    const empty = document.createElement("div");
    empty.className = "route-empty";
    empty.textContent = "Henüz başlangıç noktası belirlenmedi.";
    elements.routeList.appendChild(empty);
    return;
  }

  const startCard = document.createElement("article");
  startCard.className = "route-item route-item-start";

  const startIndex = document.createElement("div");
  startIndex.className = "route-item-index";
  startIndex.textContent = "S";

  const startBody = document.createElement("div");
  startBody.className = "route-item-body";

  const startTitle = document.createElement("div");
  startTitle.className = "route-item-title";
  startTitle.textContent = state.startPoint.name;

  const startMeta = document.createElement("div");
  startMeta.className = "route-item-meta";
  startMeta.textContent = "Başlangıç Noktası";

  startBody.append(startTitle, startMeta);
  startCard.append(startIndex, startBody);
  elements.routeList.appendChild(startCard);

  if (!state.routeOrder.length) {
    if (!state.points.length) {
      const empty = document.createElement("div");
      empty.className = "route-empty";
      empty.textContent = "Henüz eklenmiş ziyaret noktası bulunmuyor.";
      elements.routeList.appendChild(empty);
      return;
    }

    state.points.forEach((point, index) => {
      const item = document.createElement("article");
      item.className = "route-item";

      const itemIndex = document.createElement("div");
      itemIndex.className = "route-item-index";
      itemIndex.textContent = String(index + 1);

      const body = document.createElement("div");
      body.className = "route-item-body";

      const title = document.createElement("div");
      title.className = "route-item-title";
      title.textContent = point.name;

      const meta = document.createElement("div");
      meta.className = "route-item-meta";
      meta.textContent = "Rota hesaplanmadı";

      body.append(title, meta);
      item.append(itemIndex, body);
      elements.routeList.appendChild(item);
    });

    return;
  }

  state.routeOrder.forEach((point, index) => {
    const leg = state.routeLegs[index];
    const item = document.createElement("article");
    item.className = "route-item";

    const itemIndex = document.createElement("div");
    itemIndex.className = "route-item-index";
    itemIndex.textContent = String(index + 1);

    const body = document.createElement("div");
    body.className = "route-item-body";

    const title = document.createElement("div");
    title.className = "route-item-title";
    title.textContent = point.name;

    const meta = document.createElement("div");
    meta.className = "route-item-meta";
    meta.textContent = leg
      ? `${formatDistance(leg.distanceKm)} km · ${formatTravelDuration(leg.distanceKm)}`
      : "Mesafe bilgisi yok";

    body.append(title, meta);
    item.append(itemIndex, body);
    elements.routeList.appendChild(item);
  });
}

function updateSummaryCards() {
  elements.summaryStartName.textContent = state.startPoint?.name || "Belirlenmedi";
  elements.summaryPointCount.textContent = String(state.points.length);
  elements.totalPoints.textContent = String(state.points.length + (state.startPoint ? 1 : 0));
  updateSummaryDistanceDisplays();
  renderRouteList();
}

function rebuildMapMarkers() {
  clearMarkers();
  removeStartMarker();

  if (state.startPoint) {
    showStartMarker(state.startPoint);
  }

  if (state.routeOrder.length) {
    state.routeOrder.forEach((point, index) => {
      addMarker({
        ...point,
        orderLabel: index + 1
      });
    });
  } else {
    state.points.forEach((point, index) => {
      addMarker({
        ...point,
        orderLabel: index + 1
      });
    });
  }

  fitMapToPoints(state.startPoint, state.routeOrder.length ? state.routeOrder : state.points);
}

function resetRouteState() {
  state.routeOrder = [];
  state.routeLegs = [];
  state.totalDistanceKm = 0;
  clearRouteLines();
  updateSummaryCards();
  rebuildMapMarkers();
}

function hydrateMapFromRecord(mapRecord) {
  state.selectedMapId = mapRecord?.id || null;
  elements.mapName.value = mapRecord?.name || "";
  state.startPoint = normalizeStartRecord(mapRecord?.startPoint);
  state.points = Array.isArray(mapRecord?.points)
    ? mapRecord.points.map((point, index) => normalizePointRecord(point, index))
    : [];

  setStartForm(state.startPoint);
  clearPointForm();
  resetRouteState();
  markClean();
}

function resetCurrentMapState(options = { keepMapName: false }) {
  if (!options.keepMapName) {
    elements.mapName.value = "";
  }

  state.selectedMapId = null;
  state.startPoint = null;
  state.points = [];
  setStartForm(null);
  clearPointForm();
  clearCurrentLocationMarker();
  resetRouteState();
  markClean();
}

function buildMapPayload() {
  return {
    name: elements.mapName.value.trim(),
    startPoint: state.startPoint
      ? {
          id: state.startPoint.id,
          name: state.startPoint.name,
          lat: state.startPoint.lat,
          lng: state.startPoint.lng,
          type: "start",
          address: state.startPoint.address || ""
        }
      : null,
    points: state.points.map((point) => ({
      id: point.id,
      name: point.name,
      lat: point.lat,
      lng: point.lng,
      type: "point",
      address: point.address || ""
    })),
    updatedAt: serverTimestamp()
  };
}

async function ensureTrialMapExistsIfNeeded() {
  if (!state.user || isPremiumAccessActive() || !isTrialActive()) return;

  const trialMapRef = doc(db, "users", state.user.uid, "maps", TRIAL_MAP_ID);
  const existingTrialMap = state.savedMaps.find((item) => item.id === TRIAL_MAP_ID);

  if (existingTrialMap) return;

  const snapshot = await getDoc(trialMapRef);
  if (snapshot.exists()) return;

  await setDoc(trialMapRef, {
    name: "Deneme Haritam",
    startPoint: null,
    points: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isTrialMap: true
  });
}

async function saveCurrentMap() {
  if (!state.user) {
    showToast("Önce giriş yapmalısınız.", "error");
    return;
  }

  if (!hasActiveAccess()) {
    showToast("Deneme süreniz dolmuş. Devam etmek için premium alın.", "error");
    return;
  }

  const mapName = elements.mapName.value.trim();
  if (!mapName) {
    showToast("Lütfen bir harita adı girin.", "error");
    return;
  }

  if (!state.startPoint) {
    showToast("Haritayı kaydetmeden önce başlangıç noktası ekleyin.", "error");
    return;
  }

  if (!canSaveAnotherMap()) {
    showToast("Deneme üyeliğinde yalnızca tek bir harita kaydedebilirsiniz.", "error");
    return;
  }

  const mapsCollectionRef = collection(db, "users", state.user.uid, "maps");
  const payload = buildMapPayload();

  try {
    let mapRef;

    if (state.selectedMapId) {
      mapRef = doc(mapsCollectionRef, state.selectedMapId);
      await updateDoc(mapRef, payload);
    } else {
      const targetId = isPremiumAccessActive() ? crypto.randomUUID() : TRIAL_MAP_ID;
      mapRef = doc(mapsCollectionRef, targetId);
      await setDoc(mapRef, {
        ...payload,
        createdAt: serverTimestamp(),
        isTrialMap: !isPremiumAccessActive()
      });
      state.selectedMapId = targetId;
    }

    markClean();
    showToast("Harita başarıyla kaydedildi.", "success");
    closeTransientPanels();
  } catch (error) {
    console.error("Harita kaydetme hatası:", error);
    showToast("Harita kaydedilirken bir hata oluştu.", "error");
  }
}

async function deleteSavedMap(mapId) {
  if (!state.user || !mapId) return;

  if (!canReadMapId(mapId)) {
    showToast("Bu haritayı silme yetkiniz yok.", "error");
    return;
  }

  try {
    await deleteDoc(doc(db, "users", state.user.uid, "maps", mapId));

    if (state.selectedMapId === mapId) {
      resetCurrentMapState();
    }

    showToast("Harita silindi.", "success");
  } catch (error) {
    console.error("Harita silme hatası:", error);
    showToast("Harita silinirken bir hata oluştu.", "error");
  }
}

function renderSavedMaps() {
  elements.savedMapsList.innerHTML = "";

  const visibleMaps = state.savedMaps.filter((mapItem) => canReadMapId(mapItem.id));

  if (!visibleMaps.length) {
    const empty = document.createElement("div");
    empty.className = "route-empty";
    empty.textContent = "Henüz kayıtlı harita bulunmuyor.";
    elements.savedMapsList.appendChild(empty);
    return;
  }

  visibleMaps.forEach((mapItem) => {
    const item = document.createElement("article");
    item.className = "map-list-item";

    const body = document.createElement("div");
    body.className = "map-list-body";

    const title = document.createElement("div");
    title.className = "map-list-title";
    title.textContent = mapItem.name || "İsimsiz Harita";

    const meta = document.createElement("div");
    meta.className = "map-list-meta";
    const pointCount = Array.isArray(mapItem.points) ? mapItem.points.length : 0;
    meta.textContent = `${pointCount} nokta · ${mapItem.startPoint ? "Başlangıç var" : "Başlangıç yok"}`;

    body.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "map-list-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "small-btn primary";
    openButton.textContent = "Aç";
    openButton.addEventListener("click", () => {
      hydrateMapFromRecord(mapItem);
      showToast("Harita yüklendi.", "success");
      setPanelVisibility(elements.mapListPanel, false);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "small-btn ghost";
    deleteButton.textContent = "Sil";
    deleteButton.addEventListener("click", () => {
      deleteSavedMap(mapItem.id);
    });

    actions.append(openButton, deleteButton);
    item.append(body, actions);
    elements.savedMapsList.appendChild(item);
  });
}

function syncProfileState(profileData) {
  state.profile = profileData || null;
  state.fullAccess = Boolean(profileData?.role === "premium" || profileData?.fullAccess === true);
  state.locationQuota = Number(profileData?.locationQuota || DEFAULT_LOCATION_QUOTA);
  state.mapQuota = Number(profileData?.mapQuota || DEFAULT_MAP_QUOTA);
  elements.authStatus.textContent = getAccessStatusText();

  if (!hasActiveAccess()) {
    closeAllFloatingPanels();
  }
}

function subscribeToUserData(user) {
  state.unsubProfile?.();
  state.unsubMaps?.();

  const profileRef = doc(db, "users", user.uid);
  state.unsubProfile = onSnapshot(profileRef, async (snapshot) => {
    syncProfileState(snapshot.exists() ? snapshot.data() : null);
    if (hasActiveAccess()) {
      try {
        await ensureTrialMapExistsIfNeeded();
      } catch (error) {
        console.error("Trial harita oluşturma hatası:", error);
      }
    }
  });

  const mapsRef = query(collection(db, "users", user.uid, "maps"), orderBy("updatedAt", "desc"), limit(25));
  state.unsubMaps = onSnapshot(mapsRef, (snapshot) => {
    state.savedMaps = snapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data()
    }));
    renderSavedMaps();

    if (state.selectedMapId) {
      const selected = state.savedMaps.find((item) => item.id === state.selectedMapId);
      if (selected) {
        hydrateMapFromRecord(selected);
      } else if (!isPremiumAccessActive() && state.selectedMapId !== TRIAL_MAP_ID) {
        resetCurrentMapState();
      }
    }
  });
}

function applySelectedMapClick(type, selection) {
  if (!selection || !type) return;

  if (type === "start") {
    elements.startLat.value = String(selection.lat);
    elements.startLng.value = String(selection.lng);
    if (!elements.startName.value.trim()) {
      elements.startName.value = selection.name || selection.address || "Başlangıç";
    }
  }

  if (type === "point") {
    elements.pointLat.value = String(selection.lat);
    elements.pointLng.value = String(selection.lng);
    if (!elements.pointName.value.trim()) {
      elements.pointName.value = selection.name || selection.address || "Konum";
    }
  }

  updateSelectionStatuses();
}

function beginMapSelection(mode) {
  state.mapClickMode = mode;

  if (mode === "start") {
    showToast("Haritada başlangıç konumunu seçin.", "info");
  } else {
    showToast("Haritada eklenecek konumu seçin.", "info");
  }

  bindMapClickForSelection((selection) => {
    applySelectedMapClick(mode, selection);
    markDirty();
  });
}

function finalizeStartPoint() {
  if (!hasActiveAccess()) {
    showToast("Bu işlemi yapmak için aktif üyelik gerekiyor.", "error");
    return;
  }

  const startPoint = buildStartPointFromForm();
  if (!startPoint) {
    showToast("Başlangıç için isim ve konum bilgilerini doldurun.", "error");
    return;
  }

  state.startPoint = {
    ...startPoint,
    address: state.startPoint?.address || ""
  };

  setStartForm(state.startPoint);
  markDirty();
  resetRouteState();
  closeTransientPanels();
  showToast("Başlangıç noktası eklendi.", "success");
}

function finalizePoint() {
  if (!hasActiveAccess()) {
    showToast("Bu işlemi yapmak için aktif üyelik gerekiyor.", "error");
    return;
  }

  if (!canAddMoreLocations(1)) {
    showToast(`Deneme üyeliğinde en fazla ${state.locationQuota} konum ekleyebilirsiniz.`, "error");
    return;
  }

  const name = elements.pointName.value.trim();
  const lat = elements.pointLat.value.trim();
  const lng = elements.pointLng.value.trim();

  if (!name || !lat || !lng) {
    showToast("Konum adı ve konum bilgilerini doldurun.", "error");
    return;
  }

  const point = {
    id: generatePointId(),
    name,
    lat: Number(lat),
    lng: Number(lng),
    type: "point",
    address: ""
  };

  state.points.push(point);
  clearPointForm();
  markDirty();
  resetRouteState();
  closeTransientPanels();
  showToast("Konum eklendi.", "success");
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }

  const rounded = Number(distanceKm.toFixed(2));
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  if (Math.abs(rounded * 10 - Math.round(rounded * 10)) < 0.000001) {
    return rounded.toFixed(1);
  }

  return rounded.toFixed(2);
}

function formatTravelDuration(distanceKm) {
  const averageSpeedKmH = 40;
  const durationHours = distanceKm / averageSpeedKmH;
  const totalMinutes = Math.max(1, Math.round(durationHours * 60));

  if (totalMinutes < 60) {
    return `${totalMinutes} dk`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!minutes) {
    return `${hours} sa`;
  }

  return `${hours} sa ${minutes} dk`;
}

function createRoute() {
  if (!state.startPoint) {
    showToast("Önce başlangıç noktası ekleyin.", "error");
    return;
  }

  if (!state.points.length) {
    showToast("Rota için en az bir konum ekleyin.", "error");
    return;
  }

  const result = calculateNearestRoute(state.startPoint, state.points);
  state.routeOrder = result.route;
  state.totalDistanceKm = result.totalDistanceKm;
  state.routeLegs = buildRouteDetails(state.startPoint, result.route);
  drawRouteSegments(state.startPoint, state.routeOrder, state.routeLegs);
  updateSummaryCards();
  rebuildMapMarkers();
  showToast("Rota oluşturuldu.", "success");
}

function exportCurrentMap() {
  if (!state.startPoint && !state.points.length) {
    showToast("Dışa aktarmak için veri bulunmuyor.", "error");
    return;
  }

  const exportPayload = {
    mapName: elements.mapName.value.trim() || "rota-planlayici",
    startPoint: state.startPoint,
    points: state.points
  };

  if (elements.exportType.value === "xlsx") {
    exportPointsToXlsx(exportPayload);
  } else {
    exportPointsToCsv(exportPayload);
  }

  showToast("Dışa aktarma tamamlandı.", "success");
}

async function handleImportedRecords(records) {
  if (!Array.isArray(records) || !records.length) {
    showToast("İçe aktarılan dosyada veri bulunamadı.", "error");
    return;
  }

  let importedStart = null;
  const importedPoints = [];

  records.forEach((record, index) => {
    const type = String(record.type || record.Type || "").toLowerCase();
    const point = {
      id: record.id || generatePointId(),
      name: String(record.name || record.Name || `Nokta ${index + 1}`),
      lat: Number(record.lat || record.Lat || record.latitude || record.Latitude),
      lng: Number(record.lng || record.Lng || record.longitude || record.Longitude),
      address: String(record.address || record.Address || "")
    };

    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return;
    }

    if (type === "start" && !importedStart) {
      importedStart = {
        ...point,
        id: "start-point",
        type: "start"
      };
      return;
    }

    importedPoints.push({
      ...point,
      type: "point"
    });
  });

  const projectedTotal =
    importedPoints.length + (importedStart || state.startPoint ? 1 : 0);

  if (!isPremiumAccessActive() && projectedTotal > state.locationQuota) {
    showToast(`Deneme üyeliğinde en fazla ${state.locationQuota} konum kullanılabilir.`, "error");
    return;
  }

  if (importedStart) {
    state.startPoint = importedStart;
    setStartForm(importedStart);
  }

  state.points = importedPoints;
  clearPointForm();
  markDirty();
  resetRouteState();
  showToast("İçe aktarma tamamlandı.", "success");
}

function importCurrentMap() {
  if (elements.importType.value === "xlsx") {
    elements.xlsxFileInput.value = "";
    elements.xlsxFileInput.click();
  } else {
    elements.csvFileInput.value = "";
    elements.csvFileInput.click();
  }
}

async function handleFileImport(event, kind) {
  const [file] = event.target.files || [];
  if (!file) return;

  try {
    const rows = kind === "xlsx" ? await importPointsFromXlsx(file) : await importPointsFromCsv(file);
    await handleImportedRecords(rows);
  } catch (error) {
    console.error("Dosya içe aktarma hatası:", error);
    showToast("Dosya okunurken bir hata oluştu.", "error");
  } finally {
    event.target.value = "";
  }
}

async function handleCurrentLocation() {
  try {
    const location = await locateUser();
    showCurrentLocationMarker(location);

    if (getMap()) {
      getMap().panTo(location);
      getMap().setZoom(14);
    }

    showToast("Mevcut konumunuz haritada gösterildi.", "success");
  } catch (error) {
    console.error("Konum alma hatası:", error);
    showToast("Konum bilgisi alınamadı.", "error");
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    window.location.href = "./index.html";
  } catch (error) {
    console.error("Çıkış hatası:", error);
    showToast("Çıkış yapılırken bir hata oluştu.", "error");
  }
}

function setupFloatingPanels() {
  elements.btnOpenStartPanel.addEventListener("click", () => {
    closeTransientPanels();
    setPanelVisibility(elements.startPanel, true);
    beginMapSelection("start");
    updateSelectionStatuses();
  });

  elements.btnCloseStartPanel.addEventListener("click", () => {
    setPanelVisibility(elements.startPanel, false);
  });

  elements.btnOpenPointPanel.addEventListener("click", () => {
    closeTransientPanels();
    setPanelVisibility(elements.pointPanel, true);
    beginMapSelection("point");
    updateSelectionStatuses();
  });

  elements.btnClosePointPanel.addEventListener("click", () => {
    setPanelVisibility(elements.pointPanel, false);
  });

  elements.btnToggleMenu.addEventListener("click", () => {
    elements.mapMenu.classList.toggle("hidden");
  });

  elements.btnOpenSavePanel.addEventListener("click", () => {
    closeTransientPanels();
    setPanelVisibility(elements.savePanel, true);
  });

  elements.btnOpenImportExportPanel.addEventListener("click", () => {
    closeTransientPanels();
    setPanelVisibility(elements.importExportPanel, true);
  });

  elements.btnOpenMapListPanel.addEventListener("click", () => {
    closeTransientPanels();
    setPanelVisibility(elements.mapListPanel, true);
  });

  elements.btnCloseMapListPanel.addEventListener("click", () => {
    setPanelVisibility(elements.mapListPanel, false);
  });

  elements.btnCloseSavePanel.addEventListener("click", () => {
    setPanelVisibility(elements.savePanel, false);
  });

  elements.btnCloseImportExportPanel.addEventListener("click", () => {
    setPanelVisibility(elements.importExportPanel, false);
  });

  document.addEventListener("click", (event) => {
    const menuClicked = elements.mapMenu.contains(event.target);
    const menuButtonClicked = elements.btnToggleMenu.contains(event.target);

    if (!menuClicked && !menuButtonClicked) {
      elements.mapMenu.classList.add("hidden");
    }
  });
}

function setupEventListeners() {
  setupFloatingPanels();

  elements.btnAddStartPoint.addEventListener("click", finalizeStartPoint);
  elements.btnAddPoint.addEventListener("click", finalizePoint);
  elements.btnSaveMap.addEventListener("click", saveCurrentMap);
  elements.btnExport.addEventListener("click", exportCurrentMap);
  elements.btnImport.addEventListener("click", importCurrentMap);
  elements.btnCreateRoute.addEventListener("click", createRoute);
  elements.btnResetMap.addEventListener("click", () => {
    resetCurrentMapState();
    showToast("Harita temizlendi.", "success");
  });
  elements.btnCurrentLocation.addEventListener("click", handleCurrentLocation);
  elements.btnLogoutTop.addEventListener("click", handleLogout);
  elements.btnNewMapInline.addEventListener("click", () => {
    resetCurrentMapState();
    closeAllFloatingPanels();
    showToast("Yeni harita oluşturabilirsiniz.", "info");
  });

  elements.csvFileInput.addEventListener("change", (event) => handleFileImport(event, "csv"));
  elements.xlsxFileInput.addEventListener("change", (event) => handleFileImport(event, "xlsx"));

  [elements.startName, elements.startLat, elements.startLng, elements.pointName, elements.pointLat, elements.pointLng, elements.mapName].forEach(
    (input) => {
      input.addEventListener("input", () => {
        markDirty();
        updateSelectionStatuses();
      });
    }
  );
}

function setupSearchAutocomplete() {
  ensureSearchAutocomplete(elements.placeSearch, (selection) => {
    if (!selection) return;

    resetPageZoomAfterSearch();

    if (state.mapClickMode === "start" && !elements.startPanel.classList.contains("hidden")) {
      elements.startLat.value = String(selection.lat);
      elements.startLng.value = String(selection.lng);
      if (!elements.startName.value.trim()) {
        elements.startName.value = selection.name || selection.address || "Başlangıç";
      }
      updateSelectionStatuses();
      markDirty();
      return;
    }

    if (state.mapClickMode === "point" && !elements.pointPanel.classList.contains("hidden")) {
      elements.pointLat.value = String(selection.lat);
      elements.pointLng.value = String(selection.lng);
      if (!elements.pointName.value.trim()) {
        elements.pointName.value = selection.name || selection.address || "Konum";
      }
      updateSelectionStatuses();
      markDirty();
    }
  });
}

function initAuth() {
  onAuthStateChanged(auth, (user) => {
    state.user = user;

    if (!user) {
      window.location.href = "./index.html";
      return;
    }

    subscribeToUserData(user);
  });
}

function init() {
  initMap();
  setupEventListeners();
  setupSearchAutocomplete();
  initAuth();
  updateSelectionStatuses();

  window.addEventListener("beforeunload", (event) => {
    if (!state.hasUnsavedChanges || !hasMapContent()) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

document.addEventListener("DOMContentLoaded", init);
