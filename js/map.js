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

let searchService = null;
let placesService = null;
let searchDropdown = null;
let searchInputEl = null;
let searchSelectHandlerBound = false;
let searchInputHandlerBound = false;
let searchBlurHandlerBound = false;
let searchFocusHandlerBound = false;
let lastPredictionRequestId = 0;
let currentPredictions = [];

let activeAutocompleteSessionToken = null;
let searchDebounceTimer = null;
const predictionCache = new Map();
const MAX_CACHE_SIZE = 50;
const MIN_SEARCH_LENGTH = 4;
const SEARCH_DEBOUNCE_MS = 450;
const MAX_PREDICTIONS = 5;

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
    fullscreenControl: false,
    gestureHandling: "greedy"
  });

  activeInfoWindow = new google.maps.InfoWindow({
    ariaLabel: "Konum Bilgisi"
  });

  placesService = new google.maps.places.PlacesService(map);
  searchService = new google.maps.places.AutocompleteService();

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

function getPointSubtitle(pointData) {
  if (!pointData) return "";

  const raw =
    pointData.address ||
    pointData.formatted_address ||
    pointData.description ||
    "";

  if (!raw) return "";

  return String(raw).trim();
}

function createInfoWindowContent(pointData) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "210px";
  wrapper.style.maxWidth = "210px";
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

  const button = document.createElement("button");
  button.textContent = "Yol Tarifi Al";
  button.style.width = "100%";
  button.style.height = "38px";
  button.style.border = "none";
  button.style.borderRadius = "12px";
  button.style.background = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
  button.style.color = "#ffffff";
  button.style.fontSize = "12px";
  button.style.fontWeight = "700";
  button.style.cursor = "pointer";
  button.style.boxShadow = "0 8px 18px rgba(37, 99, 235, 0.24)";

  button.addEventListener("click", () => {
    const url = createGoogleMapsDirectionsUrl(pointData.lat, pointData.lng);
    window.location.href = url;
  });

  wrapper.appendChild(button);
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
    maxWidth: 240,
    pixelOffset: new google.maps.Size(0, -8),
    zIndex: 9999,
    disableAutoPan: false
  });

  activeInfoWindow.open({
    anchor: marker,
    map,
    shouldFocus: false
  });

  google.maps.event.addListenerOnce(activeInfoWindow, "domready", () => {
    styleNativeInfoWindowShell();
  });
}

function addMarker(pointData, options = {}) {
  if (!map || !pointData) return null;

  const marker = new google.maps.Marker({
    map,
    position: { lat: Number(pointData.lat), lng: Number(pointData.lng) },
    title: pointData.name || "Nokta",
    optimized: true,
    label: options.orderLabel
      ? {
          text: String(options.orderLabel),
          color: "#ffffff",
          fontWeight: "700",
          fontSize: "12px"
        }
      : undefined,
    icon: createCircleSymbol("#2563eb")
  });

  marker.__pointData = pointData;

  marker.addListener("click", () => {
    openMarkerInfo(marker, marker.__pointData);
    if (typeof options.onClick === "function") {
      options.onClick(marker.__pointData);
    }
  });

  markers.push(marker);
  return marker;
}

function clearMarkers() {
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
}

