let map;
let markers = [];
let currentLocationMarker = null;
let mapClickListener = null;
let draftMarker = null;
let searchMarker = null;
let startMarker = null;
let endMarker = null;
let routePolylines = [];
let distanceOverlays = [];
let activeInfoWindow = null;

let searchService = null;
let geocoder = null;
let searchDropdown = null;
let searchInputEl = null;
let searchSelectHandlerBound = false;
let searchInputHandlerBound = false;
let searchBlurHandlerBound = false;
let searchFocusHandlerBound = false;
let isInteractingWithSearchDropdown = false;
let lastPredictionRequestId = 0;
let currentPredictions = [];

let activeAutocompleteSessionToken = null;
let searchDebounceTimer = null;
const MIN_SEARCH_LENGTH = 4;
const SEARCH_DEBOUNCE_MS = 450;
const MAX_PREDICTIONS = 5;

const POINT_COLORS = [
  { value: "#dc2626", label: "Kırmızı" },
  { value: "#2563eb", label: "Mavi" },
  { value: "#16a34a", label: "Yeşil" },
  { value: "#ea580c", label: "Turuncu" },
  { value: "#7c3aed", label: "Mor" },
  { value: "#db2777", label: "Pembe" },
  { value: "#ca8a04", label: "Sarı" },
  { value: "#0f172a", label: "Koyu" }
];

const MAP_CLICK_PROGRESSIVE_ZOOM_LEVELS = [
  { maxZoom: 4, targetZoom: 6 },
  { maxZoom: 10, targetZoom: 11 },
  { maxZoom: 14, targetZoom: 16 },
  { maxZoom: 18, targetZoom: 19 }
];

const MAP_CLICK_FINAL_PICK_ZOOM = 19;
const MARKER_CLICK_TARGET_ZOOM = 17;
const SMOOTH_ZOOM_STEP_DELAY_MS = 120;
const SMOOTH_ZOOM_START_DELAY_MS = 110;

let smoothZoomTimer = null;
let smoothZoomRunId = 0;

function clampZoom(zoom) {
  const normalized = Number(zoom);

  if (!Number.isFinite(normalized)) return 15;

  return Math.min(20, Math.max(2, Math.round(normalized)));
}

function getCurrentMapZoom() {
  if (!map || typeof map.getZoom !== "function") return 11;

  const zoom = Number(map.getZoom());
  return Number.isFinite(zoom) ? zoom : 11;
}

function cancelSmoothZoom() {
  smoothZoomRunId += 1;

  if (smoothZoomTimer) {
    window.clearTimeout(smoothZoomTimer);
    smoothZoomTimer = null;
  }
}

function scrollMapAreaIntoViewOnMobile() {
  if (window.innerWidth > 720) return;

  const mapCanvas = document.getElementById("mapCanvas");
  if (!mapCanvas) return;

  const topbar = document.querySelector(".topbar");
  const topbarHeight = topbar?.offsetHeight || 0;
  const extraOffset = 16;

  const rect = mapCanvas.getBoundingClientRect();
  const targetTop = window.scrollY + rect.top - topbarHeight - extraOffset;

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: "smooth"
  });
}

function getProgressiveClickTargetZoom(currentZoom) {
  const normalizedZoom = getCurrentMapZoom();
  const sourceZoom = Number.isFinite(Number(currentZoom))
    ? Math.round(Number(currentZoom))
    : normalizedZoom;

  const matchedStage = MAP_CLICK_PROGRESSIVE_ZOOM_LEVELS.find(
    (stage) => sourceZoom <= stage.maxZoom
  );

  if (matchedStage) {
    return matchedStage.targetZoom;
  }

  return Math.max(sourceZoom, MAP_CLICK_FINAL_PICK_ZOOM);
}

