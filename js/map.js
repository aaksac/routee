let map;
let markers = [];
let routePolylines = [];
let activeInfoWindow = null;
let startMarker = null;
let draftMarker = null;
let placesService = null;
let searchService = null;
let placesLibrary = null;
let placesLibraryPromise = null;
let searchDropdownEl = null;
let searchInputEl = null;
let currentSearchSessionToken = null;
const searchCache = new Map();
let searchDebounceTimer = null;
let documentClickHandlerBound = false;
let searchInputHandlerBound = false;
let searchBlurHandlerBound = false;
let searchFocusHandlerBound = false;
let lastPredictionRequestId = 0;
let currentPredictions = [];

function initMap() {
  const mapElement = document.getElementById("mapCanvas");
  if (!mapElement || !window.google || !google.maps) return null;

  mapElement.innerHTML = "";

  const defaultCenter = { lat: 37.0, lng: 35.3213 };

  map = new google.maps.Map(mapElement, {
    center: defaultCenter,
    zoom: 11,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: "greedy",
  });

  activeInfoWindow = new google.maps.InfoWindow();

  if (google.maps.places) {
    placesService = new google.maps.places.PlacesService(map);
    searchService = new google.maps.places.AutocompleteService();
  }

  ensurePlacesLibrary().catch(() => null);

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
    scale,
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
    maxWidth: 140,
  });

  activeInfoWindow.open({
    anchor: marker,
    map,
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
          fontWeight: "700",
        }
      : undefined,
    icon: createCircleSymbol("#dc2626"),
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
      fontWeight: "700",
    },
    icon: createCircleSymbol("#16a34a", "#ffffff", 12),
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

async function ensurePlacesLibrary() {
  if (!window.google || !google.maps || !google.maps.importLibrary) {
    return null;
  }

  if (placesLibrary) return placesLibrary;

  if (!placesLibraryPromise) {
    placesLibraryPromise = google.maps
      .importLibrary("places")
      .then((library) => {
        placesLibrary = library;
        return library;
      })
      .catch((error) => {
        placesLibraryPromise = null;
        throw error;
      });
  }

  return placesLibraryPromise;
}

function getMapBoundsLiteral() {
  const bounds = map?.getBounds?.();
  if (!bounds) return undefined;

  const northEast = bounds.getNorthEast();
  const southWest = bounds.getSouthWest();

  return {
    west: southWest.lng(),
    south: southWest.lat(),
    east: northEast.lng(),
    north: northEast.lat(),
  };
}

async function createAutocompleteSessionToken() {
  const library = await ensurePlacesLibrary();
  if (!library || !library.AutocompleteSessionToken) return null;

  const { AutocompleteSessionToken } = library;
  currentSearchSessionToken = new AutocompleteSessionToken();
  return currentSearchSessionToken;
}

async function getOrCreateAutocompleteSessionToken() {
  if (currentSearchSessionToken) return currentSearchSessionToken;
  return createAutocompleteSessionToken();
}

function resetAutocompleteSession() {
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
    predictions,
  });
}

async function fetchPredictionSuggestions(query) {
  const normalizedQuery = query.trim().toLocaleLowerCase("tr");
  const cachedPredictions = getCachedPredictions(normalizedQuery);
  if (cachedPredictions) {
    return cachedPredictions;
  }

  try {
    const library = await ensurePlacesLibrary();

    if (!library || !library.AutocompleteSuggestion) {
      throw new Error("New Autocomplete not available");
    }

    const { AutocompleteSuggestion } = library;

    const request = {
      input: query,
      sessionToken: await getOrCreateAutocompleteSessionToken(),
      language: document.documentElement.lang || navigator.language || "tr",
      region: "tr",
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
        __source: "new",
        prediction,
        place_id: prediction.placeId,
        description: prediction.text?.toString() || "",
        structured_formatting: {
          main_text:
            prediction.mainText?.toString() ||
            prediction.text?.toString() ||
            "",
          secondary_text: prediction.secondaryText?.toString() || "",
        },
      }));

    setCachedPredictions(normalizedQuery, predictions);
    return predictions;
  } catch (error) {
    if (!searchService && google.maps.places) {
      searchService = new google.maps.places.AutocompleteService();
    }

    if (!searchService) return [];

    return await new Promise((resolve) => {
      searchService.getPlacePredictions(
        {
          input: query,
          bounds: map?.getBounds?.() || undefined,
        },
        (predictions, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !Array.isArray(predictions)
          ) {
            resolve([]);
            return;
          }

          resolve(
            predictions.slice(0, 5).map((prediction) => ({
              __source: "legacy",
              ...prediction,
            }))
          );
        }
      );
    });
  }
}

