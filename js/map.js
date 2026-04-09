// js/map.js
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

let PlaceCtor = null;
let PlacesServiceCtor = null;
let AutocompleteSessionTokenCtor = null;
let AutocompleteSuggestionClass = null;
let searchDropdown = null;
let searchInputEl = null;
let searchSelectHandlerBound = false;
let searchInputHandlerBound = false;
let searchBlurHandlerBound = false;
let searchFocusHandlerBound = false;
let lastPredictionRequestId = 0;
let currentPredictions = [];

let activeAutocompleteSessionToken = null;
let activePlaceSearchCallback = null;
let searchDebounceTimer = null;
let poiNameCache = new Map();
let searchLocationCache = new Map();

const MIN_SEARCH_LENGTH = 4;
const SEARCH_DEBOUNCE_MS = 450;
const MAX_PREDICTIONS = 5;

async function loadGoogleLibraries() {
  const { Map, InfoWindow, Marker, SymbolPath, Size } =
    await google.maps.importLibrary("maps");
  const {
    Place,
    AutocompleteSessionToken,
    AutocompleteSuggestion
  } = await google.maps.importLibrary("places");

  return {
    Map,
    InfoWindow,
    Marker,
    SymbolPath,
    Size,
    Place,
    AutocompleteSessionToken,
    AutocompleteSuggestion
  };
}

async function initMap() {
  const mapElement = document.getElementById("mapCanvas");
  if (!mapElement) return null;

  mapElement.innerHTML = "";

  const libs = await loadGoogleLibraries();
  PlaceCtor = libs.Place;
  PlacesServiceCtor = libs.Place;
  AutocompleteSessionTokenCtor = libs.AutocompleteSessionToken;
  AutocompleteSuggestionClass = libs.AutocompleteSuggestion;

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

  if (typeof activeInfoWindow.setZIndex === "function") {
    activeInfoWindow.setZIndex(9999);
  }

  google.maps.event.addListenerOnce(activeInfoWindow, "domready", () => {
    styleNativeInfoWindowShell();
  });
}

function addMarker({ lat, lng, title, label, onClick, pointData }) {
  if (!map) return null;

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
    icon: createCircleSymbol("#dc2626")
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
    icon: createCircleSymbol("#16a34a", "#ffffff", 12)
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

function showCurrentLocationMarker({ lat, lng, title = "Bulunduğum Konum" }) {
  if (!map) return null;

  if (currentLocationMarker) {
    currentLocationMarker.setMap(null);
  }

  currentLocationMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: "#2563eb",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
      scale: 9
    }
  });

  map.panTo({ lat, lng });
  map.setZoom(14);

  return currentLocationMarker;
}

function clearCurrentLocationMarker() {
  if (currentLocationMarker) {
    currentLocationMarker.setMap(null);
    currentLocationMarker = null;
  }
}

function showDraftMarker(lat, lng) {
  if (!map) return null;

  if (draftMarker) {
    draftMarker.setMap(null);
  }

  draftMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    draggable: false,
    title: "Seçilen Konum",
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: "#f59e0b",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
      scale: 8
    }
  });

  return draftMarker;
}

function clearDraftMarker() {
  if (draftMarker) {
    draftMarker.setMap(null);
    draftMarker = null;
  }
}

function setSearchMarker(lat, lng, title = "Arama Sonucu") {
  if (!map) return null;

  if (searchMarker) {
    searchMarker.setMap(null);
  }

  searchMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: "#7c3aed",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
      scale: 8
    }
  });

  map.panTo({ lat, lng });
  map.setZoom(15);

  return searchMarker;
}

function clearSearchMarker() {
  if (searchMarker) {
    searchMarker.setMap(null);
    searchMarker = null;
  }
}

function clearRouteLines() {
  routePolylines.forEach((polyline) => polyline.setMap(null));
  distanceOverlays.forEach((overlay) => overlay.setMap(null));
  routePolylines = [];
  distanceOverlays = [];
}

function createDistanceOverlay(position, distanceLabel) {
  if (!map) return null;

  class DistanceOverlay extends google.maps.OverlayView {
    constructor(pos, label) {
      super();
      this.position = pos;
      this.label = label;
      this.div = null;
    }

    onAdd() {
      const div = document.createElement("div");
      div.className = "distance-overlay";
      div.textContent = this.label;
      this.div = div;

      const panes = this.getPanes();
      panes.overlayMouseTarget.appendChild(div);
    }

    draw() {
      if (!this.div) return;

      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(this.position);
      if (!point) return;

      this.div.style.position = "absolute";
      this.div.style.left = `${point.x}px`;
      this.div.style.top = `${point.y}px`;
      this.div.style.transform = "translate(-50%, -50%)";
      this.div.style.padding = "4px 8px";
      this.div.style.background = "rgba(15, 23, 42, 0.85)";
      this.div.style.color = "#ffffff";
      this.div.style.fontSize = "11px";
      this.div.style.fontWeight = "600";
      this.div.style.borderRadius = "999px";
      this.div.style.boxShadow = "0 8px 18px rgba(15, 23, 42, 0.18)";
      this.div.style.whiteSpace = "nowrap";
      this.div.style.pointerEvents = "none";
      this.div.style.zIndex = "2";
    }

    onRemove() {
      if (this.div) {
        this.div.remove();
        this.div = null;
      }
    }
  }

  return new DistanceOverlay(position, distanceLabel);
}

