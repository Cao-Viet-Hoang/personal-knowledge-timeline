/**
 * Firebase Firestore adapter.
 * Used in "prod" environment.
 *
 * Loads Firebase SDK from CDN (no build step needed).
 * Credentials are stored in localStorage so the user only enters them once.
 *
 * Firestore structure (sub-collections for scalability):
 *   entries/{entryId}        — individual entry documents
 *   reflections/{date}       — individual reflection documents
 *   meta/config              — single meta document
 *   pkt_embeddings/{entryId} — embedding vectors (separate collection)
 *
 * Automatically migrates from the legacy single-doc format
 * (pkt/store) on first load if detected.
 */

import config from "../config.js";

const CRED_KEY = config.firebaseCredKey;

// New sub-collection paths
const ENTRIES_COL = "entries";
const REFLECTIONS_COL = "reflections";
const META_COL = "meta";
const META_DOC = "config";
const EMBEDDINGS_COLLECTION = "pkt_embeddings";

// Legacy single-doc path
const LEGACY_COL = "pkt";
const LEGACY_DOC = "store";

let _firestore = null;       // Firestore instance
let _embeddingsCol = null;   // CollectionReference — embeddings

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
  _embeddingsCol = _firestore.collection(EMBEDDINGS_COLLECTION);
}

// ── Legacy migration ───────────────────────────────────

/**
 * Migrate from legacy single-doc format (pkt/store) to sub-collections.
 * Runs once on first load if legacy document exists.
 */
async function migrateLegacy() {
  if (!_firestore) return false;

  try {
    const legacyRef = _firestore.collection(LEGACY_COL).doc(LEGACY_DOC);
    const snap = await legacyRef.get();
    if (!snap.exists) return false;

    const data = snap.data();
    const BATCH_SIZE = 500;
    let batch = _firestore.batch();
    let count = 0;

    // Migrate entries
    for (const [id, entry] of Object.entries(data.entries || {})) {
      batch.set(_firestore.collection(ENTRIES_COL).doc(id), entry);
      count++;
      if (count >= BATCH_SIZE) {
        await batch.commit();
        batch = _firestore.batch();
        count = 0;
      }
    }

    // Migrate reflections
    for (const [date, ref] of Object.entries(data.reflections || {})) {
      batch.set(_firestore.collection(REFLECTIONS_COL).doc(date), ref);
      count++;
      if (count >= BATCH_SIZE) {
        await batch.commit();
        batch = _firestore.batch();
        count = 0;
      }
    }

    // Migrate meta
    if (data.meta) {
      batch.set(_firestore.collection(META_COL).doc(META_DOC), data.meta);
    }

    // Delete legacy document
    batch.delete(legacyRef);
    await batch.commit();

    console.log("[FirebaseAdapter] Migrated from single-doc to sub-collections");
    return true;
  } catch (err) {
    console.error("[FirebaseAdapter] Migration failed:", err);
    return false;
  }
}

// ── Adapter object ─────────────────────────────────────