async function getPlaceSummaryById(placeId) {
  try {
    const library = await ensurePlacesLibrary();
    if (!library || !library.Place) {
      throw new Error("New Place class not available");
    }

    const { Place } = library;
    const place = new Place({ id: placeId });

    await place.fetchFields({
      fields: ["displayName", "formattedAddress"],
    });

    return place.displayName || place.formattedAddress || "";
  } catch (error) {
    if (!placesService && google.maps.places) {
      placesService = new google.maps.places.PlacesService(map);
    }

    if (!placesService) return "";

    return await new Promise((resolve) => {
      placesService.getDetails(
        {
          placeId,
          fields: ["name", "formatted_address"],
        },
        (place, status) => {
          const suggestedName =
            status === google.maps.places.PlacesServiceStatus.OK
              ? place?.name || place?.formatted_address || ""
              : "";

          resolve(suggestedName);
        }
      );
    });
  }
}

async function resolvePredictionSelection(prediction) {
  if (!prediction) return null;

  if (prediction.__source === "new" && prediction.prediction) {
    try {
      const place = prediction.prediction.toPlace();

      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location"],
      });

      resetAutocompleteSession();

      const location = place.location;
      if (!location) return null;

      return {
        placeId: place.id || prediction.place_id || null,
        name: place.displayName || place.formattedAddress || prediction.description || "",
        formattedAddress: place.formattedAddress || "",
        lat: location.lat(),
        lng: location.lng(),
      };
    } catch (error) {
      // fallback below
    }
  }

  if (!placesService && google.maps.places) {
    placesService = new google.maps.places.PlacesService(map);
  }

  if (!placesService) return null;

  return await new Promise((resolve) => {
    placesService.getDetails(
      {
        placeId: prediction.place_id,
        fields: ["place_id", "name", "formatted_address", "geometry"],
      },
      (place, status) => {
        resetAutocompleteSession();

        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          resolve(null);
          return;
        }

        resolve({
          placeId: place.place_id || prediction.place_id || null,
          name: place.name || place.formatted_address || prediction.description || "",
          formattedAddress: place.formatted_address || "",
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      }
    );
  });
}

function ensureSearchDropdown() {
  if (searchDropdownEl) return searchDropdownEl;
  if (!searchInputEl) return null;

  const wrapper = searchInputEl.parentElement;
  if (!wrapper) return null;

  searchDropdownEl = document.createElement("div");
  searchDropdownEl.className = "map-search-dropdown hidden";
  wrapper.appendChild(searchDropdownEl);

  return searchDropdownEl;
}

function clearSearchDropdown() {
  const dropdown = ensureSearchDropdown();
  if (!dropdown) return;

  dropdown.innerHTML = "";
  dropdown.classList.add("hidden");
  currentPredictions = [];
}

function renderSearchDropdown(predictions, onSelect) {
  const dropdown = ensureSearchDropdown();
  if (!dropdown) return;

  dropdown.innerHTML = "";
  currentPredictions = predictions;

  if (!predictions.length) {
    dropdown.classList.add("hidden");
    return;
  }

  predictions.forEach((prediction, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "map-search-item";

    const mainText =
      prediction.structured_formatting?.main_text ||
      prediction.description ||
      "Bilinmeyen Konum";

    const secondaryText =
      prediction.structured_formatting?.secondary_text || "";

    item.innerHTML = `
      <span class="map-search-main">${mainText}</span>
      ${secondaryText ? `<span class="map-search-secondary">${secondaryText}</span>` : ""}
    `;

    item.addEventListener("click", async () => {
      const resolvedPlace = await resolvePredictionSelection(prediction);
      clearSearchDropdown();

      if (!resolvedPlace) return;

      if (typeof onSelect === "function") {
        onSelect(resolvedPlace);
      }
    });

    dropdown.appendChild(item);

    if (index === 0) {
      item.setAttribute("data-first-item", "true");
    }
  });

  dropdown.classList.remove("hidden");
}

function bindSearchDocumentClickHandler() {
  if (documentClickHandlerBound) return;
  documentClickHandlerBound = true;

  document.addEventListener("click", (event) => {
    const dropdown = ensureSearchDropdown();
    if (!dropdown || !searchInputEl) return;

    const target = event.target;
    if (target === searchInputEl || dropdown.contains(target)) {
      return;
    }

    clearSearchDropdown();
  });
}

function bindSearchBlurHandler() {
  if (!searchInputEl || searchBlurHandlerBound) return;
  searchBlurHandlerBound = true;

  searchInputEl.addEventListener("blur", () => {
    window.setTimeout(() => {
      const dropdown = ensureSearchDropdown();
      if (!dropdown) return;

      const activeEl = document.activeElement;
      if (activeEl === searchInputEl || dropdown.contains(activeEl)) {
        return;
      }

      clearSearchDropdown();
    }, 150);
  });
}

function bindSearchFocusHandler(onSelect) {
  if (!searchInputEl || searchFocusHandlerBound) return;
  searchFocusHandlerBound = true;

  searchInputEl.addEventListener("focus", async () => {
    const query = searchInputEl.value.trim();
    if (query.length < 3) return;

    const predictions = await fetchPredictionSuggestions(query);
    renderSearchDropdown(predictions, onSelect);
  });
}

