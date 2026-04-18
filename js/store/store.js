/**
 * Application data store.
 *
 * Persistence is delegated to an adapter:
 *   - "dev"  -> LocalAdapter (IndexedDB)
 *   - "prod" -> FirebaseAdapter (Firestore)
 *
 * All business logic (CRUD, search, filter) lives here.
 * The adapter only handles load / persist.
 */

import { emit, Events } from "./event-bus.js";
import config from "../config.js";
import { normalizeTags } from "../utils/tags.js";

// Internal state
let _db = {
  entries: {},      // { [id]: EntryDoc }
  reflections: {},  // { [date]: ReflectionDoc }
  meta: {},
};

/**
 * Embedding cache - { [entryId]: base64Float32String }.
 * Stored separately from entries to avoid bloating the main persist blob.
 * Loaded lazily from the adapter on demand (for example first semantic search).
 */
let _embeddings = {};
let _embeddingsLoaded = false;

// Adapter interface
//
//   adapter.load() -> returns { entries, reflections, meta } or null
//   adapter.persist(db) -> saves the full _db object
//   adapter.clear() -> wipe stored data
//
let _adapter = null;

export function setAdapter(adapter) {
  _adapter = adapter;
}

// Persistence helpers

/**
 * Persist a single entry to the adapter.
 * Deep-clones before writing to prevent mutation during async ops.
 */
function persistEntry(id) {
  if (!_adapter?.persistEntry) return;
  const entry = _db.entries[id];
  if (!entry) return;
  const snapshot = JSON.parse(JSON.stringify(entry));
  _adapter.persistEntry(id, snapshot).catch((err) =>
    console.error("[Store] Failed to persist entry:", err)
  );
}

/**
 * Delete a single entry from the adapter.
 */
function persistDeleteEntry(id) {
  if (!_adapter?.deleteEntry) return;
  _adapter.deleteEntry(id).catch((err) =>
    console.error("[Store] Failed to delete entry:", err)
  );
}

/**
 * Persist meta to the adapter.
 */
function persistMeta() {
  if (!_adapter?.persistMeta) return;
  const snapshot = JSON.parse(JSON.stringify(_db.meta));
  _adapter.persistMeta(snapshot).catch((err) =>
    console.error("[Store] Failed to persist meta:", err)
  );
}

/**
 * Persist a single reflection to the adapter.
 */
function persistReflection(date) {
  if (!_adapter?.persistReflection) return;
  const ref = _db.reflections[date];
  if (!ref) return;
  const snapshot = JSON.parse(JSON.stringify(ref));
  _adapter.persistReflection(date, snapshot).catch((err) =>
    console.error("[Store] Failed to persist reflection:", err)
  );
}

/**
 * Persist the entire _db to the adapter (for bulk operations).
 */
function persistAll() {
  if (!_adapter?.persistAll && !_adapter?.persist) return;
  const snapshot = JSON.parse(JSON.stringify(_db));
  const fn = _adapter.persistAll || _adapter.persist;
  fn.call(_adapter, snapshot).catch((err) =>
    console.error("[Store] Failed to persist all:", err)
  );
}

async function loadFromAdapter() {
  if (!_adapter) return false;
  try {
    const data = await _adapter.load();
    if (data) {
      _db.entries = data.entries || {};
      _db.reflections = data.reflections || {};
      _db.meta = data.meta || _db.meta;
      normalizeAllEntries();
      rebuildBacklinks();
      return true;
    }
  } catch (err) {
    console.error("[Store] Failed to load from adapter:", err);
  }
  return false;
}

/**
 * Recompute every entry's `backlinks` from the union of all
 * `relatedEntryIds` arrays. Run once after load to:
 *   1. Backfill `backlinks` for entries that pre-date the field.
 *   2. Self-heal any drift if an external write skipped the mirror.
 * Only persists entries whose backlinks set actually changed, so subsequent
 * boots with consistent data are a no-op write-wise.
 */
function rebuildBacklinks() {
  const before = new Map();
  for (const [id, entry] of Object.entries(_db.entries)) {
    const sorted = (entry.backlinks || []).slice().sort();
    before.set(id, sorted.join("|"));
    entry.backlinks = [];
  }
  for (const entry of Object.values(_db.entries)) {
    const seen = new Set();
    for (const targetId of entry.relatedEntryIds || []) {
      if (targetId === entry.id || seen.has(targetId)) continue;
      seen.add(targetId);
      const target = _db.entries[targetId];
      if (!target) continue;
      target.backlinks.push(entry.id);
    }
  }
  for (const [id, entry] of Object.entries(_db.entries)) {
    const after = entry.backlinks.slice().sort().join("|");
    if (before.get(id) !== after) {
      persistEntry(id);
    }
  }
}

