/**
 * Firebase Firestore adapter.
 * Used in "prod" environment.
 *
 * Loads Firebase SDK from CDN (no build step needed).
 * Credentials are stored in localStorage so the user only enters them once.
 * Stores the entire _db blob in a single Firestore doc:
 *   collection("pkt") / doc("store")
 *
 * This keeps the migration from localStorage 1-to-1 and avoids
 * complex sub-collection mapping while staying well within the
 * 1 MiB Firestore document limit for typical usage.
 */

import config from "../config.js";

const CRED_KEY = config.firebaseCredKey;
const COLLECTION = "pkt";
const DOC_ID = "store";

let _firestore = null; // Firestore instance
let _docRef = null;    // DocumentReference

// ── Credential management ──────────────────────────────

export function getSavedCredentials() {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

export function saveCredentials(cred) {
  localStorage.setItem(CRED_KEY, JSON.stringify(cred));
}

export function clearCredentials() {
  localStorage.removeItem(CRED_KEY);
}

/**
 * Validate that credential object has all required fields.
 * @param {object} cred
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateCredentials(cred) {
  const required = ["apiKey", "authDomain", "projectId"];
  const missing = required.filter((k) => !cred[k]?.trim());
  return { valid: missing.length === 0, missing };
}

// ── SDK loading ────────────────────────────────────────

let _sdkLoaded = false;

async function loadFirebaseSDK() {
  if (_sdkLoaded) return;

  // Firebase App
  if (!window.firebase?.initializeApp) {
    await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  }
  // Firestore
  if (!window.firebase?.firestore) {
    await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js");
  }

  _sdkLoaded = true;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ── Initialization ─────────────────────────────────────

/**
 * Initialize Firebase with provided credentials.
 * Must be called before using the adapter.
 * @param {object} cred - Firebase config object
 */
export async function initFirebase(cred) {
  await loadFirebaseSDK();

  // Avoid duplicate init
  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(cred);
  }

  _firestore = window.firebase.firestore();
  _docRef = _firestore.collection(COLLECTION).doc(DOC_ID);
}

// ── Adapter object ─────────────────────────────────────

/** Firestore document size limit in bytes (1 MiB). */
const FIRESTORE_DOC_LIMIT = 1_048_576;

/** Warn threshold at 80% of limit. */
const FIRESTORE_WARN_THRESHOLD = FIRESTORE_DOC_LIMIT * 0.8;

const firebaseAdapter = {
  async load() {
    if (!_docRef) return null;
    try {
      const snap = await _docRef.get();
      if (snap.exists) return snap.data();
    } catch (err) {
      console.error("[FirebaseAdapter] load failed:", err);
    }
    return null;
  },

  async persist(db) {
    if (!_docRef) return;
    try {
      // Check approximate size to warn before hitting Firestore limit
      const size = new Blob([JSON.stringify(db)]).size;
      if (size > FIRESTORE_DOC_LIMIT) {
        console.error(
          `[FirebaseAdapter] Data size (${(size / 1024).toFixed(0)} KB) exceeds Firestore 1 MiB limit. Persist aborted.`
        );
        return;
      }
      if (size > FIRESTORE_WARN_THRESHOLD) {
        console.warn(
          `[FirebaseAdapter] Data size (${(size / 1024).toFixed(0)} KB) approaching Firestore 1 MiB limit.`
        );
      }
      await _docRef.set(db);
    } catch (err) {
      console.error("[FirebaseAdapter] persist failed:", err);
    }
  },

  async clear() {
    if (!_docRef) return;
    try {
      await _docRef.delete();
    } catch (err) {
      console.error("[FirebaseAdapter] clear failed:", err);
    }
  },
};

export default firebaseAdapter;
