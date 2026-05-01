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
  showEndMarker,
  clearEndMarker,
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
  locationActionsMenuOpen: false,
  points: [],
  totalDistance: 0,
  currentUser: null,
  startPoint: null,
  endPoint: null,
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
  appStartupSplash: null,
  selectedPointColor: "#dc2626",
  noteEditorTarget: null
};

const elements = {
  topbar: document.querySelector(".topbar"),
  tripPanel: document.getElementById("tripPanel"),
  btnToggleTripPanel: document.getElementById("btnToggleTripPanel"),
  btnCloseTripPanel: document.getElementById("btnCloseTripPanel"),
  btnTripList: document.getElementById("btnTripList"),
  btnAddPoint: document.getElementById("btnAddPoint"),
  btnAddStartPoint: document.getElementById("btnAddStartPoint"),
  btnAddEndPoint: document.getElementById("btnAddEndPoint"),
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
  endName: document.getElementById("endName"),
  endLat: document.getElementById("endLat"),
  endLng: document.getElementById("endLng"),
  mapName: document.getElementById("mapName"),
  authStatus: document.getElementById("authStatus"),
  mapList: document.getElementById("mapList"),
  placeSearch: document.getElementById("placeSearch"),
  btnOpenLocationActions: document.getElementById("btnOpenLocationActions"),
  locationActionsMenu: document.getElementById("locationActionsMenu"),
  btnOpenStartPanel: document.getElementById("btnOpenStartPanel"),
  btnOpenPointPanel: document.getElementById("btnOpenPointPanel"),
  btnOpenEndPanel: document.getElementById("btnOpenEndPanel"),
  btnCloseStartPanel: document.getElementById("btnCloseStartPanel"),
  btnClosePointPanel: document.getElementById("btnClosePointPanel"),
  btnCloseEndPanel: document.getElementById("btnCloseEndPanel"),
  btnToggleMenu: document.getElementById("btnToggleMenu"),
  mapMenu: document.getElementById("mapMenu"),
  btnOpenSavePanel: document.getElementById("btnOpenSavePanel"),
  btnOpenSavePanelTrip: document.getElementById("btnOpenSavePanelTrip"),
  btnOpenMapListPanelTrip: document.getElementById("btnOpenMapListPanelTrip"),
  btnOpenImportExportPanel: document.getElementById("btnOpenImportExportPanel"),
  btnOpenMapListPanel: document.getElementById("btnOpenMapListPanel"),
  btnCloseSavePanel: document.getElementById("btnCloseSavePanel"),
  btnCloseImportExportPanel: document.getElementById("btnCloseImportExportPanel"),
  btnCloseMapListPanel: document.getElementById("btnCloseMapListPanel"),
  savedMapsOverlay: document.getElementById("savedMapsOverlay"),
  savedMapsBackdrop: document.getElementById("savedMapsBackdrop"),
  startPanel: document.getElementById("startPanel"),
  pointPanel: document.getElementById("pointPanel"),
  endPanel: document.getElementById("endPanel"),
  savePanel: document.getElementById("savePanel"),
  importExportPanel: document.getElementById("importExportPanel"),
  appStartupSplash: document.getElementById("appStartupSplash"),
  appStartupSplashText: document.getElementById("appStartupSplashText"),
  mobileFloatingBackdrop: document.getElementById("mobileFloatingBackdrop"),
  noteEditorOverlay: document.getElementById("noteEditorOverlay"),
  noteEditorBackdrop: document.getElementById("noteEditorBackdrop"),
  noteEditorTitle: document.getElementById("noteEditorTitle"),
  noteEditorSubtitle: document.getElementById("noteEditorSubtitle"),
  noteEditorText: document.getElementById("noteEditorText"),
  btnCloseNoteEditor: document.getElementById("btnCloseNoteEditor"),
  btnSaveNote: document.getElementById("btnSaveNote"),
  btnDeleteNote: document.getElementById("btnDeleteNote")
};

const DEFAULT_POINT_COLOR = "#dc2626";
const GOOGLE_MAPS_BOOT_TIMEOUT_MS = 12000;
let mapFeaturesInitialized = false;
let mapsBootPromise = null;
const APP_STARTUP_SPLASH_MIN_MS = 650;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForStablePaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

function areGoogleMapsLibrariesReady() {
  return Boolean(
    window.google?.maps?.Map &&
      window.google?.maps?.Geocoder &&
      window.google?.maps?.places?.AutocompleteService
  );
}

function initializeMapFeatures() {
  if (mapFeaturesInitialized || !areGoogleMapsLibrariesReady()) {
    return false;
  }

  initMap();
  initMapClickPicker();
  initSearchBox();
  mapFeaturesInitialized = true;
  return true;
}

function waitForGoogleMaps() {
  if (areGoogleMapsLibrariesReady()) {
    return Promise.resolve();
  }

  if (mapsBootPromise) {
    return mapsBootPromise;
  }

  mapsBootPromise = new Promise((resolve, reject) => {
    const mapsScript = document.querySelector("script[data-routee-google-maps='1']");

    const cleanup = () => {
      if (mapsScript) {
        mapsScript.removeEventListener("error", handleError);
      }
      window.clearTimeout(timeoutId);
      delete window.__routeeGoogleMapsLoaded;
    };

    const handleReady = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Google Maps script yüklenemedi."));
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Maps yükleme zaman aşımı."));
    }, GOOGLE_MAPS_BOOT_TIMEOUT_MS);

    window.__routeeGoogleMapsLoaded = handleReady;

    if (mapsScript) {
      mapsScript.addEventListener("error", handleError, { once: true });
    }

    if (areGoogleMapsLibrariesReady()) {
      handleReady();
    }
  });

  return mapsBootPromise;
}

async function bootstrapMapFeatures() {
  if (initializeMapFeatures()) return;

  elements.authStatus.textContent = "Harita servisi yükleniyor...";

  try {
    await waitForGoogleMaps();
    initializeMapFeatures();
  } catch (error) {
    console.warn(error);
    elements.authStatus.textContent =
      "Harita servisine bağlanılamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.";
  }
}

