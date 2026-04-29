import { showCurrentLocationMarker } from "./map.js";

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Tarayıcı konum desteği sunmuyor."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

async function locateAndShowUser() {
  const coords = await getCurrentLocation();
  showCurrentLocationMarker(coords.lat, coords.lng);
  return coords;
}

export { getCurrentLocation, locateAndShowUser };