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

function addMarker(pointData) {
  if (!map || !pointData) return null;

  const marker = new google.maps.Marker({
    map,
    position: { lat: Number(pointData.lat), lng: Number(pointData.lng) },
    title: pointData.name || "Nokta",
    optimized: true,
    icon: createCircleSymbol("#2563eb")
  });

  marker.__pointData = pointData;
  marker.addListener("click", () => openMarkerInfo(marker, marker.__pointData));

  markers.push(marker);
  return marker;
}

function clearMarkers() {
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
}

function showStartMarker(pointData) {
  if (!map || !pointData) return null;

  removeStartMarker();

  startMarker = new google.maps.Marker({
    map,
    position: { lat: Number(pointData.lat), lng: Number(pointData.lng) },
    title: pointData.name || "Başlangıç",
    optimized: true,
    icon: createCircleSymbol("#16a34a")
  });

  startMarker.__pointData = pointData;
  startMarker.addListener("click", () => openMarkerInfo(startMarker, startMarker.__pointData));

  return startMarker;
}

function removeStartMarker() {
  if (startMarker) {
    startMarker.setMap(null);
    startMarker = null;
  }
}

function showCurrentLocationMarker(location) {
  if (!map || !location) return null;

  clearCurrentLocationMarker();

  currentLocationMarker = new google.maps.Marker({
    map,
    position: { lat: Number(location.lat), lng: Number(location.lng) },
    title: "Mevcut Konum",
    optimized: true,
    icon: createCircleSymbol("#f97316")
  });

  return currentLocationMarker;
}

function clearCurrentLocationMarker() {
  if (currentLocationMarker) {
    currentLocationMarker.setMap(null);
    currentLocationMarker = null;
  }
}

function clearDraftMarker() {
  if (draftMarker) {
    draftMarker.setMap(null);
    draftMarker = null;
  }
}

function showDraftMarker(point) {
  if (!map || !point) return null;

  clearDraftMarker();

  draftMarker = new google.maps.Marker({
    map,
    position: { lat: Number(point.lat), lng: Number(point.lng) },
    title: point.name || "Seçilen Konum",
    optimized: true,
    icon: createCircleSymbol("#0f172a", "#ffffff", 8)
  });

  return draftMarker;
}

function clearSearchMarker() {
  if (searchMarker) {
    searchMarker.setMap(null);
    searchMarker = null;
  }
}

function showSearchMarker(point) {
  if (!map || !point) return null;

  clearSearchMarker();

  searchMarker = new google.maps.Marker({
    map,
    position: { lat: Number(point.lat), lng: Number(point.lng) },
    title: point.name || "Arama Sonucu",
    optimized: true,
    icon: createCircleSymbol("#7c3aed", "#ffffff", 9)
  });

  return searchMarker;
}

function createSelectionFromLatLng(latLng) {
  const lat = Number(latLng.lat());
  const lng = Number(latLng.lng());

  return {
    name: "İşaretli konum",
    address: "",
    lat,
    lng
  };
}

function bindMapClickForSelection(onSelected) {
  if (!map) return;

  if (mapClickListener) {
    google.maps.event.removeListener(mapClickListener);
    mapClickListener = null;
  }

  mapClickListener = map.addListener("click", (event) => {
    const selection = createSelectionFromLatLng(event.latLng);
    showDraftMarker(selection);
    onSelected?.(selection);
  });
}

function fitMapToPoints(startPoint, points = []) {
  if (!map) return;

  const bounds = new google.maps.LatLngBounds();

  if (startPoint) {
    bounds.extend({ lat: Number(startPoint.lat), lng: Number(startPoint.lng) });
  }

  points.forEach((point) => {
    bounds.extend({ lat: Number(point.lat), lng: Number(point.lng) });
  });

  if (bounds.isEmpty()) return;

  map.fitBounds(bounds, 60);
}

function clearRouteLines() {
  routePolylines.forEach((line) => line.setMap(null));
  distanceOverlays.forEach((overlay) => overlay.setMap(null));
  routePolylines = [];
  distanceOverlays = [];
}