function drawRouteSegments(points) {
  if (!map || !Array.isArray(points) || points.length < 2) {
    clearRouteLines();
    return;
  }

  clearRouteLines();

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    const polyline = new google.maps.Polyline({
      path: [
        { lat: previous.lat, lng: previous.lng },
        { lat: current.lat, lng: current.lng }
      ],
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.9,
      strokeWeight: 3,
      icons: [
        {
          icon: {
            path: "M 0,-1 0,1",
            strokeOpacity: 1,
            scale: 3
          },
          offset: "0",
          repeat: "12px"
        }
      ]
    });

    polyline.setMap(map);
    routePolylines.push(polyline);

    const midpoint = {
      lat: (previous.lat + current.lat) / 2,
      lng: (previous.lng + current.lng) / 2
    };

    const distance = haversineDistance(
      previous.lat,
      previous.lng,
      current.lat,
      current.lng
    );

    const overlay = createDistanceOverlay(
      new google.maps.LatLng(midpoint.lat, midpoint.lng),
      distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(2)} km`
    );

    overlay.setMap(map);
    distanceOverlays.push(overlay);
  }
}

function focusMapToPoints(points) {
  if (!map || !Array.isArray(points) || !points.length) return;

  if (points.length === 1) {
    map.panTo({ lat: points[0].lat, lng: points[0].lng });
    map.setZoom(14);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  points.forEach((point) => {
    bounds.extend({ lat: point.lat, lng: point.lng });
  });

  map.fitBounds(bounds, 64);
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

async function fetchPlaceLocationById(placeId, sessionToken) {
  if (!placeId || !PlaceCtor) return null;

  if (searchLocationCache.has(placeId)) {
    return searchLocationCache.get(placeId);
  }

  try {
    const place = new PlaceCtor({
      id: placeId,
      requestedLanguage: "tr",
      requestedRegion: "TR"
    });

    await place.fetchFields({
      fields: ["location"],
      sessionToken
    });

    const location = place.location;
    if (!location) return null;

    const result = {
      lat: location.lat(),
      lng: location.lng()
    };

    searchLocationCache.set(placeId, result);
    return result;
  } catch (error) {
    console.error("Konum bilgisi alınamadı:", error);
    return null;
  }
}

async function fetchPoiNameById(placeId) {
  if (!placeId || !PlaceCtor) return "";

  if (poiNameCache.has(placeId)) {
    return poiNameCache.get(placeId);
  }

  try {
    const place = new PlaceCtor({
      id: placeId,
      requestedLanguage: "tr",
      requestedRegion: "TR"
    });

    await place.fetchFields({
      fields: ["displayName"]
    });

    const displayName = place.displayName?.text || "";
    if (displayName) {
      poiNameCache.set(placeId, displayName);
    }
    return displayName;
  } catch (error) {
    console.error("POI adı alınamadı:", error);
    return "";
  }
}

function endAutocompleteSession() {
  activeAutocompleteSessionToken = null;
}

function ensureAutocompleteSession() {
  if (!AutocompleteSessionTokenCtor) return null;
  if (!activeAutocompleteSessionToken) {
    activeAutocompleteSessionToken = new AutocompleteSessionTokenCtor();
  }
  return activeAutocompleteSessionToken;
}

function hideSearchDropdown() {
  if (!searchDropdown) return;
  searchDropdown.hidden = true;
  searchDropdown.innerHTML = "";
}

function renderSearchDropdown(predictions, onSelect) {
  if (!searchDropdown) return;

  currentPredictions = Array.isArray(predictions) ? predictions : [];

  if (!currentPredictions.length) {
    hideSearchDropdown();
    return;
  }

  searchDropdown.innerHTML = "";
  searchDropdown.hidden = false;

  currentPredictions.forEach((prediction, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-dropdown-item";
    button.dataset.predictionIndex = String(index);

    const mainText =
      prediction.structuredFormat?.mainText?.text ||
      prediction.text?.text ||
      prediction.mainText?.text ||
      "";

    const secondaryText =
      prediction.structuredFormat?.secondaryText?.text ||
      prediction.secondaryText?.text ||
      "";

    button.innerHTML = `
      <span class="search-item-main">${mainText}</span>
      ${secondaryText ? `<span class="search-item-secondary">${secondaryText}</span>` : ""}
    `;

    button.addEventListener("click", async () => {
      await onSelect(prediction);
    });

    searchDropdown.appendChild(button);
  });
}

async function getAutocompletePredictions(query) {
  if (!AutocompleteSuggestionClass) return [];

  const sessionToken = ensureAutocompleteSession();

  try {
    const { suggestions } =
      await AutocompleteSuggestionClass.fetchAutocompleteSuggestions({
        input: query,
        sessionToken,
        language: "tr",
        region: "TR",
        includedRegionCodes: ["tr"],
        origin: map?.getCenter() || undefined
      });

    return (suggestions || [])
      .slice(0, MAX_PREDICTIONS)
      .map((item) => item.placePrediction)
      .filter(Boolean);
  } catch (error) {
    console.error("Autocomplete hatası:", error);
    return [];
  }
}

function initPlaceSearch({ inputElement, dropdownElement, onPlaceSelected }) {
  searchInputEl = inputElement || null;
  searchDropdown = dropdownElement || null;
  activePlaceSearchCallback = onPlaceSelected;

  if (!searchInputEl || !searchDropdown) return;

  const handlePredictionSelection = async (prediction) => {
    const placeId = prediction?.placeId;
    if (!placeId) return;

    const selectedName =
      prediction.structuredFormat?.mainText?.text ||
      prediction.text?.text ||
      "";

    const locationData = await fetchPlaceLocationById(
      placeId,
      activeAutocompleteSessionToken
    );

    endAutocompleteSession();
    hideSearchDropdown();

    if (!locationData) return;

    setSearchMarker(locationData.lat, locationData.lng, selectedName || "Arama Sonucu");

    if (typeof activePlaceSearchCallback === "function") {
      activePlaceSearchCallback({
        name: selectedName || "İşaretli konum",
        lat: locationData.lat,
        lng: locationData.lng,
        placeId
      });
    }
  };

  if (!searchInputHandlerBound) {
    searchInputEl.addEventListener("input", () => {
      const query = searchInputEl.value.trim();

      if (searchDebounceTimer) {
        window.clearTimeout(searchDebounceTimer);
      }

      if (query.length < MIN_SEARCH_LENGTH) {
        hideSearchDropdown();
        endAutocompleteSession();
        return;
      }

      searchDebounceTimer = window.setTimeout(async () => {
        const requestId = ++lastPredictionRequestId;
        const predictions = await getAutocompletePredictions(query);

        if (requestId !== lastPredictionRequestId) return;

        renderSearchDropdown(predictions, handlePredictionSelection);
      }, SEARCH_DEBOUNCE_MS);
    });

    searchInputHandlerBound = true;
  }

  if (!searchFocusHandlerBound) {
    searchInputEl.addEventListener("focus", async () => {
      const query = searchInputEl.value.trim();
      if (query.length < MIN_SEARCH_LENGTH) return;

      const requestId = ++lastPredictionRequestId;
      const predictions = await getAutocompletePredictions(query);

      if (requestId !== lastPredictionRequestId) return;

      renderSearchDropdown(predictions, handlePredictionSelection);
    });

    searchFocusHandlerBound = true;
  }

  if (!searchBlurHandlerBound) {
    searchInputEl.addEventListener("blur", () => {
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

function enableMapClickPicker(callback) {
  if (!map) return;

  if (mapClickListener) {
    google.maps.event.removeListener(mapClickListener);
    mapClickListener = null;
  }

  mapClickListener = map.addListener("click", async (event) => {
    const lat = event.latLng?.lat();
    const lng = event.latLng?.lng();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    showDraftMarker(lat, lng);

    let suggestedName = "";

    if (event.placeId) {
      if (typeof event.stop === "function") {
        event.stop();
      }

      suggestedName = await fetchPoiNameById(event.placeId);
    }

    const fallbackName = suggestedName || "İşaretli konum";

    callback({
      lat,
      lng,
      name: fallbackName,
      placeId: event.placeId || null
    });
  });
}

export {
  initMap,
  getMap,
  addMarker,
  clearMarkers,
  showStartMarker,
  clearStartMarker,
  showCurrentLocationMarker,
  clearCurrentLocationMarker,
  showDraftMarker,
  clearDraftMarker,
  setSearchMarker,
  clearSearchMarker,
  enableMapClickPicker,
  initPlaceSearch,
  clearRouteLines,
  drawRouteSegments,
  focusMapToPoints
};
