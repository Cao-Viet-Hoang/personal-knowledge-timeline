/**
 * Application data store.
 *
 * Persistence is delegated to an adapter:
 *   - "dev"  → LocalAdapter  (localStorage + seed JSON)
 *   - "prod" → FirebaseAdapter (Firestore)
 *
 * All business logic (CRUD, search, filter) lives here.
 * The adapter only handles load / persist.
 */

import { emit, Events } from "./event-bus.js";
import config from "../config.js";

// ── Internal state ─────────────────────────────────────

let _db = {
  entries: {},      // { [id]: EntryDoc }
  reflections: {},  // { [date]: ReflectionDoc }
  meta: { version: 1, lastEntryId: 0, lastReflectionId: 0 },
};

// ── Adapter interface ──────────────────────────────────
//
//   adapter.load()    → returns { entries, reflections, meta } or null
//   adapter.persist(db) → saves the full _db object
//   adapter.clear()   → wipe stored data
//
let _adapter = null;

export function setAdapter(adapter) {
  _adapter = adapter;
}

// ── Persistence helpers (delegate to adapter) ──────────

function persist() {
  if (!_adapter) return;
  try {
    _adapter.persist(_db);
  } catch (err) {
    console.error("[Store] Failed to persist:", err);
  }
}

async function loadFromAdapter() {
  if (!_adapter) return false;
  try {
    const data = await _adapter.load();
    if (data) {
      _db.entries = data.entries || {};
      _db.reflections = data.reflections || {};
      _db.meta = data.meta || _db.meta;
      return true;
    }
  } catch (err) {
    console.error("[Store] Failed to load from adapter:", err);
  }
  return false;
}

