/**
 * Tag helpers — shared normalization used by the entry pipeline and the store.
 */

/**
 * Strip Vietnamese diacritics from a string.
 * Maps all accented Vietnamese characters to their ASCII base letter.
 * @param {string} str
 * @returns {string}
 */
function removeVietnameseDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // remove combining diacritical marks
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Normalize an array of tags: strip diacritics, lowercase, replace spaces with hyphens,
 * trim, drop empty, de-duplicate (stable order).
 * @param {(string|null|undefined)[]} tags
 * @returns {string[]}
 */
export function normalizeTags(tags) {
  const out = [];
  const seen = new Set();
  for (const raw of tags || []) {
    const cleaned = removeVietnameseDiacritics(String(raw || ""))
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-");
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}
