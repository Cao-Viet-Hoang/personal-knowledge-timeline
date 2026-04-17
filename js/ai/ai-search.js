/**
 * AI-powered search and discovery utilities.
 * Combines store embeddings with the cosine-similarity math in embeddings.js
 * to produce ranked entry lists.
 */

import { getAllEntries, getEmbedding, loadEmbeddings } from "../store/store.js";
import { embed } from "./ai-client.js";
import { base64ToFloat, cosineSimilarity, topK } from "./embeddings.js";

/** Lazily ensure embeddings are loaded from the adapter. */
async function ensureLoaded() {
  await loadEmbeddings();
}

/** Build in-memory candidate list of decoded vectors. */
function candidates(excludeIds = new Set()) {
  const out = [];
  for (const entry of getAllEntries()) {
    if (excludeIds.has(entry.id)) continue;
    const b64 = getEmbedding(entry.id);
    if (!b64) continue;
    out.push({ id: entry.id, entry, vec: base64ToFloat(b64) });
  }
  return out;
}

/**
 * Semantic search: embed the query, then cosine-rank all cached vectors.
 * @param {string} query
 * @param {number} [k=20]
 * @param {number} [minScore=0.25]
 * @returns {Promise<Array<{entry:object, score:number}>>}
 */
export async function semanticSearch(query, k = 20, minScore = 0.25) {
  if (!query?.trim()) return [];
  await ensureLoaded();
  const [queryVec] = await embed(query);
  const cands = candidates();
  const ranked = topK(queryVec, cands, k, minScore);
  const byId = new Map(cands.map((c) => [c.id, c.entry]));
  return ranked.map((r) => ({ entry: byId.get(r.id), score: r.score }));
}

/**
 * Find entries most similar to a given one (for "Related entries").
 * Uses the stored vector of the source entry — no extra API call.
 * @param {string} entryId
 * @param {number} [k=5]
 * @param {number} [minScore=0.4]
 * @returns {Promise<Array<{entry:object, score:number}>>}
 */
export async function findSimilarToEntry(entryId, k = 5, minScore = 0.4) {
  await ensureLoaded();
  const sourceB64 = getEmbedding(entryId);
  if (!sourceB64) return [];
  const sourceVec = base64ToFloat(sourceB64);

  const cands = candidates(new Set([entryId]));
  const ranked = topK(sourceVec, cands, k, minScore);
  const byId = new Map(cands.map((c) => [c.id, c.entry]));
  return ranked.map((r) => ({ entry: byId.get(r.id), score: r.score }));
}

/**
 * Hybrid search: blend keyword score with semantic similarity.
 * @param {string} query
 * @param {Array<{id:string,_score:number}>} keywordResults — from searchEntries()
 * @param {number} [k=50]
 * @returns {Promise<Array<{entry:object, score:number, keywordScore:number, semanticScore:number}>>}
 */
export async function hybridSearch(query, keywordResults, k = 50) {
  if (!query?.trim()) return [];
  await ensureLoaded();

  let semanticRanked = [];
  try {
    semanticRanked = await semanticSearch(query, k * 2, 0);
  } catch {
    // If embedding fails (no API key / error), fall back to keyword only
    return keywordResults.slice(0, k).map((e) => ({
      entry: e,
      score: e._score || 0,
      keywordScore: e._score || 0,
      semanticScore: 0,
    }));
  }

  const semanticById = new Map(semanticRanked.map((r) => [r.entry.id, r.score]));
  const keywordById = new Map(keywordResults.map((e) => [e.id, e._score || 0]));

  // Normalize keyword scores to 0-1
  const maxKeyword = Math.max(1, ...keywordById.values());

  const ids = new Set([...semanticById.keys(), ...keywordById.keys()]);
  const entriesById = new Map(getAllEntries().map((e) => [e.id, e]));

  const blended = [];
  for (const id of ids) {
    const entry = entriesById.get(id);
    if (!entry) continue;
    const semanticScore = semanticById.get(id) || 0;
    const keywordScore = (keywordById.get(id) || 0) / maxKeyword;
    const score = semanticScore * 0.6 + keywordScore * 0.4;
    blended.push({ entry, score, keywordScore, semanticScore });
  }
  blended.sort((a, b) => b.score - a.score);
  return blended.slice(0, k);
}

/**
 * Detect possible duplicates for a candidate title/content.
 * Uses the most recent N entries' embeddings to avoid a fresh embed call
 * if not needed — but if no vectors exist yet, performs one fresh embed.
 * @param {string} text
 * @param {object} [options] - { excludeId, threshold=0.82, k=3 }
 * @returns {Promise<Array<{entry:object, score:number}>>}
 */
export async function findPossibleDuplicates(text, { excludeId, threshold = 0.82, k = 3 } = {}) {
  if (!text?.trim()) return [];
  await ensureLoaded();
  const [queryVec] = await embed(text);
  const cands = candidates(excludeId ? new Set([excludeId]) : new Set());
  const ranked = topK(queryVec, cands, k, threshold);
  const byId = new Map(cands.map((c) => [c.id, c.entry]));
  return ranked.map((r) => ({ entry: byId.get(r.id), score: r.score }));
}

/**
 * Re-rank an already-embedded vector against all cached vectors.
 * Synchronous — no API call. Useful for quick client-side exploration.
 */
export function rerankWithVector(queryVec, k = 20, minScore = 0.25) {
  const cands = candidates();
  const ranked = topK(queryVec, cands, k, minScore);
  const byId = new Map(cands.map((c) => [c.id, c.entry]));
  return ranked.map((r) => ({ entry: byId.get(r.id), score: r.score }));
}

export { cosineSimilarity };