// Init

export async function initStore() {
  await loadFromAdapter();
}

/**
 * Reset store to an empty state.
 * Only allowed in dev mode to prevent accidental prod data loss.
 */
export async function resetStore() {
  if (config.isProd) {
    console.error("[Store] resetStore is disabled in prod mode");
    return;
  }
  if (_adapter?.clear) await _adapter.clear();
  _db = {
    entries: {},
    reflections: {},
    meta: {},
  };
  _embeddings = {};
  _embeddingsLoaded = false;
  emit(Events.ENTRIES_CHANGED);
  emit(Events.REFLECTIONS_CHANGED);
}

// ID generation

function generateId() {
  return crypto.randomUUID();
}

// Helpers

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

/**
 * Normalize an entry to ensure all expected fields exist.
 * Handles forward-compatibility when new fields are added.
 */
function normalizeEntry(entry) {
  return {
    id: entry.id,
    type: entry.type || "note",
    title: entry.title || "",
    sourceUrl: entry.sourceUrl || "",
    sourceDomain: entry.sourceDomain || "",
    content: entry.content || "",
    excerpt: entry.excerpt || "",
    myNote: entry.myNote || "",
    tags: entry.tags || [],
    images: entry.images || [],
    createdAt: entry.createdAt || now(),
    updatedAt: entry.updatedAt || now(),
    starred: entry.starred ?? false,
    status: entry.status || "inbox",
    relatedEntryIds: entry.relatedEntryIds || [],
    backlinks: entry.backlinks || [],
    // AI-derived fields
    summary: entry.summary || "",
    aiActionItems: entry.aiActionItems || [],
    aiLanguage: entry.aiLanguage === "vi" ? "vi" : "en",
    embeddingModel: entry.embeddingModel || "",
    embeddingUpdatedAt: entry.embeddingUpdatedAt || null,
  };
}

/**
 * Normalize all entries in _db after loading.
 * Ensures every entry has all required fields.
 */
function normalizeAllEntries() {
  for (const [id, entry] of Object.entries(_db.entries)) {
    _db.entries[id] = normalizeEntry(entry);
  }
}

// Entry CRUD

/**
 * Create a new entry.
 * @param {Partial<EntryDoc>} data
 * @returns {EntryDoc}
 */
export function createEntry(data) {
  const id = data.id || generateId();
  const timestamp = now();

  // Drop self-refs, dangling targets, and duplicates so the link set is
  // always valid and minimal.
  const validRelated = [
    ...new Set(
      (data.relatedEntryIds || []).filter(
        (rid) => rid !== id && _db.entries[rid]
      )
    ),
  ];

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
    starred: data.starred ?? false,
    status: data.status || "inbox",
    relatedEntryIds: validRelated,
    backlinks: [],
    summary: data.summary || "",
    aiActionItems: data.aiActionItems || [],
    aiLanguage: data.aiLanguage === "vi" ? "vi" : "en",
    embeddingModel: "",
    embeddingUpdatedAt: null,
  };

  _db.entries[id] = entry;

  // Mirror outgoing links onto each target's backlinks.
  const affectedIds = [];
  for (const targetId of validRelated) {
    const target = _db.entries[targetId];
    target.backlinks = target.backlinks || [];
    if (!target.backlinks.includes(id)) {
      target.backlinks.push(id);
      target.updatedAt = timestamp;
      affectedIds.push(targetId);
    }
  }

  persistEntry(id);
  for (const aid of affectedIds) persistEntry(aid);
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
  const timestamp = now();

  // If sourceUrl changed, recompute domain
  if (changes.sourceUrl !== undefined) {
    changes.sourceDomain = domainFromUrl(changes.sourceUrl);
  }

  // If outgoing links changed, mirror the diff onto each target's backlinks.
  const affectedIds = [];
  if (changes.relatedEntryIds !== undefined) {
    const oldSet = new Set(entry.relatedEntryIds || []);
    const newSet = new Set(
      (changes.relatedEntryIds || []).filter(
        (rid) => rid !== id && _db.entries[rid]
      )
    );

    // Targets we no longer link to → drop us from their backlinks.
    for (const targetId of oldSet) {
      if (newSet.has(targetId)) continue;
      const target = _db.entries[targetId];
      if (!target) continue;
      const next = (target.backlinks || []).filter((bid) => bid !== id);
      if (next.length !== (target.backlinks || []).length) {
        target.backlinks = next;
        target.updatedAt = timestamp;
        affectedIds.push(targetId);
      }
    }

    // New targets → add us to their backlinks (deduped).
    for (const targetId of newSet) {
      if (oldSet.has(targetId)) continue;
      const target = _db.entries[targetId];
      target.backlinks = target.backlinks || [];
      if (!target.backlinks.includes(id)) {
        target.backlinks.push(id);
        target.updatedAt = timestamp;
        affectedIds.push(targetId);
      }
    }

    // Persist the normalized list (drops self-refs and dangling targets).
    changes.relatedEntryIds = [...newSet];
  }

  Object.assign(entry, changes, { updatedAt: timestamp });
  persistEntry(id);
  for (const aid of affectedIds) persistEntry(aid);
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
}

