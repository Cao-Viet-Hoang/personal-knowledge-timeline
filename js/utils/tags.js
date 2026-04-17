/**
 * Tag helpers — shared normalization used by the entry pipeline and the store.
 */

/**
 * Normalize an array of tags: lowercase, trim, drop empty, de-duplicate (stable order).
 * @param {(string|null|undefined)[]} tags
 * @returns {string[]}
 */
export function normalizeTags(tags) {
  const out = [];
  const seen = new Set();
  for (const raw of tags || []) {
    const cleaned = String(raw || "").toLowerCase().trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}
