const MAPS_STORAGE_PREFIX = "routee:maps:";

function getStorageKey(uid) {
  return `${MAPS_STORAGE_PREFIX}${uid}`;
}

function normalizePoint(point, index = 0) {
  if (!point) return null;
  return {
    name: String(point.name || point.title || `Nokta ${index + 1}`).trim() || `Nokta ${index + 1}`,
    lat: Number(point.lat),
    lng: Number(point.lng),
    type: point.type === "start" ? "start" : "point"
  };
}

function normalizeMapRecord(mapData, fallbackId = null) {
  if (!mapData || typeof mapData !== "object") return null;
  const id = String(mapData.id || fallbackId || "").trim();
  if (!id) return null;

  const startPoint = mapData.startPoint ? normalizePoint({ ...mapData.startPoint, type: "start" }) : null;
  const points = Array.isArray(mapData.points)
    ? mapData.points.map((point, index) => normalizePoint(point, index)).filter(Boolean)
    : [];

  return {
    id,
    name: String(mapData.name || "İsimsiz Harita").trim() || "İsimsiz Harita",
    startPoint,
    points,
    totalDistance: Number(mapData.totalDistance) || 0,
    locationCount: Number(mapData.locationCount) || (points.length + (startPoint ? 1 : 0)),
    updatedAtMs: Number(mapData.updatedAtMs || mapData.updatedAt || Date.now()) || Date.now()
  };
}

function readLocalMaps(uid) {
  try {
    const raw = localStorage.getItem(getStorageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeMapRecord(item, item?.id)).filter(Boolean);
  } catch {
    return [];
  }
}

function writeLocalMaps(uid, maps) {
  const normalized = Array.isArray(maps)
    ? maps.map((item) => normalizeMapRecord(item, item?.id)).filter(Boolean)
    : [];
  localStorage.setItem(getStorageKey(uid), JSON.stringify(normalized));
  return normalized;
}

function getLocalMaps(uid) {
  return readLocalMaps(uid).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
}

function getLocalMapById(uid, mapId) {
  return getLocalMaps(uid).find((item) => String(item.id) === String(mapId)) || null;
}

function saveLocalMap(uid, mapData) {
  const record = normalizeMapRecord(mapData, mapData?.id);
  if (!record) return null;
  const maps = readLocalMaps(uid).filter((item) => String(item.id) !== String(record.id));
  maps.push({ ...record, updatedAtMs: Date.now() });
  writeLocalMaps(uid, maps);
  return record;
}

function replaceLocalMaps(uid, maps) {
  return writeLocalMaps(uid, maps);
}

function deleteLocalMap(uid, mapId) {
  const maps = readLocalMaps(uid).filter((item) => String(item.id) !== String(mapId));
  writeLocalMaps(uid, maps);
}

export { getLocalMaps, getLocalMapById, saveLocalMap, replaceLocalMaps, deleteLocalMap, normalizeMapRecord };