/**
 * Delete an entry by id.
 * Uses stored relatedEntryIds + backlinks to touch only the entries actually
 * connected to this one, instead of scanning the whole dataset.
 * Also drops any cached embedding.
 */
export function deleteEntry(id) {
  const entry = _db.entries[id];
  if (!entry) return false;

  const outgoing = (entry.relatedEntryIds || []).slice();
  const incoming = (entry.backlinks || []).slice();
  const timestamp = now();

  delete _db.entries[id];
  delete _embeddings[id];

  const affectedIds = new Set();

  // Targets we used to point to → strip our id from their backlinks.
  for (const targetId of outgoing) {
    const target = _db.entries[targetId];
    if (!target) continue;
    const next = (target.backlinks || []).filter((bid) => bid !== id);
    if (next.length !== (target.backlinks || []).length) {
      target.backlinks = next;
      target.updatedAt = timestamp;
      affectedIds.add(targetId);
    }
  }

  // Sources that pointed at us → strip our id from their relatedEntryIds.
  for (const sourceId of incoming) {
    const source = _db.entries[sourceId];
    if (!source) continue;
    const next = (source.relatedEntryIds || []).filter((rid) => rid !== id);
    if (next.length !== (source.relatedEntryIds || []).length) {
      source.relatedEntryIds = next;
      source.updatedAt = timestamp;
      affectedIds.add(sourceId);
    }
  }

  persistDeleteEntry(id);
  for (const affectedId of affectedIds) {
    persistEntry(affectedId);
  }
  if (_adapter?.deleteEmbedding) _adapter.deleteEmbedding(id).catch(() => {});
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

// Star / Status

export function toggleStar(id) {
  const entry = _db.entries[id];
  if (!entry) return null;
  entry.starred = !entry.starred;
  entry.updatedAt = now();
  persistEntry(id);
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
}

export function setStatus(id, status) {
  const entry = _db.entries[id];
  if (!entry) return null;
  entry.status = status;
  entry.updatedAt = now();
  persistEntry(id);
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
}

// Tags

/** Add a tag to an entry (no duplicates). */
export function addTag(entryId, tag) {
  const entry = _db.entries[entryId];
  if (!entry) return null;
  const normalized = tag.toLowerCase().trim();
  if (normalized && !entry.tags.includes(normalized)) {
    entry.tags.push(normalized);
    entry.updatedAt = now();
    persistEntry(entryId);
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
  persistEntry(entryId);
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

/**
 * Replace alias tags with a canonical tag across all entries.
 * Each alias is removed from entries that contain it; the canonical tag
 * is added (deduped) to those entries. Aliases equal to the canonical
 * (after lowercase/trim) are skipped.
 * @param {string} canonical
 * @param {string[]} aliases
 * @returns {number} count of entries actually modified
 */
export function mergeTags(canonical, aliases) {
  const target = String(canonical || "").toLowerCase().trim();
  if (!target) return 0;
  const aliasSet = new Set(
    (aliases || [])
      .map((a) => String(a).toLowerCase().trim())
      .filter((a) => a && a !== target)
  );
  if (aliasSet.size === 0) return 0;

  let changed = 0;
  for (const entry of Object.values(_db.entries)) {
    const tags = entry.tags || [];
    let touched = false;
    const kept = [];
    for (const t of tags) {
      if (aliasSet.has(t)) touched = true;
      else kept.push(t);
    }
    if (!touched) continue;
    if (!kept.includes(target)) kept.push(target);
    entry.tags = kept;
    entry.updatedAt = now();
    persistEntry(entry.id);
    emit(Events.ENTRY_UPDATED, entry);
    changed++;
  }
  if (changed > 0) emit(Events.ENTRIES_CHANGED);
  return changed;
}

// Related entries
//
// Links are directional: an entry's `relatedEntryIds` lists the entries it
// points TO ("Links to"). The inverse — entries that point AT this one
// ("Linked from") — is computed on demand via `getBacklinks(id)`.

/**
 * Get entries that link TO the given id — the "Linked from" set.
 * Reads the stored `backlinks` field (kept in sync by create/update/delete
 * and self-healed on load via `rebuildBacklinks`).
 * @param {string} id
 * @returns {EntryDoc[]} sorted newest first
 */
export function getBacklinks(id) {
  if (!id) return [];
  const entry = _db.entries[id];
  if (!entry) return [];
  const result = [];
  for (const sourceId of entry.backlinks || []) {
    const source = _db.entries[sourceId];
    if (source) result.push(source);
  }
  return result.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

// Filtering

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

// Search

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

// Review / Resurface

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

// Reflections

/** Get a reflection by date string (YYYY-MM-DD). */
export function getReflection(date) {
  return _db.reflections[date] || null;
}

/** Save or update a daily reflection. */
export function saveReflection(date, content) {
  const existing = _db.reflections[date];

  if (existing) {
    existing.content = content;
  } else {
    _db.reflections[date] = { date, content };
  }

  persistReflection(date);
  emit(Events.REFLECTIONS_CHANGED);
  return _db.reflections[date];
}

/** Get all reflections sorted by date descending. */
export function getAllReflections() {
  return Object.values(_db.reflections).sort(
    (a, b) => b.date.localeCompare(a.date)
  );
}

// Stats

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

// Embeddings

/**
 * Load all embeddings from the adapter into memory.
 * Idempotent - subsequent calls are no-ops.
 */
export async function loadEmbeddings() {
  if (_embeddingsLoaded) return;
  if (_adapter?.loadEmbeddings) {
    try {
      _embeddings = (await _adapter.loadEmbeddings()) || {};
    } catch (err) {
      console.error("[Store] loadEmbeddings failed:", err);
      _embeddings = {};
    }
  }
  _embeddingsLoaded = true;
}

/** Get raw base64 embedding for an entry, or null. */
export function getEmbedding(id) {
  return _embeddings[id] || null;
}

/**
 * Wipe the in-memory embedding cache.
 * Use after adapter.clearEmbeddings() to keep memory in sync.
 * Does NOT touch persistent storage.
 */
export function clearEmbeddingCache() {
  _embeddings = {};
  _embeddingsLoaded = true;
}

/** Whether every entry currently has a cached embedding. */
export function embeddingCoverage() {
  const ids = Object.keys(_db.entries);
  const withVec = ids.filter((id) => _embeddings[id]).length;
  return { total: ids.length, indexed: withVec };
}

/**
 * Save an embedding for an entry. Persists via the adapter if available.
 * @param {string} entryId
 * @param {string} base64 - base64-encoded Float32Array
 * @param {string} model - the embedding model name
 */
export function setEmbedding(entryId, base64, model) {
  const entry = _db.entries[entryId];
  if (!entry) return;
  _embeddings[entryId] = base64;
  entry.embeddingModel = model || "";
  entry.embeddingUpdatedAt = now();
  if (_adapter?.persistEmbedding) {
    _adapter.persistEmbedding(entryId, base64).catch((err) =>
      console.error("[Store] persistEmbedding failed:", err)
    );
  }
  persistEntry(entryId);
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
}

/**
 * Apply AI enrichment fields (summary, tags, actionItems) to an entry.
 * Does NOT touch the embedding - use setEmbedding for that.
 */
export function applyEnrichment(entryId, { summary, tags, aiActionItems } = {}) {
  const entry = _db.entries[entryId];
  if (!entry) return null;
  if (typeof summary === "string") entry.summary = summary;
  if (Array.isArray(tags) && tags.length) {
    entry.tags = normalizeTags([...(entry.tags || []), ...tags]);
  }
  if (Array.isArray(aiActionItems)) entry.aiActionItems = aiActionItems;
  entry.updatedAt = now();
  persistEntry(entryId);
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
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