function smoothFocusToLocation(lat, lng, targetZoom, options = {}) {
  if (!map) return;

  const normalizedLat = Number(lat);
  const normalizedLng = Number(lng);

  if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng)) return;

  cancelSmoothZoom();

  const runId = smoothZoomRunId;
  const center = { lat: normalizedLat, lng: normalizedLng };
  const currentZoom = getCurrentMapZoom();
  const finalZoom = options.allowZoomOut
    ? clampZoom(targetZoom)
    : clampZoom(Math.max(targetZoom, currentZoom));
  const stepDelay = Number.isFinite(Number(options.stepDelay))
    ? Number(options.stepDelay)
    : SMOOTH_ZOOM_STEP_DELAY_MS;

  map.panTo(center);

  if (finalZoom === currentZoom) return;

  const zoomStep = () => {
    if (runId !== smoothZoomRunId || !map) return;

    const activeZoom = getCurrentMapZoom();

    if (activeZoom === finalZoom) {
      smoothZoomTimer = null;
      return;
    }

    const direction = finalZoom > activeZoom ? 1 : -1;
    const nextZoom =
      direction > 0
        ? Math.min(finalZoom, activeZoom + 1)
        : Math.max(finalZoom, activeZoom - 1);

    map.setZoom(nextZoom);

    if (nextZoom !== finalZoom) {
      smoothZoomTimer = window.setTimeout(zoomStep, stepDelay);
    } else {
      smoothZoomTimer = null;
    }
  };

  smoothZoomTimer = window.setTimeout(zoomStep, SMOOTH_ZOOM_START_DELAY_MS);
}

function handleProgressiveMapClickFocus(lat, lng) {
  if (!map) return;

  const currentZoom = getCurrentMapZoom();
  const targetZoom = getProgressiveClickTargetZoom(currentZoom);

  smoothFocusToLocation(lat, lng, targetZoom);
}

function handleMarkerClickFocus(marker) {
  if (!marker || typeof marker.getPosition !== "function") return;

  const position = marker.getPosition();
  if (!position) return;

  scrollMapAreaIntoViewOnMobile();

  smoothFocusToLocation(position.lat(), position.lng(), MARKER_CLICK_TARGET_ZOOM, {
    stepDelay: 95,
    allowZoomOut: true
  });
}

function initMap() {
  const mapElement = document.getElementById("mapCanvas");
  if (!mapElement) return null;

  mapElement.innerHTML = "";

  const defaultCenter = { lat: 39.0, lng: 35.0 };

  map = new google.maps.Map(mapElement, {
    center: defaultCenter,
    zoom: 6,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
    clickableIcons: false
  });

  activeInfoWindow = new google.maps.InfoWindow({
    ariaLabel: "Konum Bilgisi"
  });

  geocoder = new google.maps.Geocoder();
  searchService = new google.maps.places.AutocompleteService();

  return map;
}

function getMap() {
  return map;
}

function createCircleSymbol(fillColor, strokeColor = "#ffffff", scale = 14) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor,
    fillOpacity: 1,
    strokeColor,
    strokeWeight: 3,
    scale
  };
}

function createGoogleMapsDirectionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function dispatchMarkerDeleteRequest(pointData) {
  if (!pointData) return;

  window.dispatchEvent(
    new CustomEvent("routee:delete-point-request", {
      detail: { pointData }
    })
  );
}

function dispatchMarkerColorRequest(pointData, color) {
  if (!pointData || !color) return;

  window.dispatchEvent(
    new CustomEvent("routee:marker-color-request", {
      detail: { pointData, color }
    })
  );
}

function dispatchLocationNoteRequest(pointData) {
  if (!pointData) return;

  window.dispatchEvent(
    new CustomEvent("routee:location-note-request", {
      detail: { pointData }
    })
  );
}

function getPointNote(pointData) {
  return String(pointData?.note ?? "").trim();
}

function hasPointNote(pointData) {
  return getPointNote(pointData).length > 0;
}

function getPointDisplayTitle(pointData) {
  if (!pointData) return "Seçilen Konum";

  if (pointData.type === "start") {
    return `S. ${pointData.name || "Başlangıç"}`;
  }

  if (pointData.type === "end") {
    return `E. ${pointData.name || "Bitiş Noktası"}`;
  }

  if (pointData.orderLabel) {
    return `${pointData.orderLabel}. ${pointData.name || "Nokta"}`;
  }

  return pointData.name || "Nokta";
}

function getPointSubtitle(pointData) {
  if (!pointData) return "";

  const raw = pointData.description || "";

  if (!raw) return "";

  return String(raw).trim();
}

