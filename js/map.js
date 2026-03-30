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
    fullscreenControl: true,
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
  wrapper.style.width = "min(220px, calc(100vw - 64px))";
  wrapper.style.maxWidth = "220px";
  wrapper.style.boxSizing = "border-box";
  wrapper.style.padding = "0";
  wrapper.style.borderRadius = "18px";
  wrapper.style.overflow = "hidden";
  wrapper.style.background = "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)";
  wrapper.style.boxShadow = "0 18px 40px rgba(15, 23, 42, 0.20)";
  wrapper.style.border = "1px solid rgba(226, 232, 240, 0.95)";
  wrapper.style.fontFamily = "inherit";

  const inner = document.createElement("div");
  inner.style.padding = "12px";
  inner.style.display = "flex";
  inner.style.flexDirection = "column";
  inner.style.gap = "8px";

  const badge = document.createElement("div");
  badge.textContent = pointData?.type === "start" ? "Başlangıç Noktası" : "Konum Bilgisi";
  badge.style.alignSelf = "flex-start";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "700";
  badge.style.letterSpacing = "0.04em";
  badge.style.textTransform = "uppercase";
  badge.style.color = "#1d4ed8";
  badge.style.background = "rgba(37, 99, 235, 0.10)";
  badge.style.padding = "5px 8px";
  badge.style.borderRadius = "999px";

  const title = document.createElement("div");
  title.textContent = getPointDisplayTitle(pointData);
  title.style.fontSize = "14px";
  title.style.fontWeight = "800";
  title.style.lineHeight = "1.25";
  title.style.color = "#0f172a";
  title.style.wordBreak = "break-word";

  const subtitleText = getPointSubtitle(pointData);
  let subtitle = null;

  if (subtitleText) {
    subtitle = document.createElement("div");
    subtitle.textContent = subtitleText;
    subtitle.style.fontSize = "11px";
    subtitle.style.lineHeight = "1.35";
    subtitle.style.color = "#64748b";
    subtitle.style.display = "-webkit-box";
    subtitle.style.webkitLineClamp = "2";
    subtitle.style.webkitBoxOrient = "vertical";
    subtitle.style.overflow = "hidden";
    subtitle.style.wordBreak = "break-word";
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
  button.style.letterSpacing = "0.01em";
  button.style.cursor = "pointer";
  button.style.boxShadow = "0 10px 22px rgba(37, 99, 235, 0.28)";
  button.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";

  button.addEventListener("mouseenter", () => {
    button.style.transform = "translateY(-1px)";
    button.style.boxShadow = "0 14px 28px rgba(37, 99, 235, 0.32)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.transform = "translateY(0)";
    button.style.boxShadow = "0 10px 22px rgba(37, 99, 235, 0.28)";
  });

  button.addEventListener("click", () => {
    const url = createGoogleMapsDirectionsUrl(pointData.lat, pointData.lng);
    window.location.href = url;
  });

  inner.appendChild(badge);
  inner.appendChild(title);
  if (subtitle) inner.appendChild(subtitle);
  inner.appendChild(button);
  wrapper.appendChild(inner);

  return wrapper;
}

function styleNativeInfoWindowShell() {
  const iwOuter = document.querySelector(".gm-style .gm-style-iw");
  if (iwOuter) {
    iwOuter.style.padding = "0";
    iwOuter.style.borderRadius = "18px";
    iwOuter.style.overflow = "hidden";
    iwOuter.style.boxShadow = "0 20px 42px rgba(15, 23, 42, 0.24)";
  }

  const iwContainer = document.querySelector(".gm-style .gm-style-iw-c");
  if (iwContainer) {
    iwContainer.style.padding = "0";
    iwContainer.style.borderRadius = "18px";
    iwContainer.style.overflow = "hidden";
    iwContainer.style.boxShadow = "0 20px 42px rgba(15, 23, 42, 0.24)";
  }

  const iwContent = document.querySelector(".gm-style .gm-style-iw-d");
  if (iwContent) {
    iwContent.style.overflow = "hidden";
    iwContent.style.maxHeight = "none";
    iwContent.style.padding = "0";
  }

  const closeBtn = document.querySelector(".gm-style button[aria-label='Close']");
  if (closeBtn) {
    closeBtn.style.top = "8px";
    closeBtn.style.right = "8px";
    closeBtn.style.width = "28px";
    closeBtn.style.height = "28px";
    closeBtn.style.borderRadius = "999px";
    closeBtn.style.background = "rgba(255,255,255,0.96)";
    closeBtn.style.boxShadow = "0 8px 18px rgba(15, 23, 42, 0.16)";
  }
}

