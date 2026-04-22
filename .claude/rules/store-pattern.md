---
description: Rules for working with the data store, adapters, and event system
globs: ["js/store/**/*.js", "js/app.js"]
---

# Store & Data Layer Rules

## Store Architecture

```
Components (read) ──→ store.js (CRUD, filter, search) ──→ adapter (persist)
                         ↓
                    event-bus.js (emit)
                         ↓
                    app.js (listen → re-render)
```

## Rules

### 1. Store is the Single Source of Truth

- All data lives in the private `_db` object inside `store.js`
- Components NEVER hold their own data — they read from the store
- Do not import `_db` directly — use exported functions (`getEntry`, `getAllEntries`, `filterEntries`)

### 2. Mutations Go Through Store Functions

```js
// Correct — use store functions
import { createEntry, updateEntry, deleteEntry } from "./store/store.js";
createEntry({ type: "note", title: "My note" });

// WRONG — never mutate _db directly from outside
_db.entries[id] = { ... };
```

### 3. Always Emit Events After Mutations

Every store function that modifies data must:

1. Update `_db`
2. Call the appropriate incremental persist function (`persistEntry`, `persistMeta`, etc.)
3. Emit the specific event (`ENTRY_CREATED`, `ENTRY_UPDATED`, `ENTRY_DELETED`)
4. Emit `ENTRIES_CHANGED` for general listeners

```js
export function myMutation(id, data) {
  const entry = _db.entries[id];
  if (!entry) return null;
  Object.assign(entry, data, { updatedAt: now() });
  persistEntry(id);
  emit(Events.ENTRY_UPDATED, entry);
  emit(Events.ENTRIES_CHANGED);
  return entry;
}
```

### 4. Adapter Interface

Adapters must implement these methods:

```js
{
  load(); // → Promise<{ entries, reflections, meta }> | null
  persist(db); // → Promise<void> (write full snapshot — store.js uses this)
  persistEntry(id, entry); // → Promise<void> (write single entry)
  deleteEntry(id); // → Promise<void> (delete single entry)
  persistReflection(date, ref); // → Promise<void> (write single reflection)
  deleteReflection(date); // → Promise<void> (delete single reflection)
  persistMeta(meta); // → Promise<void> (write meta)
  persistAll(db); // → Promise<void> (bulk write for imports/migrations)
  clear(); // → Promise<void> (wipe storage)

  // Embeddings — stored separately so vectors do not bloat the main snapshot
  // and do not hit the 1 MiB Firestore doc limit
  loadEmbeddings(); // → Promise<{ [entryId]: base64 }>
  persistEmbedding(id, base64); // → Promise<void>
  deleteEmbedding(id); // → Promise<void>
  clearEmbeddings(); // → Promise<void>
}
```

Do not add adapter-specific logic to `store.js`. If an adapter needs special behavior, handle it inside the adapter file.

Store initialization must stay adapter-agnostic:

- `initStore()` first tries `adapter.load()`
- After loading: `normalizeAllEntries()` → `rebuildBacklinks()` → `backfillTicketNumbers()`
- If storage is empty, the app stays empty in both dev and prod
- Do not auto-seed dev with sample data

**LocalAdapter** uses IndexedDB with individual object stores for entries, reflections, and meta. Auto-migrates from legacy localStorage on first load.

**FirebaseAdapter** uses Firestore sub-collections (`entries/{id}`, `reflections/{date}`, `meta/config`). Auto-migrates from legacy single-doc format (`pkt/store`) on first load.

### 5. Event Bus Usage

```js
import { emit, listen, Events } from "./store/event-bus.js";

// Emitting (inside store.js only)
emit(Events.ENTRIES_CHANGED);
emit(Events.ENTRY_CREATED, entry);

// Listening (in app.js or components)
listen(Events.ENTRIES_CHANGED, () => render());
```

Available events:

- `ENTRY_CREATED`, `ENTRY_UPDATED`, `ENTRY_DELETED`
- `ENTRIES_CHANGED` (general — fired after any entry mutation)
- `REFLECTIONS_CHANGED`

### 6. Adding New Store Functions

When adding new data operations:

1. Add the function to `store.js` with JSDoc
2. Export it explicitly (named export, not default)
3. Follow the persist + emit pattern
4. Import it in `app.js` where needed
5. Never add side effects beyond persist and emit

### 7. Search and Filter

- `filterEntries(criteria)` accepts: `type`, `status`, `starred`, `tag`, `dateFrom`, `dateTo`
- `searchEntries(query)` does full-text search with weighted scoring
- Both return sorted arrays (newest first / highest score first)
- Adding a new filter criterion: add it to the `filterEntries` function, update the filter UI in `filters.js`

### 7a. Bulk Tag Operations