function createInfoWindowContent(pointData) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "236px";
  wrapper.style.maxWidth = "236px";
  wrapper.style.boxSizing = "border-box";
  wrapper.style.padding = "12px";
  wrapper.style.borderRadius = "16px";
  wrapper.style.background = "#ffffff";
  wrapper.style.border = "1px solid rgba(226, 232, 240, 0.95)";
  wrapper.style.boxShadow = "0 14px 28px rgba(15, 23, 42, 0.16)";
  wrapper.style.fontFamily = "inherit";
  wrapper.style.position = "relative";
  wrapper.style.overflow = "visible";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Kapat");
  closeBtn.textContent = "×";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "8px";
  closeBtn.style.right = "8px";
  closeBtn.style.width = "26px";
  closeBtn.style.height = "26px";
  closeBtn.style.border = "none";
  closeBtn.style.borderRadius = "999px";
  closeBtn.style.background = "rgba(15, 23, 42, 0.06)";
  closeBtn.style.color = "#475569";
  closeBtn.style.fontSize = "18px";
  closeBtn.style.lineHeight = "1";
  closeBtn.style.display = "flex";
  closeBtn.style.alignItems = "center";
  closeBtn.style.justifyContent = "center";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.padding = "0";
  closeBtn.style.zIndex = "3";

  closeBtn.addEventListener("click", () => {
    activeInfoWindow?.close();
  });

  const hasNote = hasPointNote(pointData);
  const noteBtn = document.createElement("button");

  noteBtn.type = "button";
  noteBtn.className = `info-note-btn ${hasNote ? "has-note" : "is-empty"}`;
  noteBtn.setAttribute(
    "aria-label",
    hasNote ? "Konum notunu görüntüle veya düzenle" : "Bu konuma not ekle"
  );
  noteBtn.title = hasNote ? "Notu görüntüle veya düzenle" : "Not ekle";
  noteBtn.textContent = "📝";

  noteBtn.addEventListener("click", () => {
    dispatchLocationNoteRequest(pointData);
    activeInfoWindow?.close();
  });

  const badge = document.createElement("div");

  if (pointData?.type === "start") {
    badge.textContent = "Başlangıç Noktası";
  } else if (pointData?.type === "end") {
    badge.textContent = "Bitiş Noktası";
  } else {
    badge.textContent = "Konum Bilgisi";
  }

  badge.style.display = "inline-flex";
  badge.style.alignItems = "center";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "700";
  badge.style.letterSpacing = "0.04em";
  badge.style.textTransform = "uppercase";
  badge.style.color = pointData?.type === "end" ? "#c2410c" : "#1d4ed8";
  badge.style.background =
    pointData?.type === "end"
      ? "rgba(249, 115, 22, 0.12)"
      : "rgba(37, 99, 235, 0.10)";
  badge.style.padding = "5px 8px";
  badge.style.borderRadius = "999px";
  badge.style.marginBottom = "8px";

  const title = document.createElement("div");
  title.textContent = getPointDisplayTitle(pointData);
  title.style.fontSize = "14px";
  title.style.fontWeight = "800";
  title.style.lineHeight = "1.25";
  title.style.color = "#0f172a";
  title.style.wordBreak = "break-word";
  title.style.paddingRight = "76px";
  title.style.marginBottom = "8px";

  wrapper.appendChild(closeBtn);
  wrapper.appendChild(noteBtn);
  wrapper.appendChild(badge);
  wrapper.appendChild(title);

  const noteText = getPointNote(pointData);
  const noteBox = document.createElement("div");
  noteBox.style.marginBottom = "10px";
  noteBox.style.padding = hasNote ? "8px 9px" : "7px 9px";
  noteBox.style.borderRadius = "12px";
  noteBox.style.border = hasNote ? "1px solid rgba(245, 158, 11, 0.28)" : "1px dashed rgba(148, 163, 184, 0.55)";
  noteBox.style.background = hasNote ? "#fffbeb" : "#f8fafc";

  const noteLabel = document.createElement("div");
  noteLabel.textContent = hasNote ? "Not" : "Not yok";
  noteLabel.style.fontSize = "10px";
  noteLabel.style.fontWeight = "800";
  noteLabel.style.color = hasNote ? "#92400e" : "#64748b";
  noteLabel.style.textTransform = "uppercase";
  noteLabel.style.letterSpacing = "0.04em";
  noteLabel.style.marginBottom = hasNote ? "4px" : "0";
  noteBox.appendChild(noteLabel);

  if (hasNote) {
    const noteContent = document.createElement("div");
    noteContent.textContent = noteText;
    noteContent.style.fontSize = "11px";
    noteContent.style.lineHeight = "1.38";
    noteContent.style.color = "#78350f";
    noteContent.style.wordBreak = "break-word";
    noteContent.style.whiteSpace = "pre-wrap";
    noteBox.appendChild(noteContent);
  }

  wrapper.appendChild(noteBox);

  const subtitleText = getPointSubtitle(pointData);
  if (subtitleText) {
    const subtitle = document.createElement("div");
    subtitle.textContent = subtitleText;
    subtitle.style.fontSize = "11px";
    subtitle.style.lineHeight = "1.35";
    subtitle.style.color = "#64748b";
    subtitle.style.wordBreak = "break-word";
    subtitle.style.marginBottom = "10px";
    wrapper.appendChild(subtitle);
  }

  if (pointData?.type !== "start" && pointData?.type !== "end") {
    const paletteLabel = document.createElement("div");
    paletteLabel.textContent = "İşaret rengi";
    paletteLabel.style.fontSize = "11px";
    paletteLabel.style.fontWeight = "700";
    paletteLabel.style.color = "#334155";
    paletteLabel.style.marginBottom = "8px";
    wrapper.appendChild(paletteLabel);

    const palette = document.createElement("div");
    palette.style.display = "grid";
    palette.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
    palette.style.gap = "8px";
    palette.style.marginBottom = "12px";

    POINT_COLORS.forEach((item) => {
      const colorBtn = document.createElement("button");
      colorBtn.type = "button";
      colorBtn.setAttribute("aria-label", item.label);
      colorBtn.title = item.label;
      colorBtn.style.height = "32px";
      colorBtn.style.borderRadius = "12px";
      colorBtn.style.border =
        String(pointData.color || "#dc2626").toLowerCase() === item.value.toLowerCase()
          ? "2px solid #0f172a"
          : "1px solid rgba(203, 213, 225, 0.95)";
      colorBtn.style.background = "#ffffff";
      colorBtn.style.display = "inline-flex";
      colorBtn.style.alignItems = "center";
      colorBtn.style.justifyContent = "center";
      colorBtn.style.cursor = "pointer";
      colorBtn.style.padding = "0";

      const swatch = document.createElement("span");
      swatch.style.width = "16px";
      swatch.style.height = "16px";
      swatch.style.borderRadius = "999px";
      swatch.style.display = "block";
      swatch.style.background = item.value;
      swatch.style.boxShadow = "inset 0 0 0 2px rgba(255,255,255,0.68)";

      colorBtn.appendChild(swatch);
      colorBtn.addEventListener("click", () => {
        dispatchMarkerColorRequest(pointData, item.value);
        activeInfoWindow?.close();
      });

      palette.appendChild(colorBtn);
    });

    wrapper.appendChild(palette);
  }

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.alignItems = "stretch";

  const directionsBtn = document.createElement("button");
  directionsBtn.type = "button";
  directionsBtn.textContent = "Yol Tarifi Al";
  directionsBtn.style.flex = "1";
  directionsBtn.style.height = "38px";
  directionsBtn.style.border = "none";
  directionsBtn.style.borderRadius = "12px";
  directionsBtn.style.background = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
  directionsBtn.style.color = "#ffffff";
  directionsBtn.style.fontSize = "12px";
  directionsBtn.style.fontWeight = "700";
  directionsBtn.style.cursor = "pointer";
  directionsBtn.style.boxShadow = "0 8px 18px rgba(37, 99, 235, 0.24)";
  directionsBtn.style.whiteSpace = "nowrap";

  directionsBtn.addEventListener("click", () => {
    const url = createGoogleMapsDirectionsUrl(pointData.lat, pointData.lng);
    window.location.href = url;
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "Sil";
  deleteBtn.style.height = "38px";
  deleteBtn.style.padding = "0 14px";
  deleteBtn.style.border = "1px solid #fecaca";
  deleteBtn.style.borderRadius = "12px";
  deleteBtn.style.background = "#fef2f2";
  deleteBtn.style.color = "#b91c1c";
  deleteBtn.style.fontSize = "12px";
  deleteBtn.style.fontWeight = "700";
  deleteBtn.style.cursor = "pointer";
  deleteBtn.style.whiteSpace = "nowrap";

  deleteBtn.addEventListener("click", () => {
    dispatchMarkerDeleteRequest(pointData);
    activeInfoWindow?.close();
  });

  actions.appendChild(directionsBtn);
  actions.appendChild(deleteBtn);
  wrapper.appendChild(actions);

  return wrapper;
}

function styleNativeInfoWindowShell() {
  const iwOuter = document.querySelector(".gm-style .gm-style-iw");
  if (iwOuter) {
    iwOuter.style.padding = "0";
    iwOuter.style.maxWidth = "none";
    iwOuter.style.maxHeight = "none";
  }

  const iwContainer = document.querySelector(".gm-style .gm-style-iw-c");
  if (iwContainer) {
    iwContainer.style.padding = "0";
    iwContainer.style.maxWidth = "none";
    iwContainer.style.maxHeight = "none";
    iwContainer.style.borderRadius = "0";
    iwContainer.style.boxShadow = "none";
    iwContainer.style.overflow = "visible";
    iwContainer.style.background = "transparent";
  }

  const iwContent = document.querySelector(".gm-style .gm-style-iw-d");
  if (iwContent) {
    iwContent.style.padding = "0";
    iwContent.style.overflow = "visible";
    iwContent.style.maxHeight = "none";
    iwContent.style.maxWidth = "none";
  }

  const nativeCloseButtons = document.querySelectorAll(
    ".gm-style .gm-ui-hover-effect, .gm-style button[aria-label='Close']"
  );

  nativeCloseButtons.forEach((btn) => {
    btn.style.display = "none";
    btn.style.opacity = "0";
    btn.style.pointerEvents = "none";
  });
}

function openMarkerInfo(marker, pointData) {
  if (!map || !marker || !activeInfoWindow || !pointData) return;

  activeInfoWindow.close();
  google.maps.event.clearListeners(activeInfoWindow, "domready");

  activeInfoWindow.setContent(createInfoWindowContent(pointData));
  activeInfoWindow.setOptions({
    maxWidth: 248,
    pixelOffset: new google.maps.Size(0, -8),
    zIndex: 9999,
    disableAutoPan: false
  });

  activeInfoWindow.open({
    anchor: marker,
    map,
    shouldFocus: false
  });

  if (typeof activeInfoWindow.setZIndex === "function") {
    activeInfoWindow.setZIndex(9999);
  }

  google.maps.event.addListenerOnce(activeInfoWindow, "domready", () => {
    styleNativeInfoWindowShell();
  });
}

function openInfoForPoint(pointData) {
  if (!map || !pointData) return false;

  if (pointData.type === "start" && startMarker?.__pointData) {
    const startIdMatch =
      pointData.id != null &&
      startMarker.__pointData.id != null &&
      String(startMarker.__pointData.id) === String(pointData.id);

    const startCoordMatch =
      Number(startMarker.__pointData.lat) === Number(pointData.lat) &&
      Number(startMarker.__pointData.lng) === Number(pointData.lng);

    if (startIdMatch || startCoordMatch) {
      openMarkerInfo(startMarker, startMarker.__pointData);
      return true;
    }
  }

  if (pointData.type === "end" && endMarker?.__pointData) {
    const endIdMatch =
      pointData.id != null &&
      endMarker.__pointData.id != null &&
      String(endMarker.__pointData.id) === String(pointData.id);

    const endCoordMatch =
      Number(endMarker.__pointData.lat) === Number(pointData.lat) &&
      Number(endMarker.__pointData.lng) === Number(pointData.lng);

    if (endIdMatch || endCoordMatch) {
      openMarkerInfo(endMarker, endMarker.__pointData);
      return true;
    }
  }

  const matchedMarker = markers.find((marker) => {
    if (!marker?.__pointData) return false;

    const markerData = marker.__pointData;

    const idMatch =
      pointData.id != null &&
      markerData.id != null &&
      String(markerData.id) === String(pointData.id);

    const coordMatch =
      Number(markerData.lat) === Number(pointData.lat) &&
      Number(markerData.lng) === Number(pointData.lng);

    return idMatch || coordMatch;
  });

  if (!matchedMarker) return false;

  openMarkerInfo(matchedMarker, matchedMarker.__pointData);
  return true;
}

function addMarker({ lat, lng, title, label, onClick, pointData }) {
  if (!map) return null;

  const markerColor = pointData?.color || "#dc2626";

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
    icon: createCircleSymbol(markerColor, "#ffffff", 14)
  });

  marker.__pointData = pointData || null;

  marker.addListener("click", () => {
    handleMarkerClickFocus(marker);

    window.setTimeout(() => {
      openMarkerInfo(marker, marker.__pointData);
    }, 360);

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
    icon: createCircleSymbol("#16a34a", "#ffffff", 16)
  });

  startMarker.__pointData = pointData || null;

  startMarker.addListener("click", () => {
    handleMarkerClickFocus(startMarker);

    window.setTimeout(() => {
      openMarkerInfo(startMarker, startMarker.__pointData);
    }, 360);

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

function showEndMarker({ lat, lng, title, onClick, pointData }) {
  if (!map) return null;

  if (endMarker) {
    endMarker.setMap(null);
  }

  endMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title: title || "Bitiş Noktası",
    label: {
      text: "E",
      color: "#ffffff",
      fontWeight: "700"
    },
    icon: createCircleSymbol("#f97316", "#ffffff", 16)
  });

  endMarker.__pointData = pointData || null;

  endMarker.addListener("click", () => {
    handleMarkerClickFocus(endMarker);

    window.setTimeout(() => {
      openMarkerInfo(endMarker, endMarker.__pointData);
    }, 360);

    if (typeof onClick === "function") {
      onClick(endMarker.__pointData);
    }
  });

  return endMarker;
}