function openMarkerInfo(marker, pointData) {
  if (!map || !marker || !activeInfoWindow || !pointData) return;

  activeInfoWindow.close();
  google.maps.event.clearListeners(activeInfoWindow, "domready");

  activeInfoWindow.setContent(createInfoWindowContent(pointData));
  activeInfoWindow.setOptions({
    maxWidth: 220,
    pixelOffset: new google.maps.Size(0, -6),
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
      div.style.zIndex = "1";
      div.innerText = this.text;
      this.div = div;

      const panes = this.getPanes();
      panes.overlayLayer.appendChild(div);
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

    if (event.placeId) {
      event.stop();

      if (!placesService) {
        placesService = new google.maps.places.PlacesService(map);
      }

      placesService.getDetails(
        {
          placeId: event.placeId,
          fields: ["name", "formatted_address"]
        },
        (place, status) => {
          const suggestedName =
            status === google.maps.places.PlacesServiceStatus.OK
              ? place?.name || place?.formatted_address || ""
              : "";

          callback({
            lat,
            lng,
            name: suggestedName,
            address: place?.formatted_address || ""
          });
        }
      );

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
  dropdown.style.top = "calc(100% + 4px)";
  dropdown.style.left = "0";
  dropdown.style.width = "100%";
  dropdown.style.background = "rgba(255,255,255,0.98)";
  dropdown.style.border = "1px solid rgba(226, 232, 240, 0.98)";
  dropdown.style.borderRadius = "12px";
  dropdown.style.boxShadow = "0 10px 22px rgba(15, 23, 42, 0.10)";
  dropdown.style.backdropFilter = "blur(8px)";
  dropdown.style.padding = "4px";
  dropdown.style.display = "none";
  dropdown.style.zIndex = "30";
  dropdown.style.maxHeight = "196px";
  dropdown.style.overflowY = "auto";
  dropdown.style.overflowX = "hidden";
  dropdown.style.boxSizing = "border-box";

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

function getNormalizedSearchKey(query) {
  const bounds = map?.getBounds?.();
  const center = bounds?.getCenter?.();

  if (!center) {
    return query.trim().toLowerCase();
  }

  const lat = center.lat().toFixed(2);
  const lng = center.lng().toFixed(2);

  return `${query.trim().toLowerCase()}|${lat}|${lng}`;
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

function setPredictionCache(cacheKey, predictions) {
  if (!cacheKey) return;

  if (predictionCache.has(cacheKey)) {
    predictionCache.delete(cacheKey);
  }

  predictionCache.set(cacheKey, predictions);

  if (predictionCache.size > MAX_CACHE_SIZE) {
    const firstKey = predictionCache.keys().next().value;
    predictionCache.delete(firstKey);
  }
}

function getPredictionCache(cacheKey) {
  if (!cacheKey || !predictionCache.has(cacheKey)) {
    return null;
  }

  const cached = predictionCache.get(cacheKey);
  predictionCache.delete(cacheKey);
  predictionCache.set(cacheKey, cached);
  return cached;
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
    title.textContent = prediction.structured_formatting?.main_text || prediction.description;
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
      if (!placesService) {
        placesService = new google.maps.places.PlacesService(map);
      }

      const sessionToken = ensureAutocompleteSessionToken();

      placesService.getDetails(
        {
          placeId: prediction.place_id,
          fields: ["name", "formatted_address", "geometry"],
          sessionToken
        },
        (place, status) => {
          clearAutocompleteSession();

          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !place ||
            !place.geometry ||
            !place.geometry.location
          ) {
            return;
          }

          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          if (searchMarker) {
            searchMarker.setMap(null);
          }

          searchMarker = new google.maps.Marker({
            map,
            position: { lat, lng },
            title: place.name || "Arama Sonucu",
            icon: createCircleSymbol("#facc15", "#92400e")
          });

          if (searchInputEl) {
            searchInputEl.value = place.name || place.formatted_address || prediction.description || "";
          }

          focusToLocation(lat, lng, 15);
          showDraftMarker(lat, lng);
          hideSearchDropdown();
          resetPageZoomAfterSearch();

          onPlaceSelected({
            name: place.name || place.formatted_address || "Seçilen Yer",
            lat,
            lng,
            address: place.formatted_address || ""
          });
        }
      );
    });

    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

function initPlaceSearch(inputElement, onPlaceSelected) {
  if (!map || !inputElement) return;

  searchInputEl = inputElement;
  ensureSearchDropdown(inputElement);

  if (!searchService) {
    searchService = new google.maps.places.AutocompleteService();
  }
  if (!placesService) {
    placesService = new google.maps.places.PlacesService(map);
  }

  if (!searchInputHandlerBound) {
    inputElement.addEventListener("input", () => {
      const query = inputElement.value.trim();
      const requestId = ++lastPredictionRequestId;

      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }

      if (query.length < MIN_SEARCH_LENGTH) {
        clearAutocompleteSession();
        hideSearchDropdown();
        return;
      }

      searchDebounceTimer = window.setTimeout(() => {
        const latestQuery = inputElement.value.trim();

        if (latestQuery.length < MIN_SEARCH_LENGTH) {
          clearAutocompleteSession();
          hideSearchDropdown();
          return;
        }

        const cacheKey = getNormalizedSearchKey(latestQuery);
        const cachedPredictions = getPredictionCache(cacheKey);

        if (cachedPredictions && cachedPredictions.length) {
          if (requestId !== lastPredictionRequestId) return;
          currentPredictions = cachedPredictions;
          renderPredictions(cachedPredictions, onPlaceSelected);
          return;
        }

        const sessionToken = ensureAutocompleteSessionToken();

        searchService.getPlacePredictions(
          {
            input: latestQuery,
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
