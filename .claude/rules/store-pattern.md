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
  load()                          // → Promise<{ entries, reflections, meta }> | null
  persist(db)                     // → Promise<void> (write full snapshot — store.js uses this)
  persistEntry(id, entry)         // → Promise<void> (write single entry)
  deleteEntry(id)                 // → Promise<void> (delete single entry)
  persistReflection(date, ref)    // → Promise<void> (write single reflection)
  deleteReflection(date)          // → Promise<void> (delete single reflection)
  persistMeta(meta)               // → Promise<void> (write meta)
  persistAll(db)                  // → Promise<void> (bulk write for seed/migration)
  clear()                         // → Promise<void> (wipe storage)

  // Embeddings — stored separately so vectors do not bloat the main snapshot
  // and do not hit the 1 MiB Firestore doc limit
  loadEmbeddings()                // → Promise<{ [entryId]: base64 }>
  persistEmbedding(id, base64)    // → Promise<void>
  deleteEmbedding(id)             // → Promise<void>
  clearEmbeddings()               // → Promise<void>
}
```

Do not add adapter-specific logic to `store.js`. If an adapter needs special behavior, handle it inside the adapter file.

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

### 8. ID Generation
- Entries: `e_001`, `e_002`, ... via `nextEntryId()`
- Reflections: `r_001`, `r_002`, ... via `nextReflectionId()`
- Always use the generator functions — never construct IDs manually

### 9. Embedding Cache
- Vectors live in a private `_embeddings` map keyed by entry id (base64 Float32).
- Populated by `loadEmbeddings()` once per session; subsequent calls are no-ops.
- Read via `getEmbedding(id)` / `embeddingCoverage()`; write via `setEmbedding(id, b64, modelName)`.
- `deleteEntry` automatically removes the vector and calls `adapter.deleteEmbedding`.
- Do not bundle vectors into the main snapshot — always go through the embedding-specific adapter methods.