function clearEndMarker() {
  if (endMarker) {
    endMarker.setMap(null);
    endMarker = null;
  }
}

function focusToLocation(lat, lng, zoom = 15) {
  if (!map) return;

  cancelSmoothZoom();

  const normalizedLat = Number(lat);
  const normalizedLng = Number(lng);

  if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng)) return;

  map.setCenter({
    lat: normalizedLat,
    lng: normalizedLng
  });

  map.setZoom(zoom);
}

function resetPageZoomAfterSearch() {
  if (!searchInputEl) return;

  searchInputEl.blur();

  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (!viewportMeta) return;

  const originalContent = viewportMeta.getAttribute("content") || "";

  viewportMeta.setAttribute(
    "content",
    "width=device-width, initial-scale=1, maximum-scale=1"
  );

  window.setTimeout(() => {
    viewportMeta.setAttribute("content", originalContent);
  }, 250);
}

function focusMapToPoints(startPoint, points = [], endPoint = null) {
  if (!map) return;

  cancelSmoothZoom();

  const validPoints = [];

  if (startPoint && Number.isFinite(startPoint.lat) && Number.isFinite(startPoint.lng)) {
    validPoints.push({
      lat: Number(startPoint.lat),
      lng: Number(startPoint.lng)
    });
  }

  points.forEach((point) => {
    if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      validPoints.push({
        lat: Number(point.lat),
        lng: Number(point.lng)
      });
    }
  });

  if (endPoint && Number.isFinite(endPoint.lat) && Number.isFinite(endPoint.lng)) {
    validPoints.push({
      lat: Number(endPoint.lat),
      lng: Number(endPoint.lng)
    });
  }

  if (!validPoints.length) return;

  if (validPoints.length === 1) {
    focusToLocation(validPoints[0].lat, validPoints[0].lng, 15);
    return;
  }

  const bounds = new google.maps.LatLngBounds();

  validPoints.forEach((point) => {
    bounds.extend(point);
  });

  map.fitBounds(bounds, 60);
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
    icon: createCircleSymbol("#2563eb", "#ffffff", 14)
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
    icon: createCircleSymbol("#facc15", "#92400e", 14)
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
      div.style.background = "rgba(255,255,255,0.96)";
      div.style.border = "1px solid rgba(203, 213, 225, 0.95)";
      div.style.borderRadius = "999px";
      div.style.padding = "4px 8px";
      div.style.fontSize = "12px";
      div.style.fontWeight = "700";
      div.style.color = "#0f172a";
      div.style.boxShadow = "0 8px 18px rgba(15,23,42,0.10)";
      div.style.whiteSpace = "nowrap";
      div.style.backdropFilter = "blur(8px)";
      div.style.pointerEvents = "none";
      div.style.zIndex = "20";
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

