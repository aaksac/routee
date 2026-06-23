import {
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  collection,
  getDocs,
  getDocsFromServer,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "./firebase-config.js";

const TRIAL_DAYS = 7;
const TRIAL_LOCATION_QUOTA = 5;
const TRIAL_MAP_QUOTA = 1;
const TRIAL_MAP_ID = "trial-map";

const FIRESTORE_RETRY_DELAY_MS = 450;
const FIRESTORE_RETRY_COUNT = 1;
const FIRESTORE_SERVER_TIMEOUT_MS = 6500;
const FIRESTORE_CACHE_TIMEOUT_MS = 3500;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message) {
  let timerId = 0;

  const timeoutPromise = new Promise((_, reject) => {
    timerId = window.setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId) window.clearTimeout(timerId);
  });
}

function isRetryableFirestoreError(error) {
  const code = String(error?.code || "").toLowerCase();
  return (
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("aborted") ||
    code.includes("internal") ||
    code.includes("unknown") ||
    /network|offline|timeout|temporar/i.test(String(error?.message || ""))
  );
}

async function withRetry(operation, options = {}) {
  const retries = Number.isFinite(Number(options.retries))
    ? Number(options.retries)
    : FIRESTORE_RETRY_COUNT;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryableFirestoreError(error)) break;
      await wait(FIRESTORE_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

async function getDocFresh(ref) {
  try {
    return await withRetry(() =>
      withTimeout(
        getDocFromServer(ref),
        FIRESTORE_SERVER_TIMEOUT_MS,
        "Firestore sunucu okuması zaman aşımına uğradı."
      )
    );
  } catch (serverError) {
    return await withTimeout(
      getDoc(ref),
      FIRESTORE_CACHE_TIMEOUT_MS,
      "Firestore önbellek okuması zaman aşımına uğradı."
    );
  }
}

async function getDocsFresh(refOrQuery) {
  try {
    return await withRetry(() =>
      withTimeout(
        getDocsFromServer(refOrQuery),
        FIRESTORE_SERVER_TIMEOUT_MS,
        "Firestore sunucu liste okuması zaman aşımına uğradı."
      )
    );
  } catch (serverError) {
    return await withTimeout(
      getDocs(refOrQuery),
      FIRESTORE_CACHE_TIMEOUT_MS,
      "Firestore önbellek liste okuması zaman aşımına uğradı."
    );
  }
}

async function ensureUserProfile(uid, email) {
  const ref = doc(db, "users", uid);
  const snap = await getDocFresh(ref);

  if (!snap.exists()) {
    const trialEndsAt = Timestamp.fromDate(
      new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    );

    await setDoc(ref, {
      email,
      role: "trial",
      mapQuota: TRIAL_MAP_QUOTA,
      locationQuota: TRIAL_LOCATION_QUOTA,
      trialEndsAt,
      accessUntil: null,
      createdAt: serverTimestamp()
    });
  }
}

async function getUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDocFresh(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...snap.data()
  };
}

async function saveMap(uid, mapData, options = {}) {
  const { fullAccess = false } = options;

  if (fullAccess) {
    const ref = collection(db, "users", uid, "maps");
    return addDoc(ref, {
      ...mapData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  const ref = doc(db, "users", uid, "maps", TRIAL_MAP_ID);
  await setDoc(
    ref,
    {
      ...mapData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return { id: TRIAL_MAP_ID };
}

function timestampToMs(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMapSortMs(mapData) {
  return Math.max(
    timestampToMs(mapData?.updatedAt),
    timestampToMs(mapData?.createdAt)
  );
}

async function getMaps(uid, options = {}) {
  const { fullAccess = false } = options;

  if (fullAccess) {
    const ref = collection(db, "users", uid, "maps");
    const snap = await getDocsFresh(ref);

    return snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data()
      }))
      .sort((a, b) => getMapSortMs(b) - getMapSortMs(a));
  }

  const ref = doc(db, "users", uid, "maps", TRIAL_MAP_ID);
  const snap = await getDocFresh(ref);

  if (!snap.exists()) return [];

  return [
    {
      id: snap.id,
      ...snap.data()
    }
  ];
}

async function getMapById(uid, mapId, options = {}) {
  const { fullAccess = false } = options;

  if (!fullAccess && mapId !== TRIAL_MAP_ID) {
    return null;
  }

  const ref = doc(db, "users", uid, "maps", mapId);
  const snap = await getDocFresh(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...snap.data()
  };
}

async function updateMap(uid, mapId, mapData) {
  const ref = doc(db, "users", uid, "maps", mapId);
  return updateDoc(ref, {
    ...mapData,
    updatedAt: serverTimestamp()
  });
}

async function removeMap(uid, mapId) {
  const ref = doc(db, "users", uid, "maps", mapId);
  return deleteDoc(ref);
}

export {
  TRIAL_DAYS,
  TRIAL_LOCATION_QUOTA,
  TRIAL_MAP_QUOTA,
  TRIAL_MAP_ID,
  ensureUserProfile,
  getUserProfile,
  saveMap,
  getMaps,
  getMapById,
  updateMap,
  removeMap
};