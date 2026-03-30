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

let searchDropdown = null;
let searchInputEl = null;
let searchSelectHandlerBound = false;
let searchInputHandlerBound = false;
let searchBlurHandlerBound = false;
let searchFocusHandlerBound = false;
let lastPredictionRequestId = 0;
let currentPredictions = [];
let searchDebounceTimer = null;

let placesLibraryPromise = null;
let currentSearchSessionToken = null;
const searchCache = new Map();

async function ensurePlacesLibrary() {
  if (!window.google || !google.maps || !google.maps.importLibrary) {
    throw new Error("Google Maps Places library yüklenemedi.");
  }

  if (!placesLibraryPromise) {
    placesLibraryPromise = google.maps.importLibrary("places");
  }

  return placesLibraryPromise;
}

async function initMap() {
  const mapElement = document.getElementById("mapCanvas");
  if (!mapElement || !window.google || !google.maps) return null;

  mapElement.innerHTML = "";

  await google.maps.importLibrary("maps");
  await ensurePlacesLibrary();

  const defaultCenter = { lat: 37.0, lng: 35.3213 };

  map = new google.maps.Map(mapElement, {
    center: defaultCenter,
    zoom: 11,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: "greedy"
  });

  activeInfoWindow = new google.maps.InfoWindow();

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

function createInfoWindowContent(pointData) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "auto";
  wrapper.style.maxWidth = "120px";
  wrapper.style.padding = "0";
  wrapper.style.textAlign = "center";
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "6px";

  const title = document.createElement("div");
  title.textContent = getPointDisplayTitle(pointData);
  title.style.fontSize = "12px";
  title.style.fontWeight = "700";
  title.style.lineHeight = "1.2";
  title.style.color = "#0f172a";
  title.style.maxWidth = "110px";
  title.style.wordBreak = "break-word";
  title.style.margin = "0 auto";

  const button = document.createElement("button");
  button.textContent = "Yol Tarifi";
  button.style.background = "#2563eb";
  button.style.color = "#ffffff";
  button.style.border = "none";
  button.style.borderRadius = "999px";
  button.style.padding = "6px 10px";
  button.style.fontSize = "11px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.minWidth = "88px";
  button.style.height = "30px";

  button.addEventListener("click", () => {
    const url = createGoogleMapsDirectionsUrl(pointData.lat, pointData.lng);
    window.location.href = url;
  });

  wrapper.appendChild(title);
  wrapper.appendChild(button);

  return wrapper;
}