function createDistanceOverlay(mapInstance, position, text) {
  class DistanceOverlay extends google.maps.OverlayView {
    constructor(pos, labelText) {
      super();
      this.position = pos;
      this.labelText = labelText;
      this.div = null;
    }

    onAdd() {
      const div = document.createElement("div");
      div.className = "distance-overlay";
      div.style.position = "absolute";
      div.style.transform = "translate(-50%, -50%)";
      div.style.padding = "4px 8px";
      div.style.borderRadius = "999px";
      div.style.background = "rgba(15, 23, 42, 0.88)";
      div.style.color = "#ffffff";
      div.style.fontSize = "11px";
      div.style.fontWeight = "700";
      div.style.lineHeight = "1";
      div.style.whiteSpace = "nowrap";
      div.style.boxShadow = "0 8px 18px rgba(15, 23, 42, 0.18)";
      div.style.pointerEvents = "none";
      div.textContent = this.labelText;
      this.div = div;

      const panes = this.getPanes();
      panes?.overlayMouseTarget.appendChild(div);
    }

    draw() {
      if (!this.div) return;
      const projection = this.getProjection();
      if (!projection) return;

      const pixel = projection.fromLatLngToDivPixel(this.position);
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

  const overlay = new DistanceOverlay(position, text);
  overlay.setMap(mapInstance);
  return overlay;
}

function drawRouteSegments(startPoint, orderedPoints, routeLegs = []) {
  if (!map) return;
  clearRouteLines();

  if (!startPoint || !Array.isArray(orderedPoints) || !orderedPoints.length) return;

  let previous = startPoint;

  orderedPoints.forEach((point, index) => {
    const line = new google.maps.Polyline({
      map,
      path: [
        { lat: Number(previous.lat), lng: Number(previous.lng) },
        { lat: Number(point.lat), lng: Number(point.lng) }
      ],
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.9,
      strokeWeight: 3
    });

    routePolylines.push(line);

    const midLat = (Number(previous.lat) + Number(point.lat)) / 2;
    const midLng = (Number(previous.lng) + Number(point.lng)) / 2;
    const leg = routeLegs[index];
    const overlay = createDistanceOverlay(
      map,
      new google.maps.LatLng(midLat, midLng),
      leg ? `${formatDistance(leg.distanceKm)} km` : "—"
    );
    distanceOverlays.push(overlay);

    previous = point;
  });
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

function getOrCreateSearchDropdown() {
  if (searchDropdown) return searchDropdown;
  if (!searchInputEl || !searchInputEl.parentElement) return null;

  const dropdown = document.createElement("div");
  dropdown.className = "search-dropdown";
  dropdown.style.position = "absolute";
  dropdown.style.top = `${searchInputEl.offsetHeight + 8}px`;
  dropdown.style.left = "0";
  dropdown.style.right = "0";
  dropdown.style.display = "none";
  searchInputEl.parentElement.style.position = "relative";
  searchInputEl.parentElement.appendChild(dropdown);

  searchDropdown = dropdown;
  return searchDropdown;
}

function hideSearchDropdown() {
  if (!searchDropdown) return;
  searchDropdown.style.display = "none";
  searchDropdown.innerHTML = "";
}

function renderPredictions(predictions, onSelect) {
  const dropdown = getOrCreateSearchDropdown();
  if (!dropdown) return;

  dropdown.innerHTML = "";

  if (!predictions.length) {
    hideSearchDropdown();
    return;
  }

  predictions.forEach((prediction) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "search-dropdown-item";
    item.textContent = prediction.description;
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      onSelect(prediction);
    });
    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

function normalizePrediction(prediction) {
  return {
    placeId: prediction.place_id,
    description: prediction.description,
    mainText: prediction.structured_formatting?.main_text || prediction.description,
    secondaryText: prediction.structured_formatting?.secondary_text || ""
  };
}

function createPredictionCacheKey(input) {
  return input.trim().toLowerCase();
}

function setPredictionCache(key, value) {
  if (predictionCache.has(key)) {
    predictionCache.delete(key);
  }
  predictionCache.set(key, value);

  if (predictionCache.size > MAX_CACHE_SIZE) {
    const oldestKey = predictionCache.keys().next().value;
    predictionCache.delete(oldestKey);
  }
}

function getPredictionCache(key) {
  if (!predictionCache.has(key)) return null;
  const value = predictionCache.get(key);
  predictionCache.delete(key);
  predictionCache.set(key, value);
  return value;
}

function getAutocompleteToken() {
  if (!activeAutocompleteSessionToken) {
    activeAutocompleteSessionToken = new google.maps.places.AutocompleteSessionToken();
  }
  return activeAutocompleteSessionToken;
}

function resetAutocompleteToken() {
  activeAutocompleteSessionToken = null;
}

function fetchPredictions(input, callback) {
  if (!searchService) {
    callback([]);
    return;
  }

  const normalizedInput = input.trim();
  if (normalizedInput.length < MIN_SEARCH_LENGTH) {
    callback([]);
    return;
  }

  const cacheKey = createPredictionCacheKey(normalizedInput);
  const cached = getPredictionCache(cacheKey);
  if (cached) {
    callback(cached);
    return;
  }

  const requestId = ++lastPredictionRequestId;

  searchService.getPlacePredictions(
    {
      input: normalizedInput,
      sessionToken: getAutocompleteToken()
    },
    (predictions, status) => {
      if (requestId !== lastPredictionRequestId) return;

      if (status !== google.maps.places.PlacesServiceStatus.OK || !Array.isArray(predictions)) {
        callback([]);
        return;
      }

      const normalized = predictions.slice(0, MAX_PREDICTIONS).map(normalizePrediction);
      setPredictionCache(cacheKey, normalized);
      callback(normalized);
    }
  );
}

function getPlaceDetails(placeId, callback) {
  if (!placesService || !placeId) {
    callback(null);
    return;
  }

  placesService.getDetails(
    {
      placeId,
      fields: ["name", "formatted_address", "geometry"],
      sessionToken: getAutocompleteToken()
    },
    (place, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
        callback(null);
        return;
      }

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      callback({
        name: place.name || place.formatted_address || "Seçilen konum",
        address: place.formatted_address || "",
        lat,
        lng
      });
    }
  );
}

function focusMapOnSelection(selection) {
  if (!map || !selection) return;

  const target = { lat: Number(selection.lat), lng: Number(selection.lng) };
  map.panTo(target);
  map.setZoom(15);
}

function ensureSearchAutocomplete(inputElement, onSelected) {
  searchInputEl = inputElement;
  if (!searchInputEl) return;

  getOrCreateSearchDropdown();

  if (!searchInputHandlerBound) {
    searchInputEl.addEventListener("input", () => {
      const query = searchInputEl.value.trim();

      window.clearTimeout(searchDebounceTimer);

      if (query.length < MIN_SEARCH_LENGTH) {
        currentPredictions = [];
        hideSearchDropdown();
        return;
      }

      searchDebounceTimer = window.setTimeout(() => {
        fetchPredictions(query, (predictions) => {
          currentPredictions = predictions;
          renderPredictions(predictions, (prediction) => {
            searchInputEl.value = prediction.description;
            hideSearchDropdown();

            getPlaceDetails(prediction.placeId, (selection) => {
              if (!selection) return;

              resetAutocompleteToken();
              showSearchMarker(selection);
              focusMapOnSelection(selection);
              onSelected?.(selection);
            });
          });
        });
      }, SEARCH_DEBOUNCE_MS);
    });

    searchInputHandlerBound = true;
  }

  if (!searchFocusHandlerBound) {
    searchInputEl.addEventListener("focus", () => {
      const query = searchInputEl.value.trim();
      if (query.length >= MIN_SEARCH_LENGTH && currentPredictions.length) {
        renderPredictions(currentPredictions, (prediction) => {
          searchInputEl.value = prediction.description;
          hideSearchDropdown();

          getPlaceDetails(prediction.placeId, (selection) => {
            if (!selection) return;

            resetAutocompleteToken();
            showSearchMarker(selection);
            focusMapOnSelection(selection);
            onSelected?.(selection);
          });
        });
      }
    });

    searchFocusHandlerBound = true;
  }

  if (!searchBlurHandlerBound) {
    inputElement.addEventListener("blur", () => {
      window.setTimeout(() => {
        hideSearchDropdown();
      }, 180);
    });

    searchBlurHandlerBound = true;
  }

  if (!searchSelectHandlerBound) {
    document.addEventListener("click", (event) => {
      if (!searchDropdown || !searchInputEl) return;

      const clickedInsideDropdown = searchDropdown.contains(event.target);
      const clickedInput = searchInputEl === event.target;

      if (!clickedInsideDropdown && !clickedInput) {
        hideSearchDropdown();
      }
    });

    searchSelectHandlerBound = true;
  }
}

export {
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
};
