/**
 * Local adapter — uses localStorage for persistence.
 * Used in "dev" environment.
 */

import config from "../config.js";

const KEY = config.storageKey;

const localAdapter = {
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      console.error("[LocalAdapter] load failed:", err);
    }
    return null;
  },

  persist(db) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (err) {
      console.error("[LocalAdapter] persist failed:", err);
    }
  },

  async clear() {
    localStorage.removeItem(KEY);
  },
};

export default localAdapter;