function drawRouteSegments(startPoint, orderedPoints, endPoint = null) {
  if (!map) return;

  clearRouteLines();

  if (!startPoint) return;

  const routePoints = [startPoint, ...orderedPoints];

  if (endPoint) {
    routePoints.push(endPoint);
  }

  if (routePoints.length < 2) return;

  for (let index = 1; index < routePoints.length; index += 1) {
    const previous = routePoints[index - 1];
    const point = routePoints[index];

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

    const distanceValue = Number(point.distanceFromPrevious) || 0;

    const distanceLabel =
      distanceValue < 1
        ? `${Math.round(distanceValue * 1000)} m`
        : `${Number(distanceValue.toFixed(2)).toString()} km`;

    createDistanceOverlay(
      new google.maps.LatLng(midLat, midLng),
      distanceLabel
    );
  }
}

function enableMapClickPicker(callback) {
  if (!map) return;

  if (mapClickListener) {
    google.maps.event.removeListener(mapClickListener);
  }

  mapClickListener = map.addListener("click", (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

    if (searchMarker) {
      searchMarker.setMap(null);
      searchMarker = null;
    }

    showDraftMarker(lat, lng);
    handleProgressiveMapClickFocus(lat, lng);

    callback({
      lat,
      lng,
      name: "İşaretli Konum"
    });
  });
}

