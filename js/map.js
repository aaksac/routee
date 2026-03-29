let map;
let markers = [];
let currentLocationMarker = null;
let mapClickListener = null;
let draftMarker = null;
let searchMarker = null;
let autocomplete = null;
let startMarker = null;
let routePolylines = [];
let distanceOverlays = [];
let activeInfoWindow = null;

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
    window.open(url, "_blank", "noopener,noreferrer");
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

    createDistanceOverlay(
      new google.maps.LatLng(midLat, midLng),
      `${point.distanceFromPrevious.toFixed(2)} km`
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
    callback({ lat, lng });
  });
}

function initPlaceSearch(inputElement, onPlaceSelected) {
  if (!map || !inputElement) return;

  autocomplete = new google.maps.places.Autocomplete(inputElement, {
    fields: ["formatted_address", "geometry", "name"]
  });

  autocomplete.bindTo("bounds", map);

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    if (!place.geometry || !place.geometry.location) return;

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

    focusToLocation(lat, lng, 15);
    showDraftMarker(lat, lng);

    onPlaceSelected({
      name: place.name || place.formatted_address || "Seçilen Yer",
      lat,
      lng
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
  focusToLocation,
  showCurrentLocationMarker,
  enableMapClickPicker,
  initPlaceSearch,
  clearDraftMarker,
  clearRouteLines,
  drawRouteSegments
};