function goToLogin() {
  window.location.href = "./index.html";
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

  const startedAt = Number(splashState.startedAt) || Date.now();
  const elapsed = Date.now() - startedAt;
  const remaining = Math.max(0, APP_STARTUP_SPLASH_MIN_MS - elapsed);

  if (remaining > 0) {
    await wait(remaining);
  }

  await waitForStablePaint();

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

function sanitizeNoteText(value, options = {}) {
  const rawText = String(value ?? "");
  const shouldTrim = options.trim !== false;

  const cleanedText = rawText
    .replace(/\u0000/g, "")
    .replace(/<\s*\/?\s*script\b[^>]*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\bjavascript\s*:/gi, "")
    .replace(/\bdata\s*:\s*text\/html/gi, "")
    .replace(/\bon[a-z]+\s*=/gi, "")
    .replace(/[<>`]/g, "");

  return shouldTrim ? cleanedText.trim() : cleanedText;
}

function normalizeNote(value) {
  return sanitizeNoteText(value);
}

function sanitizeNoteEditorInput(showStatus = true) {
  const textarea = elements.noteEditorText;
  if (!textarea) return "";

  const originalValue = textarea.value;
  const sanitizedValue = sanitizeNoteText(originalValue, { trim: false });

  if (originalValue !== sanitizedValue) {
    const selectionStart = textarea.selectionStart ?? originalValue.length;
    const selectionEnd = textarea.selectionEnd ?? originalValue.length;
    const nextSelectionStart = sanitizeNoteText(originalValue.slice(0, selectionStart), {
      trim: false
    }).length;
    const nextSelectionEnd = sanitizeNoteText(originalValue.slice(0, selectionEnd), {
      trim: false
    }).length;

    textarea.value = sanitizedValue;
    textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);

    if (showStatus && elements.authStatus) {
      elements.authStatus.textContent =
        "Güvenlik için not alanındaki kod/HTML benzeri ifadeler temizlendi.";
    }
  }

  return sanitizedValue;
}

function hasLocationNote(location) {
  return normalizeNote(location?.note).length > 0;
}

function getNotePreview(note, maxLength = 86) {
  const normalized = normalizeNote(note).replace(/\s+/g, " ");

  if (!normalized) return "";

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function noteIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <path d="M14 2v6h6"></path>
      <path d="M16.5 13.5 11 19l-3 .7.7-3 5.5-5.5a1.6 1.6 0 0 1 2.3 2.3z"></path>
    </svg>`;
}

function directionsIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17 17 7"></path>
      <path d="M9 7h8v8"></path>
      <path d="M5 19l2-2"></path>
    </svg>`;
}

function renderNoteButton({ action, id = "", hasNote = false }) {
  const noteClass = hasNote ? " has-note" : "";
  const title = hasNote ? "Notu görüntüle / düzenle" : "Not ekle";
  const dataId = id !== "" && id !== null && id !== undefined ? ` data-id="${escapeHtml(id)}"` : "";

  return `
    <button class="tiny-btn icon-note-btn${noteClass}" type="button" data-action="${action}"${dataId} aria-label="${title}" title="${title}">
      ${noteIconSvg()}
      <span class="note-state-dot" aria-hidden="true"></span>
    </button>
  `;
}

function renderNotePreview(location) {
  if (!hasLocationNote(location)) return "";

  const fullNote = normalizeNote(location.note);

  return `
    <span class="trip-note-preview" title="${escapeHtml(fullNote)}" tabindex="0" aria-label="Konum notu">
      ${noteIconSvg()}
      <span>${escapeHtml(fullNote)}</span>
    </span>
  `;
}

function getNoteTargetLocation(target = state.noteEditorTarget) {
  if (!target) return null;

  if (target.type === "start") {
    return state.startPoint || null;
  }

  if (target.type === "end") {
    return state.endPoint || null;
  }

  if (target.type === "point") {
    return state.points.find((point) => String(point.id) === String(target.id)) || null;
  }

  return null;
}

function getPointDataForInfo(target) {
  if (!target) return null;

  if (target.type === "start" && state.startPoint) {
    return {
      ...state.startPoint,
      orderLabel: "S"
    };
  }

  if (target.type === "end" && state.endPoint) {
    return {
      ...state.endPoint,
      orderLabel: "E"
    };
  }

  if (target.type === "point") {
    const pointIndex = state.points.findIndex(
      (point) => String(point.id) === String(target.id)
    );

    if (pointIndex < 0) return null;

    const point = state.points[pointIndex];

    return {
      ...point,
      orderLabel: String(pointIndex + 1),
      color: point.color || DEFAULT_POINT_COLOR
    };
  }

  return null;
}

function getNoteTargetLabel(location, target = state.noteEditorTarget) {
  if (!location) return "Konum";

  if (target?.type === "start") return `Başlangıç · ${location.name || "İsimsiz"}`;
  if (target?.type === "end") return `Bitiş noktası · ${location.name || "İsimsiz"}`;

  const pointIndex = state.points.findIndex((point) => String(point.id) === String(location.id));
  const prefix = pointIndex >= 0 ? `${pointIndex + 1}. konum` : "Konum";

  return `${prefix} · ${location.name || "İsimsiz"}`;
}

function openNoteEditor(target) {
  const location = getNoteTargetLocation(target);

  if (!location || !elements.noteEditorOverlay || !elements.noteEditorText) return;

  state.noteEditorTarget = {
    type: target.type,
    id: target.id ?? null,
    reopenInfo: Boolean(target.reopenInfo)
  };

  if (elements.noteEditorTitle) {
    elements.noteEditorTitle.textContent = hasLocationNote(location)
      ? "Konum Notu"
      : "Not Ekle";
  }

  if (elements.noteEditorSubtitle) {
    elements.noteEditorSubtitle.textContent = getNoteTargetLabel(location, target);
  }

  elements.noteEditorText.value = normalizeNote(location.note);
  elements.btnDeleteNote?.toggleAttribute("disabled", !hasLocationNote(location));

  closeFloatingPanels();
  closeMapMenu();
  elements.noteEditorOverlay.classList.remove("hidden");
  elements.noteEditorOverlay.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    elements.noteEditorText?.focus();
  }, 80);
}

function closeNoteEditor() {
  elements.noteEditorOverlay?.classList.add("hidden");
  elements.noteEditorOverlay?.setAttribute("aria-hidden", "true");
  state.noteEditorTarget = null;
}

function applyNoteToLocation(note) {
  const target = state.noteEditorTarget;
  if (!target) return null;

  const normalizedNote = normalizeNote(note);

  if (target.type === "start" && state.startPoint) {
    state.startPoint = {
      ...state.startPoint,
      note: normalizedNote
    };
    return state.startPoint;
  }

  if (target.type === "end" && state.endPoint) {
    state.endPoint = {
      ...state.endPoint,
      note: normalizedNote
    };
    return state.endPoint;
  }

  if (target.type === "point") {
    let updatedPoint = null;

    state.points = state.points.map((point) => {
      if (String(point.id) !== String(target.id)) return point;

      updatedPoint = {
        ...point,
        note: normalizedNote
      };

      return updatedPoint;
    });

    return updatedPoint;
  }

  return null;
}

function handleSaveNote() {
  const targetBeforeSave = state.noteEditorTarget
    ? { ...state.noteEditorTarget }
    : null;
  const safeNoteValue = sanitizeNoteEditorInput(false);
  const updatedLocation = applyNoteToLocation(safeNoteValue);

  if (!updatedLocation || !targetBeforeSave) return;

  recomputeRoute();
  markDirty();
  closeNoteEditor();

  elements.authStatus.textContent = hasLocationNote(updatedLocation)
    ? `Not kaydedildi: ${updatedLocation.name || "Konum"}`
    : `Not kaldırıldı: ${updatedLocation.name || "Konum"}`;

  if (targetBeforeSave.reopenInfo) {
    window.setTimeout(() => {
      const pointData = getPointDataForInfo(targetBeforeSave);
      if (pointData) openInfoForPoint(pointData);
    }, 180);
  }
}

function handleDeleteNote() {
  if (!state.noteEditorTarget) return;
  elements.noteEditorText.value = "";
  handleSaveNote();
}

function handleMarkerNoteRequest(event) {
  const pointData = event?.detail?.pointData;
  if (!pointData) return;

  openNoteEditor({
    type: pointData.type === "start" ? "start" : pointData.type === "end" ? "end" : "point",
    id: pointData.id ?? null,
    reopenInfo: true
  });
}

function markClean() {
  state.hasUnsavedChanges = false;
}

function hasMapContent() {
  return Boolean(
    elements.mapName.value.trim() ||
      state.startPoint ||
      state.endPoint ||
      state.points.length ||
      elements.startName.value.trim() ||
      elements.startLat.value.trim() ||
      elements.startLng.value.trim() ||
      elements.pointName.value.trim() ||
      elements.pointLat.value.trim() ||
      elements.pointLng.value.trim() ||
      elements.endName?.value.trim() ||
      elements.endLat?.value.trim() ||
      elements.endLng?.value.trim()
  );
}

function getCurrentLocationCount() {
  return (
    state.points.length +
    (state.startPoint ? 1 : 0) +
    (state.endPoint ? 1 : 0)
  );
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
  const profileRole = String(state.profile?.role || "").toLowerCase();

  const hasPremiumIdentity =
    state.fullAccess === true ||
    state.claims?.fullAccess === true ||
    state.profile?.fullAccess === true ||
    profileRole === "premium";

  if (!hasPremiumIdentity) return false;

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

function buildEndPointFromForm() {
  const name = elements.endName?.value.trim();
  const lat = elements.endLat?.value.trim();
  const lng = elements.endLng?.value.trim();

  if (!name || !lat || !lng) return null;

  return {
    id: "end-point",
    name,
    lat: Number(lat),
    lng: Number(lng),
    type: "end"
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

function setEndForm(endPoint) {
  if (!elements.endName || !elements.endLat || !elements.endLng) return;

  if (!endPoint) {
    elements.endName.value = "";
    elements.endLat.value = "";
    elements.endLng.value = "";
    return;
  }

  elements.endName.value = endPoint.name || "";
  elements.endLat.value = Number(endPoint.lat).toFixed(6);
  elements.endLng.value = Number(endPoint.lng).toFixed(6);
}

function setSelectedPointColor(color = DEFAULT_POINT_COLOR) {
  state.selectedPointColor = color;
}

function isSamePlace(a, b) {
  if (!a || !b) return false;

  const aLat = Number(a.lat);
  const aLng = Number(a.lng);
  const bLat = Number(b.lat);
  const bLng = Number(b.lng);

  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return false;

  return Math.abs(aLat - bLat) < 0.000001 && Math.abs(aLng - bLng) < 0.000001;
}

const START_POINT_REMOVED_MESSAGE =
  "Başlangıç noktası silindi. Hesaplama için yeni bir başlangıç noktası seçiniz.";

function notifyStartPointRemoved(showAlert = true) {
  elements.authStatus.textContent = START_POINT_REMOVED_MESSAGE;

  if (showAlert) {
    alert(START_POINT_REMOVED_MESSAGE);
  }
}

function detachStartPoint() {
  if (!state.startPoint) return null;

  const removedStartPoint = { ...state.startPoint };

  state.startPoint = null;
  clearStartMarker();
  clearRouteLines();
  setStartForm(null);

  return removedStartPoint;
}

function findDuplicatePointByPlace(location, excludeId = null) {
  if (!location) return null;

  const duplicates = state.points.filter((point) => {
    const isExcluded =
      excludeId !== null &&
      excludeId !== undefined &&
      String(point.id) === String(excludeId);

    return !isExcluded && isSamePlace(point, location);
  });

  return duplicates.length ? duplicates[duplicates.length - 1] : null;
}

function removeDuplicatePointsByPlace(location, excludeId = null) {
  if (!location) return null;

  const duplicatePoint = findDuplicatePointByPlace(location, excludeId);

  state.points = state.points.filter((point) => {
    const isExcluded =
      excludeId !== null &&
      excludeId !== undefined &&
      String(point.id) === String(excludeId);

    if (isExcluded) return true;

    return !isSamePlace(point, location);
  });

  return duplicatePoint;
}

function keepLastPointPerPlace(points = []) {
  const uniquePoints = [];

  points.forEach((point) => {
    const existingIndex = uniquePoints.findIndex((item) =>
      isSamePlace(item, point)
    );

    if (existingIndex >= 0) {
      const previousPoint = uniquePoints[existingIndex];

      uniquePoints.splice(existingIndex, 1);

      uniquePoints.push({
        ...point,
        note: point.note || previousPoint.note || "",
        color: point.color || previousPoint.color || DEFAULT_POINT_COLOR
      });

      return;
    }

    uniquePoints.push(point);
  });

  return uniquePoints;
}

function createPointFromPreviousStart(startPoint) {
  return {
    id: Date.now() + Math.random(),
    name: startPoint.name || "Eski Başlangıç",
    lat: Number(startPoint.lat),
    lng: Number(startPoint.lng),
    note: normalizeNote(startPoint.note),
    color: DEFAULT_POINT_COLOR,
    distanceFromPrevious: 0,
    type: "point"
  };
}

function createPointFromPreviousEnd(endPoint) {
  return {
    id: Date.now() + Math.random(),
    name: endPoint.name || "Eski Bitiş",
    lat: Number(endPoint.lat),
    lng: Number(endPoint.lng),
    note: normalizeNote(endPoint.note),
    color: DEFAULT_POINT_COLOR,
    distanceFromPrevious: 0,
    type: "point"
  };
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

  const previousStartPoint = state.startPoint ? { ...state.startPoint } : null;
  const endWillBeConvertedToStart =
    Boolean(state.endPoint) && isSamePlace(state.endPoint, startPoint);
  const convertedEndPoint = endWillBeConvertedToStart
    ? { ...state.endPoint }
    : null;

  const promotedPointId = state.editingPointId;
  const promotedPointCandidate = promotedPointId
    ? state.points.find((point) => String(point.id) === String(promotedPointId))
    : null;

  const promotedPoint =
    promotedPointCandidate && isSamePlace(promotedPointCandidate, startPoint)
      ? promotedPointCandidate
      : null;

  let nextPoints = [...state.points];

  if (promotedPoint) {
    nextPoints = nextPoints.filter(
      (point) => String(point.id) !== String(promotedPoint.id)
    );
  }

  if (previousStartPoint && !isSamePlace(previousStartPoint, startPoint)) {
    const oldStartAsPoint = createPointFromPreviousStart(previousStartPoint);
    const alreadyExists = nextPoints.some((point) =>
      isSamePlace(point, oldStartAsPoint)
    );

    if (!alreadyExists) {
      nextPoints.push(oldStartAsPoint);
    }
  }

  const nextLocationCount =
    nextPoints.length + 1 + (state.endPoint && !endWillBeConvertedToStart ? 1 : 0);

  if (!isPremiumAccessActive() && nextLocationCount > state.locationQuota) {
    alert(`Başlangıç dahil en fazla ${state.locationQuota} konum eklenebilir.`);
    return;
  }

  const nextStartPoint = {
    ...startPoint,
    note:
      promotedPoint?.note ||
      convertedEndPoint?.note ||
      (previousStartPoint && isSamePlace(previousStartPoint, startPoint)
        ? previousStartPoint.note || ""
        : "")
  };

  if (endWillBeConvertedToStart) {
    state.endPoint = null;
    clearEndMarker();
    setEndForm(null);
  }

  state.points = nextPoints;
  state.startPoint = nextStartPoint;
  state.editingPointId = null;

  clearDraftMarker();

  if (promotedPoint) {
    clearPointForm();
  }

  showStartMarker({
    lat: nextStartPoint.lat,
    lng: nextStartPoint.lng,
    title: nextStartPoint.name,
    pointData: {
      ...nextStartPoint,
      orderLabel: "S"
    },
    onClick: fillPointFormFromMarker
  });

  recomputeRoute();
  markDirty();

  if (endWillBeConvertedToStart) {
    elements.authStatus.textContent = `Bitiş noktası kaldırıldı. Son seçim başlangıç olarak kaydedildi: ${startPoint.name}`;
  } else {
    elements.authStatus.textContent = previousStartPoint
      ? `Başlangıç değiştirildi. Eski başlangıç konum olarak rotaya eklendi: ${startPoint.name}`
      : `Başlangıç eklendi: ${startPoint.name}`;
  }

  closeFloatingPanels();
}

function commitEndPoint() {
  if (!hasActiveAccess()) {
    alert("Erişim süreniz dolmuş.");
    return;
  }

  const endPoint = buildEndPointFromForm();

  if (!endPoint) {
    alert("Lütfen bitiş noktası adı, enlem ve boylam gir.");
    return;
  }

  const previousEndPoint = state.endPoint ? { ...state.endPoint } : null;
  const startWillBeConvertedToEnd =
    Boolean(state.startPoint) && isSamePlace(state.startPoint, endPoint);
  const convertedStartPoint = startWillBeConvertedToEnd
    ? { ...state.startPoint }
    : null;

  const selectedPointCandidate = state.editingPointId
    ? state.points.find((point) => String(point.id) === String(state.editingPointId))
    : null;

  const promotedPoint =
    selectedPointCandidate && isSamePlace(selectedPointCandidate, endPoint)
      ? selectedPointCandidate
      : state.points.find((point) => isSamePlace(point, endPoint)) || null;

  let nextPoints = [...state.points];

  if (promotedPoint) {
    nextPoints = nextPoints.filter(
      (point) => String(point.id) !== String(promotedPoint.id)
    );
  }

    if (previousEndPoint && !isSamePlace(previousEndPoint, endPoint)) {
    const oldEndAsPoint = createPointFromPreviousEnd(previousEndPoint);
    const alreadyExists = nextPoints.some((point) =>
      isSamePlace(point, oldEndAsPoint)
    );

    if (!alreadyExists) {
      nextPoints.push(oldEndAsPoint);
    }
  }

  const nextLocationCount =
    nextPoints.length + (state.startPoint && !startWillBeConvertedToEnd ? 1 : 0) + 1;

  if (!isPremiumAccessActive() && nextLocationCount > state.locationQuota) {
    alert(`Başlangıç dahil en fazla ${state.locationQuota} konum eklenebilir.`);
    return;
  }

  const nextEndPoint = {
    ...endPoint,
    note:
      promotedPoint?.note ||
      convertedStartPoint?.note ||
      (previousEndPoint && isSamePlace(previousEndPoint, endPoint)
        ? previousEndPoint.note || ""
        : "")
  };

  if (startWillBeConvertedToEnd) {
    detachStartPoint();
  }

  state.points = nextPoints;
  state.endPoint = nextEndPoint;
  state.editingPointId = null;

  clearDraftMarker();

  if (promotedPoint) {
    clearPointForm();
  }

  showEndMarker({
    lat: nextEndPoint.lat,
    lng: nextEndPoint.lng,
    title: nextEndPoint.name,
    pointData: {
      ...nextEndPoint,
      orderLabel: "E"
    },
    onClick: fillPointFormFromMarker
  });

  recomputeRoute();
  markDirty();

  if (startWillBeConvertedToEnd) {
    notifyStartPointRemoved(true);
  } else if (promotedPoint) {
    elements.authStatus.textContent = `Konum bitiş noktası olarak ayarlandı: ${endPoint.name}`;
  } else if (previousEndPoint) {
    elements.authStatus.textContent = `Bitiş noktası değiştirildi: ${endPoint.name}`;
  } else {
    elements.authStatus.textContent = `Bitiş noktası eklendi: ${endPoint.name}`;
  }

  closeFloatingPanels();
}

function clearStartPoint(options = {}) {
  const { showAlert = true } = options;
  const removedStartPoint = detachStartPoint();

  renderSummary();
  renderTripList();
  recomputeRoute();
  markDirty();

  if (removedStartPoint) {
    notifyStartPointRemoved(showAlert);
  }
}

function clearEndPoint() {
  state.endPoint = null;
  clearEndMarker();
  clearRouteLines();
  setEndForm(null);
  renderSummary();
  renderTripList();
  recomputeRoute();
  markDirty();
  elements.authStatus.textContent = "Bitiş noktası kaldırıldı.";
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
  setSelectedPointColor(DEFAULT_POINT_COLOR);

  if (suggestedName) {
    elements.pointName.value = suggestedName;
  } else {
    elements.pointName.value = "İşaretli Konum";
  }
}

function fillEndFormFromMap(lat, lng, suggestedName = "") {
  if (!elements.endLat || !elements.endLng || !elements.endName) return;

  elements.endLat.value = lat.toFixed(6);
  elements.endLng.value = lng.toFixed(6);

  if (suggestedName) {
    elements.endName.value = suggestedName;
  } else {
    elements.endName.value = "İşaretli Konum";
  }
}

function fillBothFormsFromMap(lat, lng, suggestedName = "") {
  fillPointFormFromMap(lat, lng, suggestedName);
  fillStartFormFromMap(lat, lng, suggestedName);
  fillEndFormFromMap(lat, lng, suggestedName);
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

  if (pointData.type === "end") {
    state.editingPointId = null;
    setSelectedPointColor(DEFAULT_POINT_COLOR);
    elements.authStatus.textContent = `Bitiş noktası bilgisi yüklendi: ${pointData.name}`;
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
      <div class="trip-item start${hasLocationNote(state.startPoint) ? " has-note" : ""}">
        <div class="trip-order">S</div>
        <div class="trip-content">
          <strong>${escapeHtml(state.startPoint.name)}</strong>
          <span>Önceki mesafe: —</span>
          ${renderNotePreview(state.startPoint)}
        </div>
        <div class="trip-actions">
          ${renderNoteButton({ action: "note-start", hasNote: hasLocationNote(state.startPoint) })}
          <button class="tiny-btn icon-route-btn" type="button" data-action="directions-start" aria-label="Yol Tarifi" title="Yol Tarifi">${directionsIconSvg()}</button>
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
        <button class="tiny-btn icon-route-btn" type="button" disabled aria-label="Yol Tarifi" title="Yol Tarifi">${directionsIconSvg()}</button>
      </div>
    `;

  const pointHtml = state.points
    .map((point, index) => {
      const pointColor = point.color || DEFAULT_POINT_COLOR;
      const pointShadow = `${pointColor}33`;
      const pointHasNote = hasLocationNote(point);

      return `
        <div class="trip-item${pointHasNote ? " has-note" : ""}">
          <div class="trip-order" style="background:${escapeHtml(pointColor)}; box-shadow: 0 12px 22px ${escapeHtml(pointShadow)}">${index + 1}</div>
          <div class="trip-content">
            <strong>${escapeHtml(point.name)}</strong>
            <span>Önceki mesafe: ${formatKm(point.distanceFromPrevious || 0)}</span>
            ${renderNotePreview(point)}
          </div>
          <div class="trip-actions">
            ${renderNoteButton({ action: "note-point", id: point.id, hasNote: pointHasNote })}
            <button class="tiny-btn icon-route-btn" type="button" data-action="directions-point" data-id="${point.id}" aria-label="Yol Tarifi" title="Yol Tarifi">${directionsIconSvg()}</button>
            <button class="tiny-btn" type="button" data-action="focus-point" data-id="${point.id}">Odakla</button>
            <button class="tiny-btn" type="button" data-action="delete-point" data-id="${point.id}">Sil</button>
          </div>
        </div>
      `;
    })
    .join("");

  const endHtml = state.endPoint
    ? `
      <div class="trip-item end${hasLocationNote(state.endPoint) ? " has-note" : ""}">
        <div class="trip-order end-order">E</div>
        <div class="trip-content">
          <strong>${escapeHtml(state.endPoint.name)}</strong>
          <span>Önceki mesafe: ${formatKm(state.endPoint.distanceFromPrevious || 0)}</span>
          ${renderNotePreview(state.endPoint)}
        </div>
        <div class="trip-actions">
          ${renderNoteButton({ action: "note-end", hasNote: hasLocationNote(state.endPoint) })}
          <button class="tiny-btn icon-route-btn" type="button" data-action="directions-end" aria-label="Yol Tarifi" title="Yol Tarifi">${directionsIconSvg()}</button>
          <button class="tiny-btn" type="button" data-action="focus-end">Odakla</button>
          <button class="tiny-btn" type="button" data-action="delete-end">Sil</button>
        </div>
      </div>
    `
    : "";

  elements.tripList.innerHTML = startHtml + pointHtml + endHtml;
}

function redrawStartMarker() {
  if (!state.startPoint) {
    clearStartMarker();
    return;
  }

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

function redrawEndMarker() {
  if (!state.endPoint) {
    clearEndMarker();
    return;
  }

  showEndMarker({
    lat: state.endPoint.lat,
    lng: state.endPoint.lng,
    title: state.endPoint.name,
    pointData: {
      ...state.endPoint,
      orderLabel: "E"
    },
    onClick: fillPointFormFromMarker
  });
}

function recomputeRoute() {
  state.points = keepLastPointPerPlace(state.points);

  if (!state.startPoint) {
    state.totalDistance = 0;
    clearRouteLines();
    redrawStartMarker();
    renderSummary();
    renderTripList();
    redrawPointMarkers();
    redrawEndMarker();
    return;
  }

  if (!state.points.length && !state.endPoint) {
    state.totalDistance = 0;
    clearRouteLines();
    redrawStartMarker();
    renderSummary();
    renderTripList();
    redrawPointMarkers();
    redrawEndMarker();
    return;
  }

  const result = nearestNeighborRoute(
    state.startPoint,
    state.points,
    state.endPoint
  );

  state.points = result.orderedPoints;
  state.endPoint = result.endPoint;
  state.totalDistance = result.totalDistance;

  redrawStartMarker();
  redrawPointMarkers();
  redrawEndMarker();
  drawRouteSegments(state.startPoint, state.points, state.endPoint);
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

function clearEndFormOnly() {
  setEndForm(null);
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
  const color = state.selectedPointColor || DEFAULT_POINT_COLOR;

  if (!name || !lat || !lng) {
    alert("Lütfen nokta adı, enlem ve boylam gir.");
    return;
  }

  if (!state.startPoint) {
    alert("Önce başlangıç noktasını doldur ve Başlangıç Ekle butonuna bas.");
    return;
  }

  const pointLocation = {
    id: state.editingPointId || null,
    name,
    lat: Number(lat),
    lng: Number(lng),
    color,
    type: "point"
  };

  const duplicatePoint = findDuplicatePointByPlace(
    pointLocation,
    state.editingPointId
  );
  const startWillBeConvertedToPoint =
    Boolean(state.startPoint) && isSamePlace(state.startPoint, pointLocation);
  const convertedStartPoint = startWillBeConvertedToPoint
    ? { ...state.startPoint }
    : null;
  const endWillBeConvertedToPoint =
    Boolean(state.endPoint) && isSamePlace(state.endPoint, pointLocation);
  const convertedEndPoint = endWillBeConvertedToPoint
    ? { ...state.endPoint }
    : null;

  const isNewPoint = !state.editingPointId;
  const willAddNewLocationSlot =
    isNewPoint &&
    !duplicatePoint &&
    !startWillBeConvertedToPoint &&
    !endWillBeConvertedToPoint;

  if (willAddNewLocationSlot && !canAddMoreLocations(1)) {
    alert(`Başlangıç dahil en fazla ${state.locationQuota} konum eklenebilir.`);
    return;
  }

  if (state.editingPointId) {
    const removedDuplicatePoint = removeDuplicatePointsByPlace(
      pointLocation,
      state.editingPointId
    );

    state.points = state.points.map((point) =>
      String(point.id) === String(state.editingPointId)
        ? {
            ...point,
            name,
            lat: Number(lat),
            lng: Number(lng),
            color,
            note:
              point.note ||
              removedDuplicatePoint?.note ||
              convertedStartPoint?.note ||
              convertedEndPoint?.note ||
              ""
          }
        : point
    );
  } else {
    const removedDuplicatePoint = removeDuplicatePointsByPlace(pointLocation);

    state.points.push({
      id: Date.now() + Math.random(),
      name,
      lat: Number(lat),
      lng: Number(lng),
      color,
      note:
        removedDuplicatePoint?.note ||
        convertedStartPoint?.note ||
        convertedEndPoint?.note ||
        "",
      distanceFromPrevious: 0,
      type: "point"
    });
  }

  state.points = keepLastPointPerPlace(state.points);

  if (startWillBeConvertedToPoint) {
    detachStartPoint();
  }

  if (endWillBeConvertedToPoint) {
    state.endPoint = null;
    clearEndMarker();
    setEndForm(null);
  }

  clearDraftMarker();
  clearPointForm();
  recomputeRoute();
  markDirty();
  closeFloatingPanels();

  if (startWillBeConvertedToPoint) {
    notifyStartPointRemoved(true);
  } else if (endWillBeConvertedToPoint) {
    elements.authStatus.textContent = `Bitiş noktası normal konuma dönüştürüldü: ${name}`;
  } else {
    elements.authStatus.textContent = duplicatePoint
      ? `Aynı konum güncellendi: ${name}`
      : `Konum eklendi: ${name}`;
  }
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

  if (pointData.type === "end") {
    clearEndPoint();
    return;
  }

  if (pointData.id == null) return;
  deletePoint(pointData.id);
}

function handleMarkerColorRequest(event) {
  const pointData = event?.detail?.pointData;
  const color = event?.detail?.color;

  if (!pointData || !color || pointData.type === "start" || pointData.type === "end") return;

  state.points = state.points.map((point) => {
    if (String(point.id) !== String(pointData.id)) return point;
    return {
      ...point,
      color
    };
  });

  if (state.editingPointId && String(state.editingPointId) === String(pointData.id)) {
    setSelectedPointColor(color);
  }

  recomputeRoute();
  markDirty();
  elements.authStatus.textContent = `Konum rengi güncellendi: ${pointData.name || "Nokta"}`;
}

function applyImportedData(startPoint, points, endPoint = null) {
  const uniqueImportedPoints = keepLastPointPerPlace(points);
  const importedCount = uniqueImportedPoints.length + (startPoint ? 1 : 0) + (endPoint ? 1 : 0);
  if (!isPremiumAccessActive() && importedCount > state.locationQuota) {
    alert(`İçe aktarılan veride başlangıç dahil en fazla ${state.locationQuota} konum olabilir.`);
    return false;
  }

  const safeStartPoint = startPoint
    ? { ...startPoint, note: normalizeNote(startPoint.note) }
    : null;
  const safeEndPoint = endPoint
    ? { ...endPoint, note: normalizeNote(endPoint.note) }
    : null;
  const safeImportedPoints = uniqueImportedPoints.map((point) => ({
    ...point,
    note: normalizeNote(point.note)
  }));

  state.startPoint = safeStartPoint;
  state.endPoint = safeEndPoint;
  state.points = safeImportedPoints;
  state.editingPointId = null;

  setStartForm(safeStartPoint);
  setEndForm(safeEndPoint);

  if (safeStartPoint) {
    showStartMarker({
      lat: safeStartPoint.lat,
      lng: safeStartPoint.lng,
      title: safeStartPoint.name,
      pointData: {
        ...safeStartPoint,
        orderLabel: "S"
      },
      onClick: fillPointFormFromMarker
    });
  } else {
    clearStartMarker();
  }

  if (safeEndPoint) {
    showEndMarker({
      lat: safeEndPoint.lat,
      lng: safeEndPoint.lng,
      title: safeEndPoint.name,
      pointData: {
        ...safeEndPoint,
        orderLabel: "E"
      },
      onClick: fillPointFormFromMarker
    });
  } else {
    clearEndMarker();
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
          lng: state.startPoint.lng,
          note: normalizeNote(state.startPoint.note)
        }
      : null,
    endPoint: state.endPoint
      ? {
          name: state.endPoint.name,
          lat: state.endPoint.lat,
          lng: state.endPoint.lng,
          note: normalizeNote(state.endPoint.note)
        }
      : null,
    points: state.points.map((point) => ({
      name: point.name,
      lat: point.lat,
      lng: point.lng,
      color: point.color || DEFAULT_POINT_COLOR,
      note: normalizeNote(point.note),
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
  closeNoteEditor();
  state.selectedMapId = null;
  state.startPoint = null;
  state.endPoint = null;
  state.points = [];
  state.totalDistance = 0;
  state.editingPointId = null;

  elements.mapName.value = "";
  setStartForm(null);
  setEndForm(null);
  clearPointForm();
  clearStartMarker();
  clearEndMarker();
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
        elements.authStatus.textContent = "Haritanız güncellendi.";
        markClean();
        await refreshMapList();
        closeFloatingPanels();
        alert("Haritanız güncellendi.");
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
      await refreshMapList();
      markClean();
      closeFloatingPanels();
      alert("Haritanız güncellendi.");
      return;
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
    return false;
  }

  const button = event.target.closest(".map-list-item");
  if (!button) return false;

  const mapId = button.dataset.mapId;
  if (!mapId || !state.currentUser) return false;

  if (!canReadMapId(mapId)) {
    elements.authStatus.textContent = "Bu harita yalnızca premium erişimde görüntülenebilir.";
    return false;
  }

  if (state.hasUnsavedChanges && hasMapContent()) {
    const confirmed = window.confirm(
      "Kaydedilmemiş değişiklikler silinecektir. Devam etmek istiyor musunuz?"
    );

    if (!confirmed) {
      elements.authStatus.textContent = "Harita yükleme işlemi iptal edildi.";
      return false;
    }
  }

  try {
    const mapData = await getMapById(state.currentUser.uid, mapId, {
      fullAccess: isPremiumAccessActive()
    });

    if (!mapData) return false;

    state.selectedMapId = mapData.id;
    elements.mapName.value = mapData.name || "";

    const startPoint = mapData.startPoint
      ? {
          id: "start-point",
          name: mapData.startPoint.name,
          lat: Number(mapData.startPoint.lat),
          lng: Number(mapData.startPoint.lng),
          note: normalizeNote(mapData.startPoint.note),
          type: "start"
        }
      : null;

    const endPoint = mapData.endPoint
      ? {
          id: "end-point",
          name: mapData.endPoint.name,
          lat: Number(mapData.endPoint.lat),
          lng: Number(mapData.endPoint.lng),
          note: normalizeNote(mapData.endPoint.note),
          type: "end"
        }
      : null;

    const points = Array.isArray(mapData.points)
      ? mapData.points.map((point) => ({
          id: Date.now() + Math.random(),
          name: point.name,
          lat: Number(point.lat),
          lng: Number(point.lng),
          color: point.color || DEFAULT_POINT_COLOR,
          note: normalizeNote(point.note),
          distanceFromPrevious: 0,
          type: "point"
        }))
      : [];

    const applied = applyImportedData(startPoint, points, endPoint);
    if (!applied) return false;

    focusMapToPoints(startPoint, points, endPoint);

    markClean();
    elements.authStatus.textContent = `Harita yüklendi: ${mapData.name || "İsimsiz Harita"}`;
    highlightSelectedMap(mapId);

    return true;
  } catch (error) {
    elements.authStatus.textContent = `Harita yükleme hatası: ${error.message}`;
    return false;
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
    exportToXlsx("gezi-listesi.xlsx", state.startPoint, state.points, state.endPoint);
    elements.authStatus.textContent = "XLSX dışa aktarıldı.";
    return;
  }

  exportToCsv("gezi-listesi.csv", state.startPoint, state.points, state.endPoint);
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
    const { startPoint, points, endPoint } = convertImportedRowsToState(rows);
    const applied = applyImportedData(startPoint, points, endPoint);
    if (!applied) return;
    state.selectedMapId = null;
    focusMapToPoints(startPoint, points, endPoint);
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
    const { startPoint, points, endPoint } = convertImportedRowsToState(rows);
    const applied = applyImportedData(startPoint, points, endPoint);
    if (!applied) return;
    state.selectedMapId = null;
    focusMapToPoints(startPoint, points, endPoint);
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
    const coords = await locateAndShowUser();
    const lat = Number(coords?.lat);
    const lng = Number(coords?.lng);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      fillBothFormsFromMap(lat, lng, "Mevcut Konumunuz");
      state.editingPointId = null;
      markDirty();
    }

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

  if (action === "note-start") {
    if (!state.startPoint) return;
    openNoteEditor({ type: "start" });
    return;
  }

  if (action === "note-end") {
    if (!state.endPoint) return;
    openNoteEditor({ type: "end" });
    return;
  }

  if (action === "note-point") {
    openNoteEditor({ type: "point", id: target.dataset.id });
    return;
  }

  if (action === "delete-point") {
    deletePoint(target.dataset.id);
    return;
  }

  if (action === "delete-start") {
    clearStartPoint();
    return;
  }

  if (action === "delete-end") {
    clearEndPoint();
    return;
  }

  if (action === "focus-start") {
    if (!state.startPoint) return;
    const lat = Number(state.startPoint.lat);
    const lng = Number(state.startPoint.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const pointDataForUi = {
      ...state.startPoint,
      orderLabel: "S"
    };

    fillPointFormFromMarker(pointDataForUi);

    scrollToMapArea();
    focusToLocation(lat, lng, 17);

    window.setTimeout(() => {
      openInfoForPoint(pointDataForUi);
    }, 180);

    return;
  }

  if (action === "focus-end") {
    if (!state.endPoint) return;
    const lat = Number(state.endPoint.lat);
    const lng = Number(state.endPoint.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const pointDataForUi = {
      ...state.endPoint,
      orderLabel: "E"
    };

    fillPointFormFromMarker(pointDataForUi);

    scrollToMapArea();
    focusToLocation(lat, lng, 17);

    window.setTimeout(() => {
      openInfoForPoint(pointDataForUi);
    }, 180);

    return;
  }

  if (action === "directions-start") {
    if (!state.startPoint) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${state.startPoint.lat},${state.startPoint.lng}`;
    window.location.href = url;
    return;
  }

  if (action === "directions-end") {
    if (!state.endPoint) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${state.endPoint.lat},${state.endPoint.lng}`;
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

function closeLocationActionMenu() {
  state.locationActionsMenuOpen = false;
  elements.locationActionsMenu?.classList.add("hidden");
  elements.btnOpenLocationActions?.setAttribute("aria-expanded", "false");
}

function closeFloatingPanelsOnly() {
  [
    elements.startPanel,
    elements.pointPanel,
    elements.endPanel,
    elements.savePanel,
    elements.importExportPanel
  ].forEach((panel) => {
    panel?.classList.add("hidden");
  });

  state.activeFloatingPanel = null;
  syncMobilePanelState();
}

function toggleLocationActionMenu(forceValue) {
  state.locationActionsMenuOpen =
    typeof forceValue === "boolean" ? forceValue : !state.locationActionsMenuOpen;

  if (state.locationActionsMenuOpen) {
    closeMapMenu();
    closeFloatingPanelsOnly();
  }

  elements.locationActionsMenu?.classList.toggle("hidden", !state.locationActionsMenuOpen);
  elements.btnOpenLocationActions?.setAttribute(
    "aria-expanded",
    state.locationActionsMenuOpen ? "true" : "false"
  );
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

  const hasEndCoords =
    elements.endLat?.value.trim() && elements.endLng?.value.trim();

  return Boolean(hasStartCoords || hasPointCoords || hasEndCoords);
}

function getVisibleFloatingPanelName() {
  const panelEntries = [
    ["start", elements.startPanel],
    ["point", elements.pointPanel],
    ["end", elements.endPanel],
    ["save", elements.savePanel],
    ["importExport", elements.importExportPanel]
  ];

  for (const [panelName, panel] of panelEntries) {
    if (panel && !panel.classList.contains("hidden")) {
      return panelName;
    }
  }

  return null;
}

function syncMobilePanelState() {
  const isMobile = window.innerWidth <= 720;
  const visiblePanelName = getVisibleFloatingPanelName();

  if (visiblePanelName !== state.activeFloatingPanel) {
    state.activeFloatingPanel = visiblePanelName;
  }

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

  if (state.mapMenuOpen) {
    closeLocationActionMenu();
  }

  elements.mapMenu?.classList.toggle("hidden", !state.mapMenuOpen);
}

function closeFloatingPanels() {
  [
    elements.startPanel,
    elements.pointPanel,
    elements.endPanel,
    elements.savePanel,
    elements.importExportPanel
  ].forEach((panel) => {
    panel?.classList.add("hidden");
  });
  state.activeFloatingPanel = null;
  closeLocationActionMenu();
  syncMobilePanelState();
}

function openFloatingPanel(panelName) {
  const panelMap = {
    start: elements.startPanel,
    point: elements.pointPanel,
    end: elements.endPanel,
    save: elements.savePanel,
    importExport: elements.importExportPanel
  };

  const panel = panelMap[panelName];
  if (!panel) return;

  const isOpen = !panel.classList.contains("hidden");
  closeFloatingPanels();
  closeMapMenu();
  closeLocationActionMenu();

  if (!isOpen) {
    panel.classList.remove("hidden");
    state.activeFloatingPanel = panelName;
  }

  syncMobilePanelState();
}

function openSavedMapsOverlay() {
  closeFloatingPanels();
  closeMapMenu();
  closeLocationActionMenu();
  elements.savedMapsOverlay?.classList.remove("hidden");
}

function closeSavedMapsOverlay() {
  elements.savedMapsOverlay?.classList.add("hidden");
}

function handleShellClick(event) {
  const insideMenu = event.target.closest(".menu-wrapper");
  const insideLocationActions = event.target.closest(".location-actions-wrapper");
  const insideFloatingCard = event.target.closest(".floating-card");

  if (!insideMenu) {
    closeMapMenu();
  }

  if (!insideLocationActions && !insideFloatingCard) {
    closeLocationActionMenu();
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

  bindTapSafe(elements.btnAddPoint, addOrUpdatePoint);
  bindTapSafe(elements.btnAddStartPoint, commitStartPoint);
  bindTapSafe(elements.btnAddEndPoint, commitEndPoint);

  elements.btnClearForm?.addEventListener("click", clearPointForm);
  elements.btnCurrentLocation?.addEventListener("click", handleCurrentLocationClick);
  elements.tripList?.addEventListener("click", handleTripListClick);

  window.addEventListener("routee:delete-point-request", handleMarkerDeleteRequest);
  window.addEventListener("routee:marker-color-request", handleMarkerColorRequest);
  window.addEventListener("routee:marker-note-request", handleMarkerNoteRequest);

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
    const opened = await handleMapListClick(event);
    const clickedMap = event.target.closest(".map-list-item");

    if (
      opened &&
      clickedMap &&
      !event.target.closest("[data-action='delete-map']")
    ) {
      closeSavedMapsOverlay();
    }
  });

  elements.btnLogoutTop?.addEventListener("click", handleLogout);

  elements.btnOpenLocationActions?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLocationActionMenu();
  });

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

  elements.btnOpenEndPanel?.addEventListener("click", () => {
    if (window.innerWidth <= 720 && !hasDraftCoordinates()) {
      alert("Önce konum seçiniz.");
      return;
    }

    openFloatingPanel("end");
  });

  elements.btnCloseStartPanel?.addEventListener("click", closeFloatingPanels);
  elements.btnClosePointPanel?.addEventListener("click", closeFloatingPanels);
  elements.btnCloseEndPanel?.addEventListener("click", closeFloatingPanels);
  elements.btnToggleMenu?.addEventListener("click", () => toggleMapMenu());
  elements.btnOpenSavePanel?.addEventListener("click", () => openFloatingPanel("save"));
  elements.btnOpenSavePanelTrip?.addEventListener("click", () => openFloatingPanel("save"));
  elements.btnOpenMapListPanelTrip?.addEventListener("click", openSavedMapsOverlay);
  elements.btnOpenImportExportPanel?.addEventListener("click", () => openFloatingPanel("importExport"));
  elements.btnOpenMapListPanel?.addEventListener("click", openSavedMapsOverlay);
  elements.btnCloseSavePanel?.addEventListener("click", closeFloatingPanels);
  elements.btnCloseImportExportPanel?.addEventListener("click", closeFloatingPanels);
  elements.btnCloseMapListPanel?.addEventListener("click", closeSavedMapsOverlay);
  elements.savedMapsBackdrop?.addEventListener("click", closeSavedMapsOverlay);
  elements.noteEditorBackdrop?.addEventListener("click", closeNoteEditor);
  elements.btnCloseNoteEditor?.addEventListener("click", closeNoteEditor);
  elements.btnSaveNote?.addEventListener("click", handleSaveNote);
  elements.btnDeleteNote?.addEventListener("click", handleDeleteNote);
  elements.noteEditorText?.addEventListener("input", () => {
    const safeValue = sanitizeNoteEditorInput();
    elements.btnDeleteNote?.toggleAttribute("disabled", !normalizeNote(safeValue));
  });
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
  elements.endName?.addEventListener("input", markDirty);
  elements.endLat?.addEventListener("input", markDirty);
  elements.endLng?.addEventListener("input", markDirty);
}

function initMapClickPicker() {
  enableMapClickPicker(({ lat, lng, name }) => {
    if (!hasActiveAccess()) return;
    fillBothFormsFromMap(lat, lng, name || "");
    state.editingPointId = null;
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
    state.editingPointId = null;
    markDirty();
    elements.authStatus.textContent = `Arama ile yer seçildi: ${name}`;
  });
}

async function loadAccessModel(user) {
  state.claims = await getUserClaims(user);
  state.profile = await getUserProfile(user.uid);

  const profileRole = String(state.profile?.role || "").toLowerCase();

  state.fullAccess =
    state.claims?.fullAccess === true ||
    state.profile?.fullAccess === true ||
    profileRole === "premium";

  state.locationQuota = state.profile?.locationQuota || TRIAL_LOCATION_QUOTA;
  state.mapQuota = state.profile?.mapQuota || 1;
  state.accessActive = hasActiveAccess();
}

function initAuthWatcher() {
  watchAuth(async (user) => {
    state.currentUser = user;

    try {
      if (user) {
        await closeAppStartupSplash(state.appStartupSplash);
        state.appStartupSplash = null;

        elements.authStatus.textContent = `Aktif kullanıcı: ${user.email}`;

        await ensureUserProfile(user.uid, user.email);
        await loadAccessModel(user);
        elements.authStatus.textContent = `Aktif kullanıcı: ${user.email} · ${getAccessStatusText()}`;

        const loadMapsTask = async () => {
          try {
            await loadUserMaps(user.uid, isPremiumAccessActive());
          } catch (error) {
            console.warn("Harita listesi yüklenemedi:", error);
          }
        };

        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(() => {
            loadMapsTask();
          });
        } else {
          window.setTimeout(() => {
            loadMapsTask();
          }, 0);
        }
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

  renderSummary();
  renderTripList();
  bindEvents();
  syncMobilePanelState();
  initMobileTopbarAutoHide();
  initAuthWatcher();

  window.requestAnimationFrame(() => {
    bootstrapMapFeatures();
  });
}

document.addEventListener("DOMContentLoaded", init);