function ensureSearchDropdown(inputElement) {
  if (searchDropdown) return searchDropdown;

  const dropdown = document.createElement("div");
  dropdown.id = "customPlaceSearchDropdown";
  dropdown.style.position = "absolute";
  dropdown.style.top = "calc(100% + 6px)";
  dropdown.style.left = "0";
  dropdown.style.width = "100%";
  dropdown.style.minWidth = "100%";
  dropdown.style.maxWidth = "100%";
  dropdown.style.background = "rgba(255,255,255,0.98)";
  dropdown.style.border = "1px solid rgba(226, 232, 240, 0.98)";
  dropdown.style.borderRadius = "16px";
  dropdown.style.boxShadow = "0 12px 24px rgba(15, 23, 42, 0.12)";
  dropdown.style.backdropFilter = "blur(8px)";
  dropdown.style.padding = "4px";
  dropdown.style.display = "none";
  dropdown.style.zIndex = "30";
  dropdown.style.maxHeight = "196px";
  dropdown.style.overflowY = "auto";
  dropdown.style.overflowX = "hidden";
  dropdown.style.boxSizing = "border-box";

  dropdown.addEventListener("pointerdown", () => {
    isInteractingWithSearchDropdown = true;
  });

  dropdown.addEventListener("pointerup", () => {
    window.setTimeout(() => {
      isInteractingWithSearchDropdown = false;
    }, 0);
  });

  const parent = inputElement.parentElement;
  if (parent) {
    const currentPosition = window.getComputedStyle(parent).position;
    if (currentPosition === "static") {
      parent.style.position = "relative";
    }
    parent.appendChild(dropdown);
  }

  searchDropdown = dropdown;
  return dropdown;
}

