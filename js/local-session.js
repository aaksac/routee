const STORAGE_KEY = "routee:last-session";

function sanitizeSession(session) {
  if (!session || typeof session !== "object") return null;

  const uid = String(session.uid || "").trim();
  const email = String(session.email || "").trim();
  if (!uid || !email) return null;

  return {
    uid,
    email,
    fullAccess: session.fullAccess === true,
    accessActive: session.accessActive !== false,
    locationQuota: Number(session.locationQuota) || 5,
    mapQuota: Number(session.mapQuota) || 1,
    savedAt: Number(session.savedAt) || Date.now()
  };
}

function saveLocalSession(session) {
  const sanitized = sanitizeSession(session);
  if (!sanitized) return null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
}

function getLocalSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function clearLocalSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function hasOfflineSession() {
  return Boolean(getLocalSession());
}

export { STORAGE_KEY, saveLocalSession, getLocalSession, clearLocalSession, hasOfflineSession };