const firebaseAdapter = {
  async load() {
    if (!_firestore) return null;
    try {
      // Check for legacy migration first
      await migrateLegacy();

      // Load all entries
      const entriesSnap = await _firestore.collection(ENTRIES_COL).get();
      const entries = {};
      entriesSnap.forEach((doc) => {
        entries[doc.id] = doc.data();
      });

      // Load all reflections
      const reflectionsSnap = await _firestore.collection(REFLECTIONS_COL).get();
      const reflections = {};
      reflectionsSnap.forEach((doc) => {
        reflections[doc.id] = doc.data();
      });

      // Load meta
      const metaSnap = await _firestore.collection(META_COL).doc(META_DOC).get();
      const meta = metaSnap.exists
        ? metaSnap.data()
        : {};

      // Return null if completely empty (triggers seed or empty store)
      const hasData = Object.keys(entries).length > 0 || metaSnap.exists;
      if (!hasData) return null;

      return { entries, reflections, meta };
    } catch (err) {
      console.error("[FirebaseAdapter] load failed:", err);
    }
    return null;
  },

  async persist(db) {
    // Full persist — used by store.js for bulk operations
    return this.persistAll(db);
  },

  async persistEntry(id, entry) {
    if (!_firestore) return;
    try {
      await _firestore.collection(ENTRIES_COL).doc(id).set(entry);
    } catch (err) {
      console.error("[FirebaseAdapter] persistEntry failed:", err);
    }
  },

  async deleteEntry(id) {
    if (!_firestore) return;
    try {
      await _firestore.collection(ENTRIES_COL).doc(id).delete();
    } catch (err) {
      console.error("[FirebaseAdapter] deleteEntry failed:", err);
    }
  },

  async persistReflection(date, reflection) {
    if (!_firestore) return;
    try {
      await _firestore.collection(REFLECTIONS_COL).doc(date).set(reflection);
    } catch (err) {
      console.error("[FirebaseAdapter] persistReflection failed:", err);
    }
  },

  async deleteReflection(date) {
    if (!_firestore) return;
    try {
      await _firestore.collection(REFLECTIONS_COL).doc(date).delete();
    } catch (err) {
      console.error("[FirebaseAdapter] deleteReflection failed:", err);
    }
  },

  async persistMeta(meta) {
    if (!_firestore) return;
    try {
      await _firestore.collection(META_COL).doc(META_DOC).set(meta);
    } catch (err) {
      console.error("[FirebaseAdapter] persistMeta failed:", err);
    }
  },

  async persistAll(db) {
    if (!_firestore) return;
    try {
      const BATCH_SIZE = 500;
      const ops = [];

      for (const [id, entry] of Object.entries(db.entries || {})) {
        ops.push({ ref: _firestore.collection(ENTRIES_COL).doc(id), data: entry });
      }
      for (const [date, ref] of Object.entries(db.reflections || {})) {
        ops.push({ ref: _firestore.collection(REFLECTIONS_COL).doc(date), data: ref });
      }
      if (db.meta) {
        ops.push({ ref: _firestore.collection(META_COL).doc(META_DOC), data: db.meta });
      }

      for (let i = 0; i < ops.length; i += BATCH_SIZE) {
        const batch = _firestore.batch();
        const chunk = ops.slice(i, i + BATCH_SIZE);
        for (const op of chunk) {
          batch.set(op.ref, op.data);
        }
        await batch.commit();
      }
    } catch (err) {
      console.error("[FirebaseAdapter] persistAll failed:", err);
    }
  },

  async clear() {
    if (!_firestore) return;
    try {
      const BATCH_SIZE = 500;
      let batch = _firestore.batch();
      let count = 0;

      // Delete all entries
      const entriesSnap = await _firestore.collection(ENTRIES_COL).get();
      entriesSnap.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
        if (count >= BATCH_SIZE) {
          batch.commit();
          batch = _firestore.batch();
          count = 0;
        }
      });

      // Delete all reflections
      const reflectionsSnap = await _firestore.collection(REFLECTIONS_COL).get();
      reflectionsSnap.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
        if (count >= BATCH_SIZE) {
          batch.commit();
          batch = _firestore.batch();
          count = 0;
        }
      });

      // Delete meta
      batch.delete(_firestore.collection(META_COL).doc(META_DOC));

      await batch.commit();
    } catch (err) {
      console.error("[FirebaseAdapter] clear failed:", err);
    }
  },

  // ── Embedding storage ──
  // One doc per entry under `pkt_embeddings/{entryId}` keeps vectors
  // out of the 1 MiB main-doc limit.

  async loadEmbeddings() {
    if (!_embeddingsCol) return {};
    try {
      const snap = await _embeddingsCol.get();
      const result = {};
      snap.forEach((doc) => {
        const data = doc.data();
        if (data?.vec) result[doc.id] = data.vec;
      });
      return result;
    } catch (err) {
      console.error("[FirebaseAdapter] loadEmbeddings failed:", err);
      return {};
    }
  },

  async persistEmbedding(id, base64) {
    if (!_embeddingsCol) return;
    try {
      await _embeddingsCol.doc(id).set({ vec: base64 });
    } catch (err) {
      console.error("[FirebaseAdapter] persistEmbedding failed:", err);
    }
  },

  async deleteEmbedding(id) {
    if (!_embeddingsCol) return;
    try {
      await _embeddingsCol.doc(id).delete();
    } catch (err) {
      console.error("[FirebaseAdapter] deleteEmbedding failed:", err);
    }
  },

  async clearEmbeddings() {
    if (!_embeddingsCol) return;
    try {
      const snap = await _embeddingsCol.get();
      const batch = _firestore.batch();
      snap.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {
      console.error("[FirebaseAdapter] clearEmbeddings failed:", err);
    }
  },
};

export default firebaseAdapter;