function bindSearchInputHandler(onSelect) {
  if (!searchInputEl || searchInputHandlerBound) return;
  searchInputHandlerBound = true;

  searchInputEl.addEventListener("input", () => {
    const query = searchInputEl.value.trim();

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    if (query.length < 3) {
      clearSearchDropdown();
      resetAutocompleteSession();
      return;
    }

    searchDebounceTimer = window.setTimeout(async () => {
      const requestId = ++lastPredictionRequestId;
      const predictions = await fetchPredictionSuggestions(query);

      if (requestId !== lastPredictionRequestId) {
        return;
      }

      renderSearchDropdown(predictions, onSelect);
    }, 350);
  });
}

function handleSearchSelection(resolvedPlace, onPlaceSelect) {
  if (!resolvedPlace) return;

  if (searchInputEl) {
    searchInputEl.value = resolvedPlace.name || "";
  }

  focusToLocation(resolvedPlace.lat, resolvedPlace.lng, 16);
  resetPageZoomAfterSearch();

  if (typeof onPlaceSelect === "function") {
    onPlaceSelect(resolvedPlace);
  }
}

function initPlaceSearch(onPlaceSelect) {
  searchInputEl = document.getElementById("placeSearch");
  if (!searchInputEl) return;

  ensureSearchDropdown();
  bindSearchDocumentClickHandler();
  bindSearchBlurHandler();
  bindSearchFocusHandler((resolvedPlace) =>
    handleSearchSelection(resolvedPlace, onPlaceSelect)
  );
  bindSearchInputHandler((resolvedPlace) =>
    handleSearchSelection(resolvedPlace, onPlaceSelect)
  );
}

function clearRouteLines() {
  routePolylines.forEach((line) => line.setMap(null));
  routePolylines = [];
}

function drawRouteSegments(points = [], startPoint = null) {
  clearRouteLines();

  if (!map) return;

  const routePoints = [];

  if (startPoint?.lat != null && startPoint?.lng != null) {
    routePoints.push({
      lat: Number(startPoint.lat),
      lng: Number(startPoint.lng),
    });
  }

  points.forEach((point) => {
    if (point?.lat != null && point?.lng != null) {
      routePoints.push({
        lat: Number(point.lat),
        lng: Number(point.lng),
      });
    }
  });

  if (routePoints.length < 2) return;

  for (let i = 0; i < routePoints.length - 1; i += 1) {
    const line = new google.maps.Polyline({
      path: [routePoints[i], routePoints[i + 1]],
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.95,
      strokeWeight: 3,
      map,
    });

    routePolylines.push(line);
  }
}

function clearDraftMarker() {
  if (draftMarker) {
    draftMarker.setMap(null);
    draftMarker = null;
  }
}

function showDraftMarker({ lat, lng, title = "Seçilen Konum" }) {
  if (!map) return null;

  clearDraftMarker();

  draftMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title,
    icon: createCircleSymbol("#1d4ed8", "#ffffff", 9),
  });

  return draftMarker;
}

function bindMapClickToInputs({
  latInput,
  lngInput,
  nameInput,
  markerTitle = "Seçilen Konum",
} = {}) {
  if (!map) return;

  map.addListener("click", async (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

    if (latInput) latInput.value = lat.toFixed(6);
    if (lngInput) lngInput.value = lng.toFixed(6);

    showDraftMarker({ lat, lng, title: markerTitle });

    if (nameInput) {
      const placeId = event.placeId || null;
      let suggestedName = "";

      if (placeId) {
        event.stop();
        suggestedName = await getPlaceSummaryById(placeId);
      }

      if (!suggestedName) {
        suggestedName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }

      nameInput.value = suggestedName;
    }
  });
}

function fitMapToPoints(points = [], startPoint = null) {
  if (!map) return;

  const bounds = new google.maps.LatLngBounds();
  let hasPoint = false;

  if (startPoint?.lat != null && startPoint?.lng != null) {
    bounds.extend({
      lat: Number(startPoint.lat),
      lng: Number(startPoint.lng),
    });
    hasPoint = true;
  }

  points.forEach((point) => {
    if (point?.lat != null && point?.lng != null) {
      bounds.extend({
        lat: Number(point.lat),
        lng: Number(point.lng),
      });
      hasPoint = true;
    }
  });

  if (!hasPoint) return;

  if (points.length === 0 && startPoint?.lat != null && startPoint?.lng != null) {
    map.setCenter({
      lat: Number(startPoint.lat),
      lng: Number(startPoint.lng),
    });
    map.setZoom(14);
    return;
  }

  map.fitBounds(bounds, 60);
}

export {
  initMap,
  getMap,
  addMarker,
  clearMarkers,
  showStartMarker,
  clearStartMarker,
  focusToLocation,
  bindMapClickToInputs,
  fitMapToPoints,
  initPlaceSearch,
  clearDraftMarker,
  clearRouteLines,
  drawRouteSegments,
};