async function loadSeed() {
  try {
    const res = await fetch(config.seedUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const seed = await res.json();
    _db.entries = seed.entries || {};
    _db.reflections = seed.reflections || {};
    _db.meta = seed.meta || _db.meta;
    persist();
  } catch (err) {
    console.error("[Store] Failed to load seed data:", err);
  }
}

// ── Init ───────────────────────────────────────────────

export async function initStore() {
  const loaded = await loadFromAdapter();
  if (!loaded) {
    await loadSeed();
  }
}

/** Reset store to seed data (dev helper). */
export async function resetStore() {
  if (_adapter?.clear) await _adapter.clear();
  await loadSeed();
  emit(Events.ENTRIES_CHANGED);
  emit(Events.REFLECTIONS_CHANGED);
}

// ── ID generation ──────────────────────────────────────

function nextEntryId() {
  _db.meta.lastEntryId += 1;
  return `e_${String(_db.meta.lastEntryId).padStart(3, "0")}`;
}

function nextReflectionId() {
  _db.meta.lastReflectionId += 1;
  return `r_${String(_db.meta.lastReflectionId).padStart(3, "0")}`;
}

// ── Helpers ────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ── ENTRY CRUD ─────────────────────────────────────────

/**
 * Create a new entry.
 * @param {Partial<EntryDoc>} data
 * @returns {EntryDoc}
 */
export function createEntry(data) {
  const id = nextEntryId();
  const timestamp = now();

  const entry = {
    id,
    type: data.type || "note",
    title: data.title || "",
    sourceUrl: data.sourceUrl || "",
    sourceDomain: data.sourceUrl ? domainFromUrl(data.sourceUrl) : "",
    content: data.content || "",
    excerpt: data.excerpt || "",
    myNote: data.myNote || "",
    tags: data.tags || [],
    images: data.images || [],
    createdAt: timestamp,
    updatedAt: timestamp,
    readAt: null,
    starred: false,
    status: "inbox",
    relatedEntryIds: data.relatedEntryIds || [],
  };

  _db.entries[id] = entry;
  persist();
  emit(Events.ENTRY_CREATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
}

/**
 * Update an existing entry. Merges partial fields.
 * @param {string} id
 * @param {Partial<EntryDoc>} changes
 * @returns {EntryDoc|null}
 */
export function updateEntry(id, changes) {
  const entry = _db.entries[id];
  if (!entry) return null;

  // If sourceUrl changed, recompute domain
  if (changes.sourceUrl !== undefined) {
    changes.sourceDomain = domainFromUrl(changes.sourceUrl);
  }

  Object.assign(entry, changes, { updatedAt: now() });
  persist();
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
}

/**
 * Delete an entry by id.
 * Also removes this id from other entries' relatedEntryIds.
 */
export function deleteEntry(id) {
  if (!_db.entries[id]) return false;

  delete _db.entries[id];

  // Clean up related references
  for (const entry of Object.values(_db.entries)) {
    const idx = entry.relatedEntryIds.indexOf(id);
    if (idx !== -1) {
      entry.relatedEntryIds.splice(idx, 1);
    }
  }

  persist();
  emit(Events.ENTRY_DELETED, { id });
  emit(Events.ENTRIES_CHANGED);
  return true;
}

/** Get a single entry by id. */
export function getEntry(id) {
  return _db.entries[id] || null;
}

/** Get all entries as a sorted array (newest first). */
export function getAllEntries() {
  return Object.values(_db.entries).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

// ── STAR / STATUS ──────────────────────────────────────

export function toggleStar(id) {
  const entry = _db.entries[id];
  if (!entry) return null;
  entry.starred = !entry.starred;
  entry.updatedAt = now();
  persist();
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
}

export function setStatus(id, status) {
  const entry = _db.entries[id];
  if (!entry) return null;
  entry.status = status;
  entry.updatedAt = now();
  persist();
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
}

// ── TAGS ───────────────────────────────────────────────

/** Add a tag to an entry (no duplicates). */
export function addTag(entryId, tag) {
  const entry = _db.entries[entryId];
  if (!entry) return null;
  const normalized = tag.toLowerCase().trim();
  if (normalized && !entry.tags.includes(normalized)) {
    entry.tags.push(normalized);
    entry.updatedAt = now();
    persist();
    emit(Events.ENTRY_UPDATED, entry);
    emit(Events.ENTRIES_CHANGED);
  }
  return entry;
}

/** Remove a tag from an entry. */
export function removeTag(entryId, tag) {
  const entry = _db.entries[entryId];
  if (!entry) return null;
  entry.tags = entry.tags.filter((t) => t !== tag);
  entry.updatedAt = now();
  persist();
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
}

/** Get all unique tags across all entries, sorted. */
export function getAllTags() {
  const tagSet = new Set();
  for (const entry of Object.values(_db.entries)) {
    for (const t of entry.tags) tagSet.add(t);
  }
  return [...tagSet].sort();
}

// ── RELATED ENTRIES ────────────────────────────────────

/** Link two entries as related (bidirectional). */
export function linkEntries(idA, idB) {
  const a = _db.entries[idA];
  const b = _db.entries[idB];
  if (!a || !b || idA === idB) return false;

  if (!a.relatedEntryIds.includes(idB)) a.relatedEntryIds.push(idB);
  if (!b.relatedEntryIds.includes(idA)) b.relatedEntryIds.push(idA);

  a.updatedAt = now();
  b.updatedAt = now();
  persist();
  emit(Events.ENTRIES_CHANGED);
  return true;
}

/** Unlink two related entries (bidirectional). */
export function unlinkEntries(idA, idB) {
  const a = _db.entries[idA];
  const b = _db.entries[idB];
  if (!a || !b) return false;

  a.relatedEntryIds = a.relatedEntryIds.filter((id) => id !== idB);
  b.relatedEntryIds = b.relatedEntryIds.filter((id) => id !== idA);

  a.updatedAt = now();
  b.updatedAt = now();
  persist();
  emit(Events.ENTRIES_CHANGED);
  return true;
}

// ── FILTERING ──────────────────────────────────────────

/**
 * Filter entries by criteria.
 * @param {object} filters - { type?, status?, starred?, tag?, dateFrom?, dateTo?, query? }
 * @returns {EntryDoc[]}
 */
export function filterEntries(filters = {}) {
  let entries = getAllEntries();

  if (filters.type) {
    entries = entries.filter((e) => e.type === filters.type);
  }
  if (filters.status) {
    entries = entries.filter((e) => e.status === filters.status);
  }
  if (filters.starred) {
    entries = entries.filter((e) => e.starred);
  }
  if (filters.tag) {
    entries = entries.filter((e) => e.tags.includes(filters.tag));
  }
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    entries = entries.filter((e) => new Date(e.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    entries = entries.filter((e) => new Date(e.createdAt) <= to);
  }

  return entries;
}

// ── SEARCH ─────────────────────────────────────────────

/**
 * Full-text search across entry fields.
 * Returns matching entries with a `_matches` array of { field, indices }.
 */
export function searchEntries(query) {
  if (!query || !query.trim()) return [];

  const terms = query.toLowerCase().trim().split(/\s+/);

  return getAllEntries()
    .map((entry) => {
      const searchable = {
        title: entry.title.toLowerCase(),
        content: entry.content.toLowerCase(),
        excerpt: entry.excerpt.toLowerCase(),
        myNote: entry.myNote.toLowerCase(),
        tags: entry.tags.join(" ").toLowerCase(),
        sourceDomain: entry.sourceDomain.toLowerCase(),
      };

      const matchedFields = [];
      let score = 0;

      for (const [field, text] of Object.entries(searchable)) {
        for (const term of terms) {
          if (text.includes(term)) {
            matchedFields.push(field);
            // Weight: title > tags > myNote > excerpt > content > domain
            const weights = { title: 10, tags: 8, myNote: 6, excerpt: 4, content: 3, sourceDomain: 2 };
            score += weights[field] || 1;
          }
        }
      }

      if (score === 0) return null;
      return { ...entry, _matchedFields: [...new Set(matchedFields)], _score: score };
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score);
}

// ── REVIEW / RESURFACE ─────────────────────────────────

/**
 * Get entries eligible for review.
 * Returns entries older than `minAgeDays`, shuffled, limited to `limit`.
 */
export function getReviewEntries(minAgeDays = 2, limit = 5) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - minAgeDays);

  const eligible = getAllEntries().filter(
    (e) => new Date(e.createdAt) < cutoff && e.status !== "archived"
  );

  // Fisher-Yates shuffle
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  return eligible.slice(0, limit);
}

// ── REFLECTIONS ────────────────────────────────────────

/** Get a reflection by date string (YYYY-MM-DD). */
export function getReflection(date) {
  return _db.reflections[date] || null;
}

/** Save or update a daily reflection. */
export function saveReflection(date, content) {
  const existing = _db.reflections[date];
  const timestamp = now();

  if (existing) {
    existing.content = content;
    existing.updatedAt = timestamp;
  } else {
    _db.reflections[date] = {
      id: nextReflectionId(),
      date,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  persist();
  emit(Events.REFLECTIONS_CHANGED);
  return _db.reflections[date];
}

/** Get all reflections sorted by date descending. */
export function getAllReflections() {
  return Object.values(_db.reflections).sort(
    (a, b) => b.date.localeCompare(a.date)
  );
}

// ── STATS ──────────────────────────────────────────────

export function getStats() {
  const entries = Object.values(_db.entries);
  let inbox = 0;
  let starred = 0;
  let archived = 0;
  let processed = 0;

  for (const e of entries) {
    if (e.status === "inbox") inbox++;
    if (e.status === "processed") processed++;
    if (e.status === "archived") archived++;
    if (e.starred) starred++;
  }

  return { total: entries.length, inbox, starred, archived, processed };
}

/** Group entries by date key (YYYY-MM-DD). Returns Map ordered newest-first. */
export function groupByDate(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const dateKey = entry.createdAt.slice(0, 10);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey).push(entry);
  }
  return new Map([...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}