function hideSearchDropdown() {
  if (!searchDropdown) return;
  searchDropdown.style.display = "none";
  searchDropdown.innerHTML = "";
  currentPredictions = [];
}

function ensureAutocompleteSessionToken() {
  if (!activeAutocompleteSessionToken) {
    activeAutocompleteSessionToken = new google.maps.places.AutocompleteSessionToken();
  }

  return activeAutocompleteSessionToken;
}

function clearAutocompleteSession() {
  activeAutocompleteSessionToken = null;
}

function renderPredictions(predictions, onPlaceSelected) {
  const dropdown = searchDropdown;
  if (!dropdown) return;

  dropdown.innerHTML = "";
  isInteractingWithSearchDropdown = false;

  if (!predictions.length) {
    dropdown.style.display = "none";
    return;
  }

  predictions.forEach((prediction, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.dataset.placeId = prediction.place_id;
    item.dataset.index = String(index);
    item.style.width = "100%";
    item.style.textAlign = "left";
    item.style.padding = "7px 9px";
    item.style.border = "1px solid transparent";
    item.style.background = "#fff";
    item.style.borderRadius = "9px";
    item.style.display = "block";
    item.style.marginBottom = index === predictions.length - 1 ? "0" : "3px";
    item.style.cursor = "pointer";
    item.style.boxSizing = "border-box";
    item.style.minHeight = "unset";
    item.style.overflow = "hidden";

    const title = document.createElement("div");
    title.textContent =
      prediction.structured_formatting?.main_text || prediction.description;
    title.style.fontWeight = "600";
    title.style.color = "#0f172a";
    title.style.fontSize = "0.88rem";
    title.style.lineHeight = "1.15";
    title.style.margin = "0";
    title.style.whiteSpace = "nowrap";
    title.style.overflow = "hidden";
    title.style.textOverflow = "ellipsis";

    const subtitle = document.createElement("div");
    subtitle.textContent = prediction.structured_formatting?.secondary_text || "";
    subtitle.style.color = "#64748b";
    subtitle.style.fontSize = "0.76rem";
    subtitle.style.lineHeight = "1.1";
    subtitle.style.marginTop = "2px";
    subtitle.style.whiteSpace = "nowrap";
    subtitle.style.overflow = "hidden";
    subtitle.style.textOverflow = "ellipsis";

    item.appendChild(title);
    if (subtitle.textContent) {
      item.appendChild(subtitle);
    }

    item.addEventListener("mouseenter", () => {
      item.style.background = "rgba(37, 99, 235, 0.06)";
      item.style.borderColor = "rgba(37, 99, 235, 0.10)";
    });

    item.addEventListener("mouseleave", () => {
      item.style.background = "#fff";
      item.style.borderColor = "transparent";
    });

    item.addEventListener("click", () => {
      if (!geocoder) {
        geocoder = new google.maps.Geocoder();
      }

      const selectedName =
        prediction.structured_formatting?.main_text ||
        prediction.description ||
        "";

      geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
        if (
          status !== google.maps.GeocoderStatus.OK ||
          !Array.isArray(results) ||
          !results.length ||
          !results[0]?.geometry?.location
        ) {
          return;
        }

        const location = results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();

        clearDraftMarker();

        if (searchMarker) {
          searchMarker.setMap(null);
          searchMarker = null;
        }

        searchMarker = new google.maps.Marker({
          position: { lat, lng },
          map,
          title: selectedName,
          icon: createCircleSymbol("#2563eb", "#ffffff", 13)
        });

        focusToLocation(lat, lng, 16);
        resetPageZoomAfterSearch();

        if (searchInputEl) {
          searchInputEl.value = selectedName;
        }

        hideSearchDropdown();
        clearAutocompleteSession();

        if (typeof onPlaceSelected === "function") {
          onPlaceSelected({
            name: selectedName,
            lat,
            lng
          });
        }
      });
    });

    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

function initPlaceSearch(inputElement, onPlaceSelected) {
  if (!inputElement || !map || !searchService) return;

  searchInputEl = inputElement;
  ensureSearchDropdown(inputElement);

  if (!searchInputHandlerBound) {
    inputElement.addEventListener("input", () => {
      const query = inputElement.value.trim();

      window.clearTimeout(searchDebounceTimer);

      if (query.length < MIN_SEARCH_LENGTH) {
        hideSearchDropdown();
        clearAutocompleteSession();
        return;
      }

      searchDebounceTimer = window.setTimeout(() => {
        const requestId = ++lastPredictionRequestId;
        const sessionToken = ensureAutocompleteSessionToken();

        searchService.getPlacePredictions(
          {
            input: query,
            bounds: map.getBounds() || undefined,
            sessionToken
          },
          (predictions, status) => {
            if (requestId !== lastPredictionRequestId) return;

            if (
              status !== google.maps.places.PlacesServiceStatus.OK ||
              !Array.isArray(predictions) ||
              !predictions.length
            ) {
              hideSearchDropdown();
              return;
            }

            const limitedPredictions = predictions.slice(0, MAX_PREDICTIONS);
            currentPredictions = limitedPredictions;
            renderPredictions(limitedPredictions, onPlaceSelected);
          }
        );
      }, SEARCH_DEBOUNCE_MS);
    });

    searchInputHandlerBound = true;
  }

  if (!searchFocusHandlerBound) {
    inputElement.addEventListener("focus", () => {
      const query = inputElement.value.trim();
      if (query.length >= MIN_SEARCH_LENGTH && currentPredictions.length) {
        searchDropdown.style.display = "block";
      }
    });

    searchFocusHandlerBound = true;
  }

  if (!searchBlurHandlerBound) {
    inputElement.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (isInteractingWithSearchDropdown) return;
        hideSearchDropdown();
        resetPageZoomAfterSearch();
      }, 180);
    });

    searchBlurHandlerBound = true;
  }
}

export {
  initMap,
  getMap,
  addMarker,
  clearMarkers,
  showStartMarker,
  clearStartMarker,
  showEndMarker,
  clearEndMarker,
  focusToLocation,
  focusMapToPoints,
  showCurrentLocationMarker,
  enableMapClickPicker,
  initPlaceSearch,
  clearDraftMarker,
  clearRouteLines,
  drawRouteSegments,
  openInfoForPoint
};
