/**
 * Local adapter — uses IndexedDB for persistence.
 * Used in "dev" environment.
 *
 * Migrates from legacy localStorage format on first run.
 *
 * IndexedDB structure:
 *   Database: "pkt_db"
 *   Object stores:
 *     - "entries"      — keyed by entry id (UUID)
 *     - "reflections"  — keyed by date string (e.g. "2025-01-15")
 *     - "meta"         — single record with key "config"
 */

import config from "../config.js";

const DB_NAME = "pkt_db";
const DB_VERSION = 2;
const LEGACY_KEY = config.storageKey;

let _idb = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries");
      }
      if (!db.objectStoreNames.contains("reflections")) {
        db.createObjectStore("reflections");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
      if (!db.objectStoreNames.contains("embeddings")) {
        db.createObjectStore("embeddings");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getDB() {
  if (!_idb) _idb = await openDB();
  return _idb;
}

function idbGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const result = {};
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        result[cursor.key] = cursor.value;
        cursor.continue();
      } else {
        resolve(result);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db, storeName, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbClear(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Migrate from legacy localStorage format to IndexedDB.
 * Runs once on first load if legacy data exists.
 */
async function migrateLegacy(db) {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);
    if (!data) return false;

    for (const [id, entry] of Object.entries(data.entries || {})) {
      await idbPut(db, "entries", id, entry);
    }
    for (const [date, ref] of Object.entries(data.reflections || {})) {
      await idbPut(db, "reflections", date, ref);
    }
    if (data.meta) {
      await idbPut(db, "meta", "config", data.meta);
    }

    localStorage.removeItem(LEGACY_KEY);
    console.log("[LocalAdapter] Migrated from localStorage to IndexedDB");
    return true;
  } catch (err) {
    console.error("[LocalAdapter] Migration failed:", err);
    return false;
  }
}

const localAdapter = {
  async load() {
    try {
      const db = await getDB();
      await migrateLegacy(db);

      const entries = await idbGetAll(db, "entries");
      const reflections = await idbGetAll(db, "reflections");
      const meta = await idbGet(db, "meta", "config");

      const hasData = Object.keys(entries).length > 0 || meta;
      if (!hasData) return null;

      return {
        entries,
        reflections,
        meta: meta || {},
      };
    } catch (err) {
      console.error("[LocalAdapter] load failed:", err);
      return null;
    }
  },

  async persistEntry(id, entry) {
    try {
      const db = await getDB();
      await idbPut(db, "entries", id, entry);
    } catch (err) {
      console.error("[LocalAdapter] persistEntry failed:", err);
    }
  },

  async deleteEntry(id) {
    try {
      const db = await getDB();
      await idbDelete(db, "entries", id);
    } catch (err) {
      console.error("[LocalAdapter] deleteEntry failed:", err);
    }
  },

  async persistReflection(date, reflection) {
    try {
      const db = await getDB();
      await idbPut(db, "reflections", date, reflection);
    } catch (err) {
      console.error("[LocalAdapter] persistReflection failed:", err);
    }
  },

  async deleteReflection(date) {
    try {
      const db = await getDB();
      await idbDelete(db, "reflections", date);
    } catch (err) {
      console.error("[LocalAdapter] deleteReflection failed:", err);
    }
  },

  async persistMeta(meta) {
    try {
      const db = await getDB();
      await idbPut(db, "meta", "config", meta);
    } catch (err) {
      console.error("[LocalAdapter] persistMeta failed:", err);
    }
  },

  async persistAll(db) {
    try {
      const idb = await getDB();
      for (const [id, entry] of Object.entries(db.entries || {})) {
        await idbPut(idb, "entries", id, entry);
      }
      for (const [date, ref] of Object.entries(db.reflections || {})) {
        await idbPut(idb, "reflections", date, ref);
      }
      if (db.meta) {
        await idbPut(idb, "meta", "config", db.meta);
      }
    } catch (err) {
      console.error("[LocalAdapter] persistAll failed:", err);
    }
  },

  // Alias: store.js calls adapter.persist(snapshot) as the unified
  // "save the whole thing" path. FirebaseAdapter implements this
  // directly; for IndexedDB we delegate to persistAll.
  async persist(db) {
    return this.persistAll(db);
  },

  async clear() {
    try {
      const db = await getDB();
      await idbClear(db, "entries");
      await idbClear(db, "reflections");
      await idbClear(db, "meta");
      await idbClear(db, "embeddings");
    } catch (err) {
      console.error("[LocalAdapter] clear failed:", err);
    }
  },

  // ── Embedding storage ──
  // Vectors live in a separate object store so the main "persist" path
  // stays small and fast regardless of how many vectors are cached.

  async loadEmbeddings() {
    try {
      const db = await getDB();
      return await idbGetAll(db, "embeddings");
    } catch (err) {
      console.error("[LocalAdapter] loadEmbeddings failed:", err);
      return {};
    }
  },

  async persistEmbedding(id, base64) {
    try {
      const db = await getDB();
      await idbPut(db, "embeddings", id, base64);
    } catch (err) {
      console.error("[LocalAdapter] persistEmbedding failed:", err);
    }
  },

  async deleteEmbedding(id) {
    try {
      const db = await getDB();
      await idbDelete(db, "embeddings", id);
    } catch (err) {
      console.error("[LocalAdapter] deleteEmbedding failed:", err);
    }
  },

  async clearEmbeddings() {
    try {
      const db = await getDB();
      await idbClear(db, "embeddings");
    } catch (err) {
      console.error("[LocalAdapter] clearEmbeddings failed:", err);
    }
  },
};

export default localAdapter;
