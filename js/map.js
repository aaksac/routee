let map;
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
