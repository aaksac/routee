let map;
let markers = [];
let currentLocationMarker = null;
let mapClickListener = null;
let draftMarker = null;
let searchMarker = null;
let startMarker = null;
let routePolylines = [];
let distanceOverlays = [];
let activeInfoWindow = null;
let focusProjectionOverlay = null;

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

function initMap() {
  const mapElement = document.getElementById("mapCanvas");
  if (!mapElement) return null;

  mapElement.innerHTML = "";

  const defaultCenter = { lat: 37.0, lng: 35.3213 };

  map = new google.maps.Map(mapElement, {
    center: defaultCenter,
    zoom: 11,
    backgroundColor: "#f8fafc",
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

  focusProjectionOverlay = new google.maps.OverlayView();
  focusProjectionOverlay.onAdd = function () {};
  focusProjectionOverlay.draw = function () {};
  focusProjectionOverlay.onRemove = function () {};
  focusProjectionOverlay.setMap(map);

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

  const badge = document.createElement("div");
  badge.textContent = pointData?.type === "start" ? "Başlangıç Noktası" : "Konum Bilgisi";
  badge.style.display = "inline-flex";
  badge.style.alignItems = "center";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "700";
  badge.style.letterSpacing = "0.04em";
  badge.style.textTransform = "uppercase";
  badge.style.color = "#1d4ed8";
  badge.style.background = "rgba(37, 99, 235, 0.10)";
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
  title.style.paddingRight = "30px";
  title.style.marginBottom = "8px";

  wrapper.appendChild(closeBtn);
  wrapper.appendChild(badge);
  wrapper.appendChild(title);

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

  if (pointData?.type !== "start") {
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
    icon: createCircleSymbol("#16a34a", "#ffffff", 16)
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

function isElementVisuallyHidden(element) {
  if (!element) return true;

  const styles = window.getComputedStyle(element);
  if (
    styles.display === "none" ||
    styles.visibility === "hidden" ||
    Number(styles.opacity || "1") <= 0.05
  ) {
    return true;
  }

  if (element.classList?.contains("hidden") || element.getAttribute("aria-hidden") === "true") {
    return true;
  }

  const rect = element.getBoundingClientRect();
  return rect.width <= 1 || rect.height <= 1;
}

function getSelectionSafePadding() {
  const mapDiv = map?.getDiv?.();

  if (!mapDiv) {
    return {
      top: 26,
      right: 26,
      bottom: 30,
      left: 26
    };
  }

  const mapRect = mapDiv.getBoundingClientRect();
  const isMobile = window.innerWidth <= 720;

  const padding = {
    top: isMobile ? 72 : 28,
    right: isMobile ? 20 : 28,
    bottom: isMobile ? 116 : 32,
    left: isMobile ? 20 : 28
  };

  const overlaySelectors = [
    ".map-overlay",
    ".new-map-mobile-fab"
  ];

  const overlays = document.querySelectorAll(overlaySelectors.join(", "));
  const EDGE_CAPTURE = 110;

  overlays.forEach((overlay) => {
    if (isElementVisuallyHidden(overlay)) return;

    const rect = overlay.getBoundingClientRect();
    const overlapLeft = Math.max(rect.left, mapRect.left);
    const overlapRight = Math.min(rect.right, mapRect.right);
    const overlapTop = Math.max(rect.top, mapRect.top);
    const overlapBottom = Math.min(rect.bottom, mapRect.bottom);

    const overlapWidth = overlapRight - overlapLeft;
    const overlapHeight = overlapBottom - overlapTop;

    if (overlapWidth <= 0 || overlapHeight <= 0) return;

    if (overlapTop <= mapRect.top + EDGE_CAPTURE) {
      padding.top = Math.max(padding.top, overlapBottom - mapRect.top + 14);
    }

    if (overlapBottom >= mapRect.bottom - EDGE_CAPTURE) {
      padding.bottom = Math.max(padding.bottom, mapRect.bottom - overlapTop + 16);
    }

    if (overlapLeft <= mapRect.left + EDGE_CAPTURE) {
      padding.left = Math.max(padding.left, overlapRight - mapRect.left + 14);
    }

    if (overlapRight >= mapRect.right - EDGE_CAPTURE) {
      padding.right = Math.max(padding.right, mapRect.right - overlapLeft + 14);
    }
  });

  return padding;
}

function getMarkerContainerPoint(lat, lng) {
  if (!map) return;

  const projection = focusProjectionOverlay?.getProjection?.();
  if (!projection) return null;

  const pixel = projection.fromLatLngToContainerPixel(new google.maps.LatLng(lat, lng));
  if (!pixel) return null;

  return {
    x: pixel.x,
    y: pixel.y
  };
}

function focusMapForPickedLocation(lat, lng) {
  if (!map) return;

  const target = { lat, lng };
  const mapDiv = map.getDiv();
  const isDesktop = window.innerWidth > 720;

  if (!mapDiv) {
    map.panTo(target);
    return;
  }

  const targetZoom = 18;
  const maxZoomDeltaPerSelection = 4;
  const currentZoom = Number(map.getZoom()) || 0;
  const stagedTargetZoom = Math.min(targetZoom, currentZoom + maxZoomDeltaPerSelection);
  const shouldZoomIn = currentZoom < stagedTargetZoom;

  const padding = getSelectionSafePadding();
  const safeRect = {
    left: padding.left,
    right: mapDiv.clientWidth - padding.right,
    top: padding.top,
    bottom: mapDiv.clientHeight - padding.bottom
  };

  const desiredX = isDesktop ? mapDiv.clientWidth / 2 : (safeRect.left + safeRect.right) / 2;
  const desiredY = (safeRect.top + safeRect.bottom) / 2;
  const COMFORT_TOLERANCE_PX = 42;

  const placeMarkerToComfortZone = (force = false) => {
    const markerPixel = getMarkerContainerPoint(lat, lng);
    if (!markerPixel) return;

    const isInSafeRect =
      markerPixel.x >= safeRect.left &&
      markerPixel.x <= safeRect.right &&
      markerPixel.y >= safeRect.top &&
      markerPixel.y <= safeRect.bottom;

    const deltaX = desiredX - markerPixel.x;
    const deltaY = desiredY - markerPixel.y;
    const appliedDeltaX = isDesktop ? 0 : deltaX;
    const needsComfortPan =
      Math.abs(appliedDeltaX) > COMFORT_TOLERANCE_PX || Math.abs(deltaY) > COMFORT_TOLERANCE_PX;

    if (!force && isInSafeRect && !needsComfortPan) {
      return;
    }

    map.panBy(appliedDeltaX, deltaY);
  };

  map.panTo(target);

  window.setTimeout(() => {
    if (shouldZoomIn) {
      smoothZoomIn(stagedTargetZoom, () => placeMarkerToComfortZone(true));
      return;
    }

    placeMarkerToComfortZone(false);
  }, 120);
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

function focusMapToPoints(startPoint, points = []) {
  if (!map) return;

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

  focusMapForPickedLocation(lat, lng);
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

    const distanceLabel =
      point.distanceFromPrevious < 1
        ? `${Math.round(point.distanceFromPrevious * 1000)} m`
        : `${Number(point.distanceFromPrevious.toFixed(2)).toString()} km`;

    createDistanceOverlay(
      new google.maps.LatLng(midLat, midLng),
      distanceLabel
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