function openMarkerInfo(marker, pointData) {
  if (!map || !marker || !activeInfoWindow || !pointData) return;

  activeInfoWindow.setContent(createInfoWindowContent(pointData));
  activeInfoWindow.setOptions({
    maxWidth: 140
  });

  activeInfoWindow.open({
    anchor: marker,
    map
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

function focusToLocation(lat, lng, zoom = 15) {
  if (!map) return;
  map.setCenter({ lat, lng });
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
    icon: createCircleSymbol("#2563eb")
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
    icon: createCircleSymbol("#facc15", "#92400e")
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
      div.style.background = "#ffffff";
      div.style.border = "1px solid #cbd5e1";
      div.style.borderRadius = "999px";
      div.style.padding = "4px 8px";
      div.style.fontSize = "12px";
      div.style.fontWeight = "600";
      div.style.color = "#0f172a";
      div.style.boxShadow = "0 4px 12px rgba(15,23,42,0.12)";
      div.style.whiteSpace = "nowrap";
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

async function getPlaceSummaryById(placeId) {
  const { Place } = await ensurePlacesLibrary();
  const place = new Place({ id: placeId });

  await place.fetchFields({
    fields: ["displayName", "formattedAddress"]
  });

  return place.displayName || place.formattedAddress || "";
}

function enableMapClickPicker(callback) {
  if (!map) return;

  if (mapClickListener) {
    google.maps.event.removeListener(mapClickListener);
  }

  mapClickListener = map.addListener("click", async (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

    showDraftMarker(lat, lng);

    if (event.placeId) {
      event.stop();

      try {
        const suggestedName = await getPlaceSummaryById(event.placeId);

        callback({
          lat,
          lng,
          name: suggestedName
        });
      } catch (error) {
        callback({
          lat,
          lng,
          name: ""
        });
      }

      return;
    }

    callback({
      lat,
      lng,
      name: ""
    });
  });
}

function ensureSearchDropdown(inputElement) {
  if (searchDropdown) return searchDropdown;

  const dropdown = document.createElement("div");
  dropdown.id = "customPlaceSearchDropdown";
  dropdown.style.position = "absolute";
  dropdown.style.top = "calc(100% + 8px)";
  dropdown.style.left = "0";
  dropdown.style.width = "100%";
  dropdown.style.background = "rgba(255,255,255,0.98)";
  dropdown.style.border = "1px solid rgba(219, 228, 240, 0.96)";
  dropdown.style.borderRadius = "18px";
  dropdown.style.boxShadow = "0 18px 36px rgba(15, 23, 42, 0.14)";
  dropdown.style.backdropFilter = "blur(14px)";
  dropdown.style.padding = "8px";
  dropdown.style.display = "none";
  dropdown.style.zIndex = "30";
  dropdown.style.maxHeight = "280px";
  dropdown.style.overflowY = "auto";

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

function getMapBoundsLiteral() {
  const bounds = map?.getBounds?.();
  if (!bounds) return undefined;

  const northEast = bounds.getNorthEast();
  const southWest = bounds.getSouthWest();

  return {
    north: northEast.lat(),
    east: northEast.lng(),
    south: southWest.lat(),
    west: southWest.lng()
  };
}

async function createSearchSessionToken() {
  const { AutocompleteSessionToken } = await ensurePlacesLibrary();
  currentSearchSessionToken = new AutocompleteSessionToken();
  return currentSearchSessionToken;
}

async function getOrCreateSearchSessionToken() {
  if (currentSearchSessionToken) return currentSearchSessionToken;
  return createSearchSessionToken();
}

function resetSearchSessionToken() {
  currentSearchSessionToken = null;
}

function getCachedPredictions(query) {
  const cached = searchCache.get(query);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > 2 * 60 * 1000) {
    searchCache.delete(query);
    return null;
  }

  return cached.predictions;
}

function setCachedPredictions(query, predictions) {
  if (searchCache.size >= 50) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) {
      searchCache.delete(oldestKey);
    }
  }

  searchCache.set(query, {
    timestamp: Date.now(),
    predictions
  });
}

async function fetchPredictionSuggestions(query) {
  const normalizedQuery = query.trim().toLocaleLowerCase("tr");
  const cachedPredictions = getCachedPredictions(normalizedQuery);
  if (cachedPredictions) {
    return cachedPredictions;
  }

  const { AutocompleteSuggestion } = await ensurePlacesLibrary();

  const request = {
    input: query,
    sessionToken: await getOrCreateSearchSessionToken(),
    language: document.documentElement.lang || navigator.language || "tr",
    region: "tr"
  };

  const boundsLiteral = getMapBoundsLiteral();
  if (boundsLiteral) {
    request.locationBias = boundsLiteral;
  }

  const { suggestions = [] } =
    await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

  const predictions = suggestions
    .map((suggestion) => suggestion.placePrediction)
    .filter(Boolean)
    .slice(0, 5)
    .map((prediction) => ({
      prediction,
      placeId: prediction.placeId,
      mainText:
        prediction.mainText?.toString() ||
        prediction.text?.toString() ||
        "",
      secondaryText: prediction.secondaryText?.toString() || "",
      description: prediction.text?.toString() || ""
    }));

  setCachedPredictions(normalizedQuery, predictions);
  return predictions;
}

async function resolvePredictionSelection(prediction) {
  const place = prediction.prediction.toPlace();

  await place.fetchFields({
    fields: ["displayName", "formattedAddress", "location"]
  });

  resetSearchSessionToken();

  if (!place.location) return null;

  return {
    name: place.displayName || place.formattedAddress || prediction.description || "Seçilen Yer",
    lat: place.location.lat(),
    lng: place.location.lng(),
    placeId: place.id || prediction.placeId || null
  };
}

function renderPredictions(predictions, onPlaceSelected) {
  const dropdown = searchDropdown;
  if (!dropdown) return;

  dropdown.innerHTML = "";

  if (!predictions.length) {
    dropdown.style.display = "none";
    return;
  }

  predictions.forEach((prediction, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.dataset.placeId = prediction.placeId || "";
    item.dataset.index = String(index);
    item.style.width = "100%";
    item.style.textAlign = "left";
    item.style.padding = "10px 12px";
    item.style.border = "1px solid transparent";
    item.style.background = "#fff";
    item.style.borderRadius = "12px";
    item.style.display = "block";
    item.style.marginBottom = index === predictions.length - 1 ? "0" : "6px";
    item.style.cursor = "pointer";

    const title = document.createElement("div");
    title.textContent = prediction.mainText || prediction.description;
    title.style.fontWeight = "600";
    title.style.color = "#0f172a";
    title.style.fontSize = "0.95rem";

    const subtitle = document.createElement("div");
    subtitle.textContent = prediction.secondaryText || "";
    subtitle.style.color = "#64748b";
    subtitle.style.fontSize = "0.84rem";
    subtitle.style.marginTop = "4px";

    item.appendChild(title);
    if (subtitle.textContent) {
      item.appendChild(subtitle);
    }

    item.addEventListener("mouseenter", () => {
      item.style.background = "rgba(37, 99, 235, 0.06)";
      item.style.borderColor = "rgba(37, 99, 235, 0.12)";
    });

    item.addEventListener("mouseleave", () => {
      item.style.background = "#fff";
      item.style.borderColor = "transparent";
    });

    item.addEventListener("click", async () => {
      try {
        const placeData = await resolvePredictionSelection(prediction);
        if (!placeData) return;

        if (searchMarker) {
          searchMarker.setMap(null);
        }

        searchMarker = new google.maps.Marker({
          map,
          position: { lat: placeData.lat, lng: placeData.lng },
          title: placeData.name || "Arama Sonucu",
          icon: createCircleSymbol("#facc15", "#92400e")
        });

        if (searchInputEl) {
          searchInputEl.value = placeData.name || "";
        }

        focusToLocation(placeData.lat, placeData.lng, 15);
        showDraftMarker(placeData.lat, placeData.lng);
        hideSearchDropdown();
        resetPageZoomAfterSearch();

        onPlaceSelected({
          name: placeData.name,
          lat: placeData.lat,
          lng: placeData.lng
        });
      } catch (error) {
        console.error("Yer seçimi çözümlenemedi:", error);
      }
    });

    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

function initPlaceSearch(inputElement, onPlaceSelected) {
  if (!map || !inputElement) return;

  searchInputEl = inputElement;
  ensureSearchDropdown(inputElement);

  if (!searchInputHandlerBound) {
    inputElement.addEventListener("input", () => {
      const query = inputElement.value.trim();

      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }

      if (query.length < 3) {
        hideSearchDropdown();
        resetSearchSessionToken();
        return;
      }

      searchDebounceTimer = window.setTimeout(async () => {
        const requestId = ++lastPredictionRequestId;

        try {
          const predictions = await fetchPredictionSuggestions(query);

          if (requestId !== lastPredictionRequestId) return;

          currentPredictions = predictions;
          renderPredictions(predictions, onPlaceSelected);
        } catch (error) {
          console.error("Autocomplete isteği başarısız:", error);
          hideSearchDropdown();
        }
      }, 350);
    });

    searchInputHandlerBound = true;
  }

  if (!searchFocusHandlerBound) {
    inputElement.addEventListener("focus", async () => {
      const query = inputElement.value.trim();
      if (query.length < 3) return;

      try {
        const predictions = await fetchPredictionSuggestions(query);
        currentPredictions = predictions;
        renderPredictions(predictions, onPlaceSelected);
      } catch (error) {
        hideSearchDropdown();
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