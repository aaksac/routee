import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "./firebase-config.js";

const TRIAL_DAYS = 7;
const TRIAL_LOCATION_QUOTA = 5;
const TRIAL_MAP_QUOTA = 1;
const TRIAL_MAP_ID = "trial-map";

async function ensureUserProfile(uid, email) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

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
  const snap = await getDoc(ref);

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

async function getMaps(uid, options = {}) {
  const { fullAccess = false } = options;

  if (fullAccess) {
    const ref = collection(db, "users", uid, "maps");
    const q = query(ref, orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);

    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));
  }

  const ref = doc(db, "users", uid, "maps", TRIAL_MAP_ID);
  const snap = await getDoc(ref);

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
  const snap = await getDoc(ref);

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