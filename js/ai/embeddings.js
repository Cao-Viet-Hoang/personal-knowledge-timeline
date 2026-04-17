/**
 * Embedding utilities — binary encoding and similarity math.
 *
 * Vectors are stored as base64-encoded Float32Array to save ~50% space
 * vs. storing a plain JSON number array. A 3072-dim vector from
 * text-embedding-3-large becomes ~16KB base64 instead of ~30KB JSON.
 */

/**
 * Encode a Float32Array to a base64 string.
 * @param {Float32Array} vec
 * @returns {string}
 */
export function floatToBase64(vec) {
  const bytes = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Decode a base64 string back into a Float32Array.
 * @param {string} b64
 * @returns {Float32Array}
 */
export function base64ToFloat(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

/**
 * Return a unit-length copy of the vector.
 * @param {Float32Array} vec
 * @returns {Float32Array}
 */
export function normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec.slice();
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/**
 * Cosine similarity between two vectors (expects same length).
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} — similarity in [-1, 1]
 */
export function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i], bv = b[i];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Find the top-K candidates by cosine similarity to a query vector.
 * @param {Float32Array} queryVec
 * @param {Array<{id:string, vec:Float32Array}>} candidates
 * @param {number} k
 * @param {number} [minScore=0] - drop candidates below this similarity
 * @returns {Array<{id:string, score:number}>}
 */
export function topK(queryVec, candidates, k = 10, minScore = 0) {
  const scored = [];
  for (const c of candidates) {
    if (!c.vec) continue;
    const score = cosineSimilarity(queryVec, c.vec);
    if (score >= minScore) scored.push({ id: c.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/**
 * Build the canonical text that we embed for an entry.
 * Combines title + tags + excerpt + content + note so that semantic
 * search hits on any of these fields.
 * @param {object} entry
 * @returns {string}
 */
export function entryEmbeddingText(entry) {
  const parts = [
    entry.title || "",
    (entry.tags || []).join(" "),
    entry.excerpt || "",
    entry.content || "",
    entry.myNote || "",
    entry.summary || "",
  ].filter(Boolean);
  // Cap length to keep token usage predictable
  return parts.join("\n\n").slice(0, 8000);
}
