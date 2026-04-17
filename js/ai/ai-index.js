/**
 * Batch indexing — embed entries that don't yet have a vector.
 * Sends requests in small parallel batches with progress callbacks.
 */

import { embed } from "./ai-client.js";
import { floatToBase64, entryEmbeddingText } from "./embeddings.js";
import { getAllEntries, getEmbedding, setEmbedding } from "../store/store.js";
import { getAIConfig } from "./ai-config.js";

const BATCH_SIZE = 8;

/**
 * Enrich one entry with an embedding.
 * @param {object} entry
 */
export async function indexEntry(entry) {
  const cfg = getAIConfig();
  const text = entryEmbeddingText(entry);
  if (!text) return;
  const [vec] = await embed(text);
  setEmbedding(entry.id, floatToBase64(vec), cfg.embeddingModel);
}

/**
 * Index every entry that lacks a cached embedding.
 * @param {(progress:{done:number,total:number,skipped:number,errors:number}) => void} [onProgress]
 */
export async function indexAllMissing(onProgress) {
  const cfg = getAIConfig();
  const entries = getAllEntries();
  const needIndexing = entries.filter((e) => !getEmbedding(e.id));

  const progress = { done: 0, total: needIndexing.length, skipped: entries.length - needIndexing.length, errors: 0 };
  onProgress?.(progress);

  for (let i = 0; i < needIndexing.length; i += BATCH_SIZE) {
    const batch = needIndexing.slice(i, i + BATCH_SIZE);
    const texts = batch.map(entryEmbeddingText);
    try {
      const vecs = await embed(texts);
      batch.forEach((entry, idx) => {
        const v = vecs[idx];
        if (v) setEmbedding(entry.id, floatToBase64(v), cfg.embeddingModel);
      });
      progress.done += batch.length;
    } catch (err) {
      console.error("[AI] Batch embed failed:", err);
      progress.errors += batch.length;
    }
    onProgress?.(progress);
  }
  return progress;
}

/** Force re-index one specific entry (after edit). */
export async function reindexEntry(entry) {
  return indexEntry(entry);
}