function showStartMarker(pointData, options = {}) {
  if (!map || !pointData) return null;

  clearStartMarker();

  startMarker = new google.maps.Marker({
    map,
    position: { lat: Number(pointData.lat), lng: Number(pointData.lng) },
    title: pointData.name || "Başlangıç",
    optimized: true,
    label: {
      text: "S",
      color: "#ffffff",
      fontWeight: "700",
      fontSize: "12px"
    },
    icon: createCircleSymbol("#16a34a")
  });

  startMarker.__pointData = pointData;

  startMarker.addListener("click", () => {
    openMarkerInfo(startMarker, startMarker.__pointData);
    if (typeof options.onClick === "function") {
      options.onClick(startMarker.__pointData);
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

function resetPageZoomAfterSearch() {
  if (!searchInputEl) return;
  searchInputEl.blur();
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
    focusToLocation(validPoints[0].lat, validPoints[0].lng, 14);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  validPoints.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, 80);
}

function clearCurrentLocationMarker() {
  if (currentLocationMarker) {
    currentLocationMarker.setMap(null);
    currentLocationMarker = null;
  }
}

function showCurrentLocationMarker(locationData) {
  if (!map || !locationData) return null;

  clearCurrentLocationMarker();

  currentLocationMarker = new google.maps.Marker({
    position: { lat: Number(locationData.lat), lng: Number(locationData.lng) },
    map,
    title: locationData.name || "Mevcut Konum",
    icon: createCircleSymbol("#f97316", "#ffffff", 9)
  });

  return currentLocationMarker;
}

function clearDraftMarker() {
  if (draftMarker) {
    draftMarker.setMap(null);
    draftMarker = null;
  }
}

function showDraftMarker(lat, lng, title = "Seçilen Nokta") {
  clearDraftMarker();

  draftMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title,
    icon: createCircleSymbol("#0f172a", "#ffffff", 8)
  });

  return draftMarker;
}

function enableMapClickPicker(onMapPicked) {
  if (!map) return;

  if (mapClickListener) {
    google.maps.event.removeListener(mapClickListener);
  }

  mapClickListener = map.addListener("click", (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

    showDraftMarker(lat, lng, "İşaretli Konum");

    if (typeof onMapPicked === "function") {
      onMapPicked({
        lat,
        lng,
        name: "İşaretli konum"
      });
    }
  });
}

function clearRouteLines() {
  routePolylines.forEach((polyline) => polyline.setMap(null));
  distanceOverlays.forEach((overlay) => overlay.setMap(null));
  routePolylines = [];
  distanceOverlays = [];
}

function createDistanceOverlay(position, text) {
  class DistanceOverlay extends google.maps.OverlayView {
    constructor() {
      super();
      this.div = null;
    }

    onAdd() {
      const div = document.createElement("div");
      div.className = "distance-overlay";
      div.textContent = text;
      this.div = div;

      const panes = this.getPanes();
      panes?.overlayLayer.appendChild(div);
    }

    draw() {
      if (!this.div) return;
      const projection = this.getProjection();
      if (!projection) return;

      const pixel = projection.fromLatLngToDivPixel(position);
      if (!pixel) return;

      this.div.style.left = `${pixel.x}px`;
      this.div.style.top = `${pixel.y}px`;
    }

    onRemove() {
      if (this.div?.parentNode) {
        this.div.parentNode.removeChild(this.div);
      }
      this.div = null;
    }
  }

  const overlay = new DistanceOverlay();
  overlay.setMap(map);
  distanceOverlays.push(overlay);
}

function drawRouteSegments(startPoint, points) {
  clearRouteLines();

  if (!map || !startPoint || !points.length) return;

  let previous = {
    lat: Number(startPoint.lat),
    lng: Number(startPoint.lng)
  };

  points.forEach((point) => {
    const current = {
      lat: Number(point.lat),
      lng: Number(point.lng)
    };

    const polyline = new google.maps.Polyline({
      map,
      path: [previous, current],
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.85,
      strokeWeight: 3
    });

    routePolylines.push(polyline);

    const midPoint = new google.maps.LatLng(
      (previous.lat + current.lat) / 2,
      (previous.lng + current.lng) / 2
    );

    if (Number(point.distanceFromPrevious || 0) > 0) {
      createDistanceOverlay(midPoint, formatDistance(point.distanceFromPrevious));
    }

    previous = current;
  });
}

function formatDistance(distanceKm) {
  const value = Number(distanceKm) || 0;

  if (value < 1) {
    return `${Math.round(value * 1000)} m`;
  }

  return `${Number(value.toFixed(2)).toString()} km`;
}

function ensureSearchDropdown(inputElement) {
  if (searchDropdown) return searchDropdown;

  const dropdown = document.createElement("div");
  dropdown.className = "search-dropdown";
  inputElement.parentElement?.appendChild(dropdown);
  searchDropdown = dropdown;
  return dropdown;
}

function hideSearchDropdown() {
  if (!searchDropdown) return;
  searchDropdown.innerHTML = "";
  searchDropdown.style.display = "none";
}

function getNormalizedSearchKey(query) {
  return String(query || "").trim().toLowerCase();
}

function getPredictionCache(cacheKey) {
  if (!predictionCache.has(cacheKey)) return null;

  const cachedValue = predictionCache.get(cacheKey);
  predictionCache.delete(cacheKey);
  predictionCache.set(cacheKey, cachedValue);
  return cachedValue;
}

function setPredictionCache(cacheKey, predictions) {
  if (predictionCache.has(cacheKey)) {
    predictionCache.delete(cacheKey);
  }

  predictionCache.set(cacheKey, predictions);

  if (predictionCache.size > MAX_CACHE_SIZE) {
    const oldestKey = predictionCache.keys().next().value;
    predictionCache.delete(oldestKey);
  }
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
  if (!searchDropdown) return;

  const dropdown = searchDropdown;
  dropdown.innerHTML = "";

  predictions.forEach((prediction) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "search-dropdown-item";
    item.innerHTML = `
      <strong>${prediction.structured_formatting?.main_text || prediction.description}</strong>
      <span>${prediction.structured_formatting?.secondary_text || ""}</span>
    `;

    item.addEventListener("click", () => {
      const placeId = prediction.place_id;
      const sessionToken = ensureAutocompleteSessionToken();

      placesService.getDetails(
        {
          placeId,
          fields: ["name", "formatted_address", "geometry"],
          sessionToken
        },
        (place, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !place?.geometry?.location
          ) {
            return;
          }

          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          if (searchMarker) {
            searchMarker.setMap(null);
            searchMarker = null;
          }

          searchMarker = new google.maps.Marker({
            position: { lat, lng },
            map,
            title: place.name || prediction.description,
            icon: createCircleSymbol("#2563eb", "#ffffff", 9)
          });

          focusToLocation(lat, lng, 16);
          resetPageZoomAfterSearch();

          if (searchInputEl) {
            searchInputEl.value = place.name || prediction.description;
          }

          hideSearchDropdown();
          clearAutocompleteSession();

          if (typeof onPlaceSelected === "function") {
            onPlaceSelected({
              name: place.name || prediction.description,
              address: place.formatted_address || "",
              lat,
              lng
            });
          }
        }
      );
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

      const cacheKey = getNormalizedSearchKey(query);
      const cachedPredictions = getPredictionCache(cacheKey);

      if (cachedPredictions) {
        currentPredictions = cachedPredictions;
        renderPredictions(cachedPredictions, onPlaceSelected);
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
            setPredictionCache(cacheKey, limitedPredictions);
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
  drawRouteSegments
};
