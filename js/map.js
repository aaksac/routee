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
    gestureHandling: "cooperative"
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
    window.open(url, "_blank");
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
      div.style.transform = "translate(-50%, -50%)";
      div.style.background = "rgba(255,255,255,0.96)";
      div.style.border = "1px solid rgba(219,228,240,0.96)";
      div.style.borderRadius = "999px";
      div.style.padding = "4px 8px";
      div.style.fontSize = "11px";
      div.style.fontWeight = "600";
      div.style.color = "#0f172a";
      div.style.boxShadow = "0 4px 12px rgba(15,23,42,0.10)";
      div.style.whiteSpace = "nowrap";
      div.textContent = this.text;
      this.div = div;

      const panes = this.getPanes();
      panes.floatPane.appendChild(div);
    }

    draw() {
      if (!this.div) return;
      const projection = this.getProjection();
      if (!projection) return;

      const point = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(this.position.lat, this.position.lng)
      );

      if (!point) return;

      this.div.style.left = `${point.x}px`;
      this.div.style.top = `${point.y}px`;
    }

    onRemove() {
      if (this.div) {
        this.div.remove();
        this.div = null;
      }
    }
  }

  return new DistanceOverlay(position, text);
}

function drawRouteSegments(segments = []) {
  clearRouteLines();
  if (!map || !Array.isArray(segments)) return;

  segments.forEach((segment) => {
    if (!segment?.from || !segment?.to) return;

    const polyline = new google.maps.Polyline({
      path: [
        { lat: segment.from.lat, lng: segment.from.lng },
        { lat: segment.to.lat, lng: segment.to.lng }
      ],
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.8,
      strokeWeight: 3,
      map
    });

    routePolylines.push(polyline);

    if (segment.distanceLabel) {
      const midLat = (segment.from.lat + segment.to.lat) / 2;
      const midLng = (segment.from.lng + segment.to.lng) / 2;
      const overlay = createDistanceOverlay(
        { lat: midLat, lng: midLng },
        segment.distanceLabel
      );
      overlay.setMap(map);
      distanceOverlays.push(overlay);
    }
  });
}

function disableMapClickPicker() {
  if (mapClickListener) {
    google.maps.event.removeListener(mapClickListener);
    mapClickListener = null;
  }
}

function enableMapClickPicker(onPick) {
  if (!map) return;
  disableMapClickPicker();

  mapClickListener = map.addListener("click", (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    showDraftMarker(lat, lng);

    if (typeof onPick === "function") {
      onPick({ lat, lng });
    }
  });
}

function initPlaceSearch(inputElement, onPlacePicked) {
  if (!map || !inputElement || autocomplete) return;

  autocomplete = new google.maps.places.Autocomplete(inputElement, {
    fields: ["formatted_address", "geometry", "name"],
    componentRestrictions: { country: "tr" }
  });

  autocomplete.bindTo("bounds", map);

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place?.geometry?.location) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();

    if (searchMarker) {
      searchMarker.setMap(null);
    }

    searchMarker = new google.maps.Marker({
      map,
      position: { lat, lng },
      title: place.name || place.formatted_address || "Aranan Yer",
      icon: createCircleSymbol("#7c3aed")
    });

    focusToLocation(lat, lng, 15);

    if (typeof onPlacePicked === "function") {
      onPlacePicked({
        name: place.name || place.formatted_address || "Seçilen Yer",
        lat,
        lng
      });
    }
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