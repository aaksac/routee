import { showCurrentLocationMarker } from "./map.js";

const LOCATION_TIMEOUT_MS = 22000;
const DESIRED_ACCURACY_METERS = 35;
const ACCEPTABLE_ACCURACY_METERS = 120;
const MAX_USABLE_ACCURACY_METERS = 1200;
const MIN_GPS_WAIT_MS = 2500;
const EXTENDED_GPS_WAIT_MS = 7000;

function formatMeters(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "bilinmiyor";
  if (number >= 1000) return `${(number / 1000).toFixed(1)} km`;
  return `${Math.round(number)} m`;
}

function createLocationError(message, code = "LOCATION_ERROR", extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function getFriendlyGeolocationError(error) {
  if (!error) return "Konum alınamadı.";

  if (error.code === 1) {
    return "Konum izni verilmedi. Android ayarlarında uygulama için Konum iznini ve Kesin konumu açın.";
  }

  if (error.code === 2) {
    return "Konum bilgisi alınamadı. GPS/Konum servislerini açıp açık alanda tekrar deneyin.";
  }

  if (error.code === 3) {
    return "Konum zamanında alınamadı. GPS sinyalinin güçlenmesi için tekrar deneyin.";
  }

  return error.message || "Konum alınamadı.";
}

function normalizePosition(position) {
  const coords = position?.coords || {};
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  const accuracy = Number(coords.accuracy);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    timestamp: Number(position?.timestamp || Date.now())
  };
}

function isBetterPosition(candidate, currentBest) {
  if (!candidate) return false;
  if (!currentBest) return true;

  const candidateAccuracy = Number(candidate.accuracy);
  const bestAccuracy = Number(currentBest.accuracy);

  if (Number.isFinite(candidateAccuracy) && Number.isFinite(bestAccuracy)) {
    return candidateAccuracy < bestAccuracy;
  }

  if (Number.isFinite(candidateAccuracy) && !Number.isFinite(bestAccuracy)) return true;
  if (!Number.isFinite(candidateAccuracy) && Number.isFinite(bestAccuracy)) return false;

  return candidate.timestamp > currentBest.timestamp;
}

function getCurrentLocation(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(createLocationError("Tarayıcı konum desteği sunmuyor.", "UNSUPPORTED"));
      return;
    }

    const desiredAccuracy = Number(options.desiredAccuracyMeters) || DESIRED_ACCURACY_METERS;
    const acceptableAccuracy = Number(options.acceptableAccuracyMeters) || ACCEPTABLE_ACCURACY_METERS;
    const maxUsableAccuracy = Number(options.maxUsableAccuracyMeters) || MAX_USABLE_ACCURACY_METERS;
    const timeoutMs = Number(options.timeoutMs) || LOCATION_TIMEOUT_MS;
    const startedAt = Date.now();

    let bestPosition = null;
    let settled = false;
    let watchId = null;
    let timeoutId = null;

    function cleanup() {
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (error) {}
        watchId = null;
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    function finishWithPosition(position) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(position);
    }

    function finishWithError(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function maybeResolveBest(force = false) {
      if (!bestPosition) return false;

      const elapsed = Date.now() - startedAt;
      const accuracy = Number(bestPosition.accuracy);
      const hasAccuracy = Number.isFinite(accuracy);

      if (!hasAccuracy) {
        if (force || elapsed >= EXTENDED_GPS_WAIT_MS) {
          finishWithPosition(bestPosition);
          return true;
        }
        return false;
      }

      if (accuracy <= desiredAccuracy && elapsed >= MIN_GPS_WAIT_MS) {
        finishWithPosition(bestPosition);
        return true;
      }

      if (accuracy <= acceptableAccuracy && elapsed >= EXTENDED_GPS_WAIT_MS) {
        finishWithPosition(bestPosition);
        return true;
      }

      if (force) {
        if (accuracy <= maxUsableAccuracy) {
          finishWithPosition(bestPosition);
          return true;
        }

        finishWithError(
          createLocationError(
            `Konum çok düşük hassasiyetle alındı (${formatMeters(accuracy)}). Android konum izninde “Kesin konum” kapalı olabilir.`,
            "LOW_ACCURACY",
            { accuracy }
          )
        );
        return true;
      }

      return false;
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const normalized = normalizePosition(position);
        if (!normalized) return;

        if (isBetterPosition(normalized, bestPosition)) {
          bestPosition = normalized;
        }

        maybeResolveBest(false);
      },
      (error) => {
        if (bestPosition && error?.code !== 1) {
          maybeResolveBest(true);
          return;
        }

        finishWithError(createLocationError(getFriendlyGeolocationError(error), "GEOLOCATION_ERROR"));
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0
      }
    );

    timeoutId = window.setTimeout(() => {
      if (maybeResolveBest(true)) return;

      finishWithError(
        createLocationError(
          "Konum zamanında alınamadı. GPS/Konum servislerini açıp tekrar deneyin.",
          "TIMEOUT"
        )
      );
    }, timeoutMs + 750);
  });
}

async function locateAndShowUser(options = {}) {
  const coords = await getCurrentLocation(options);
  showCurrentLocationMarker(coords.lat, coords.lng, coords.accuracy);
  return coords;
}

export { getCurrentLocation, locateAndShowUser, formatMeters };