- `mergeTags(canonical, aliases)` rewrites every entry that contains any alias: alias tags are removed, canonical is added (deduped), aliases equal to the canonical are ignored. Returns the count of modified entries. Emits `ENTRY_UPDATED` per modified entry plus a single trailing `ENTRIES_CHANGED`.
- Use this whenever you replace a tag across the whole dataset (e.g. AI Settings → Suggest tag merges). Do not hand-roll a loop of `removeTag`/`addTag` calls — that produces one `ENTRIES_CHANGED` per swap and forces the timeline to re-render repeatedly.

### 7b. Entry Links (Directional, Mirrored)

Entries have **two** link fields, kept in sync by the store:

| Field             | Meaning                                | Written by                                              |
|-------------------|----------------------------------------|---------------------------------------------------------|
| `relatedEntryIds` | Outgoing — entries this one points TO  | The owning entry's form ("Links to" UI)                 |
| `backlinks`       | Incoming — entries that point AT this  | Auto-mirrored by `createEntry`/`updateEntry`/`deleteEntry` |

**Why both?** `backlinks` is a denormalized index so `getBacklinks(id)` is O(1) — important once entries are loaded progressively, since a scan would have to fetch the whole dataset just to compute "Linked from".

**Invariants the store enforces (do not bypass):**

- A user (form, code) only writes `relatedEntryIds`. The matching `backlinks` updates happen automatically inside `createEntry` / `updateEntry` / `deleteEntry`.
- Self-refs (`entry.relatedEntryIds.includes(entry.id)`) and dangling refs (target not in `_db.entries`) are filtered out at write time.
- `deleteEntry` uses the stored `backlinks` to strip itself from every source entry's `relatedEntryIds` and the stored `relatedEntryIds` to strip itself from every target's `backlinks`. No full-table scan.
- `loadFromAdapter` runs `rebuildBacklinks()` after `normalizeAllEntries()`. This:
  1. Backfills `backlinks` for entries created before the field existed.
  2. Self-heals any drift if a write path ever forgot to mirror.
  3. Only persists entries whose `backlinks` set actually changed, so steady-state boots write nothing.

**Reading:**

- `getBacklinks(id)` returns the entries listed in `entry.backlinks`, sorted newest first. Do not re-scan `_db.entries` for backlinks anywhere else — always go through `getBacklinks`.

**Adding a new code path that writes links:**

If you ever need to mutate `relatedEntryIds` outside the existing CRUD functions, you **must** mirror the change onto the affected `backlinks` arrays in the same operation, persist all touched entries, and emit `ENTRY_UPDATED` for each. Easier: route through `updateEntry({ relatedEntryIds: ... })` which already handles all of this.

Do not reintroduce bidirectional helpers like `linkEntries` / `unlinkEntries` — they conflate mirroring (a storage concern) with bidirectional intent (a user concern), and would silently make links symmetric.

### 8. ID Generation

- Entries use `crypto.randomUUID()` via the internal `generateId()` function
- Reflections are keyed by date string (`YYYY-MM-DD`) — no generated ID needed
- The `meta` object stores app-wide counters — currently `nextTicketNumber` (see §8a)

### 8a. Ticket Numbers

Every entry has a human-readable `ticketNumber` (integer) displayed as `#1`, `#2`, etc. in the UI (Azure DevOps work-item style).

- **Counter** lives in `_db.meta.nextTicketNumber`. `getNextTicketNumber()` reads it, increments, and persists meta.
- **`createEntry()`** automatically assigns the next ticket number. If `data.ticketNumber` is already provided (e.g., import), it is used as-is.
- **Backfill migration** (`backfillTicketNumbers()`): runs once on boot after `normalizeAllEntries()` + `rebuildBacklinks()`. If any entry has `ticketNumber === null`, sorts ALL entries by `createdAt` ascending and assigns `#1, #2, …`. Subsequent boots skip it (idempotent).
- **Lookup**: `getEntryByTicketNumber(num)` scans `_db.entries` and returns the matching entry or `null`.
- **UI**: displayed on entry cards, detail view header, link-to dropdown items, link-to chips, and related-entry items in detail view.
- **Link-to search**: the related-entries search in the entry form matches both title (substring) and ticket number (exact `#N` or `N`).

### 9. Embedding Cache

- Vectors live in a private `_embeddings` map keyed by entry id (base64 Float32).
- Populated by `loadEmbeddings()` once per session; subsequent calls are no-ops.
- Read via `getEmbedding(id)` / `embeddingCoverage()`; write via `setEmbedding(id, b64, modelName)`.
- `deleteEntry` automatically removes the vector and calls `adapter.deleteEmbedding`.
- Do not bundle vectors into the main snapshot — always go through the embedding-specific adapter methods.
