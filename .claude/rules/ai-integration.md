# AI Integration Rules

The app calls an OpenAI-compatible endpoint **directly from the browser** with the user's own API key. There is no backend. Keys live in `localStorage` (`pkt_ai_config`) and never leave the device except when calling the configured endpoint.

## Module Layout

```
js/ai/
  ai-config.js     ← Endpoint/key/model config (localStorage-backed)
  ai-client.js     ← Low-level chat + embeddings HTTP wrapper
  ai-actions.js    ← High-level features (enrich, translate, digest, RAG, ...)
  ai-search.js     ← Semantic / hybrid / similarity search
  ai-index.js      ← Batch + per-entry embedding jobs
  embeddings.js    ← Vector math & base64 Float32 codec
```

Components never call `fetch` directly. They import high-level functions from `ai-actions.js` / `ai-search.js` / `ai-index.js`.

## Configuration Contract

`ai-config.js` exposes:
- `getAIConfig()` — returns `{ baseUrl, apiKey, chatModel, embeddingModel, autoEnrich }`
- `saveAIConfig(partial)` — merges and persists (strips trailing `/` on `baseUrl`)
- `clearAIConfig()` — wipes the stored key
- `isAIConfigured()` — truthy check on all four required fields
- `validateAIConfig(cfg)` — `{ valid, missing: string[] }`

The client targets the standard OpenAI-compatible v1 surface. `baseUrl` should point at an endpoint that accepts `POST /chat/completions` and `POST /embeddings` with `Authorization: Bearer {key}`.

Azure OpenAI / Foundry is supported via its **v1 surface** (`https://{resource}.openai.azure.com/openai/v1`) — that endpoint accepts Bearer auth and deployment names in the `model` field, identical to the OpenAI SDK contract, so no Azure-specific code path is needed. Users simply put the deployment name in `chatModel` / `embeddingModel`.

Every AI feature must early-exit when `isAIConfigured()` is false — either return gracefully or show the "AI not configured" empty state with a button that opens AI Settings.

## HTTP Client Rules

`ai-client.js` exports:
- `chatCompletion(messages, options)` — plain text completion
- `chatJson(messages, options)` — uses `response_format: { type: "json_object" }`
- `embed(input, options)` — returns `Float32Array[]`
- `testConnection()` — verifies chat + embeddings in one call

Do not hand-build the URL or headers elsewhere. All requests must flow through this module so that key handling, error formatting, and model-name overrides stay in one place.

Errors bubble up as `AINotConfiguredError` or `AIRequestError`. Callers should surface `err.message` to the user (truncated) rather than swallowing it.

## Embedding Storage

Embeddings are **separate** from entries because `text-embedding-3-large` produces 3072 floats (~12 KB encoded per entry) and would blow the 1 MiB Firestore doc limit.

Each entry has **exactly one** current vector. Vectors are encoded as base64(Float32Array) — see `embeddings.js` (`floatToBase64` / `base64ToFloat`).

Adapter methods (both `LocalAdapter` and `FirebaseAdapter`):
```js
loadEmbeddings()          // → Promise<{ [entryId]: base64 }>
persistEmbedding(id, b64) // → Promise<void>
deleteEmbedding(id)       // → Promise<void>
clearEmbeddings()         // → Promise<void>
```

- **LocalAdapter** uses a separate `embeddings` object store in IndexedDB.
- **FirebaseAdapter** uses a separate `pkt_embeddings` collection, one doc per entry.

Store-side API (`store.js`):
- `loadEmbeddings()` — call once during `bootApp()` to populate `_embeddings`
- `getEmbedding(id)` — returns base64 string or `null`
- `setEmbedding(entryId, base64, modelName)` — writes through adapter + tags entry with `embeddingModel` / `embeddingUpdatedAt`
- `embeddingCoverage()` — `{ total, indexed }` for the Settings modal
- `applyEnrichment(entryId, { summary, tags, aiActionItems })` — merges AI-derived fields onto an entry without touching its vector

`deleteEntry` automatically drops the corresponding embedding and calls `adapter.deleteEmbedding(id)`.

## Feature Rules

1. **Zero-dependency rule still applies** — no SDKs, no npm packages. Only browser-native `fetch`, `Uint8Array`, `btoa`/`atob`.
2. **All prompts and generated output are English** — system prompts and user-turn prompts in `ai-actions.js` MUST be written in English, and the model MUST reply in English regardless of the source entry's language. The only exception is `translateText(text, targetLang)`, which honors the explicit target language chosen by the user (English or Vietnamese). Do not add "preserve the user's language" or "reply in the same language" clauses to any other action — if the user wants a Vietnamese output, they trigger the Translate → Vietnamese action explicitly.
3. **Never call the endpoint from a component** — go through `ai-actions.js` or `ai-search.js`.
4. **Guard async races** — views with free-text input (Search, Ask) must use a monotonic token (`searchToken++`) to ignore stale results.
5. **Hybrid scoring** — default when AI is configured: 60% semantic + 40% keyword. Fall back to pure keyword if semantic or hybrid throws.
6. **Synchronous enrichment on save** — `app.js` runs the AI pipeline **before** the entry is persisted so the store receives tags, summary, and embedding in a single write. The flow is:
   - `computeAIPlan` decides `shouldEnrich` + `shouldEmbed` (edits skip steps whose inputs did not change).
   - `runAIStepsForDraft` calls `enrichEntry` (if needed), then `embed` on the enriched draft text.
   - `persistCommitted` then calls `createEntry` / `updateEntry` and, when embedding succeeded, `setEmbedding`.
   - Both the form (`handleSaveEntry`) and quick capture (`handleQuickCapture`) use the same `runEntryAIPipeline` + `persistCommitted` helpers.
   - Form path: on AI failure the entry is **not** saved — the modal shows the error plus a "Save without AI" escape-hatch button that retries with `skipAI: true`.
   - Quick capture path: on AI failure the entry is still created (without embedding) so the user is not blocked; the error is logged.
   - All paths silently no-op the AI steps when AI is not configured.
7. **URL parsing uses `r.jina.ai`** — the only external non-AI dependency. No key required, CORS-enabled.

## Duplicate Detection

Entry form fires `runDuplicateCheck()` after each AI action. Threshold is 0.82 cosine similarity. Warnings are in-form (`#duplicate-warning-group`), not modals, so the user can dismiss them.

## Adding a New AI Feature

1. Add the feature function to `ai-actions.js` (prompt + `chatJson` or `chatCompletion` call).
2. If it needs retrieval, use `semanticSearch` from `ai-search.js` — never re-roll the math.
3. If it needs a new event, add it to `event-bus.js` and document it in `rules/store-pattern.md`.
4. Wire the UI via a `data-ai-action` attribute and handle it in `app.js#runFormAIAction` OR via a dedicated view (`ask-view.js` style).
5. Always early-exit on `!isAIConfigured()` and show a friendly message.
