import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyCtdGc1qLohM2cDIt2GGyGaT5tS4wF8hfM",
  authDomain: "route-planner-app-9f9a9.firebaseapp.com",
  projectId: "route-planner-app-9f9a9",
  storageBucket: "route-planner-app-9f9a9.firebasestorage.app",
  messagingSenderId: "254260038293",
  appId: "1:254260038293:web:cf5ea36f318fab76fa699c",
  measurementId: "G-807DDBR95Q"
};

const app = initializeApp(firebaseConfig);

let appCheck = null;

try {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider("6LdZK6IsAAAAAGdEs7-IKHyT3ggE8fEVgchqPMnF"),
    isTokenAutoRefreshEnabled: true
  });
} catch (error) {
  console.warn("App Check başlatılamadı. Auth akışı etkilenmeden devam ediyor:", error);
}

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, appCheck };
