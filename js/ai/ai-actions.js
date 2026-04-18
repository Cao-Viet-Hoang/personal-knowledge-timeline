/**
 * High-level AI actions used by components.
 * Each function returns a plain JS value (string, array, object) or throws.
 *
 * These are pure wrappers around the AI client — no store mutations here.
 * Components call these, then push the result back to the store.
 */

import { chatCompletion, chatJson } from "./ai-client.js";

// ── System prompt ──────────────────────────────────────

const LANG_NAMES = { en: "English", vi: "Vietnamese" };

/** Normalize a free-form language option into a known language name. */
function langName(lang) {
  const key = typeof lang === "string" ? lang.toLowerCase() : "";
  return LANG_NAMES[key] || LANG_NAMES.en;
}

function systemPromptFor(lang) {
  return (
    "You are an assistant embedded in a personal knowledge timeline app. " +
    "Answer concisely, never invent information, " +
    `and always respond in ${langName(lang)} regardless of the input language.`
  );
}

function sys(extra = "", lang = "en") {
  const base = systemPromptFor(lang);
  return { role: "system", content: extra ? `${base} ${extra}` : base };
}

function user(content) {
  return { role: "user", content };
}

function entryAsContext(entry) {
  const lines = [];
  if (entry.title) lines.push(`Title: ${entry.title}`);
  if (entry.type) lines.push(`Type: ${entry.type}`);
  if (entry.sourceUrl) lines.push(`Source: ${entry.sourceUrl}`);
  if (entry.excerpt) lines.push(`Excerpt: ${entry.excerpt}`);
  if (entry.content) lines.push(`Content: ${entry.content}`);
  if (entry.myNote) lines.push(`My note: ${entry.myNote}`);
  if (entry.tags?.length) lines.push(`Tags: ${entry.tags.join(", ")}`);
  return lines.join("\n");
}

// ── Enrichment helpers ─────────────────────────────────

/**
 * Auto-generate tags, summary, type, and title from the entry content.
 * Returns an object that can be merged onto the entry.
 * @param {object} entry
 * @param {{language?: "en"|"vi"}} [options]
 * @returns {Promise<{tags:string[], summary:string, suggestedType:string, suggestedTitle:string}>}
 */
export async function enrichEntry(entry, { language = "en" } = {}) {
  const ctx = entryAsContext(entry);
  const ln = langName(language);
  const prompt = `Analyze this knowledge entry and respond with JSON:\n\n${ctx}\n\n` +
    `Return a JSON object with these keys:\n` +
    `- "tags": array of 3-6 lowercase, single-word (or hyphenated) topical tags in ${ln}\n` +
    `- "summary": 1-2 sentence summary in ${ln}\n` +
    `- "suggestedType": one of "link" | "note" | "thought" | "quote"\n` +
    `- "suggestedTitle": a concise title in ${ln} (only if the current title is empty or a raw URL)\n`;

  const result = await chatJson([sys("Return ONLY valid JSON.", language), user(prompt)], {
    temperature: 0.2,
  });
  return {
    tags: Array.isArray(result.tags) ? result.tags.slice(0, 8).map(String) : [],
    summary: typeof result.summary === "string" ? result.summary.trim() : "",
    suggestedType: typeof result.suggestedType === "string" ? result.suggestedType : "",
    suggestedTitle: typeof result.suggestedTitle === "string" ? result.suggestedTitle.trim() : "",
  };
}

/** Generate tags only (faster, cheaper). */
export async function generateTags(entry, { language = "en" } = {}) {
  const ctx = entryAsContext(entry);
  const ln = langName(language);
  const result = await chatJson(
    [
      sys("Return ONLY valid JSON.", language),
      user(`Generate 3-6 short, lowercase topical tags in ${ln} for this entry. Return JSON { "tags": [...] }.\n\n${ctx}`),
    ],
    { temperature: 0.2 }
  );
  return Array.isArray(result.tags) ? result.tags.map(String) : [];
}

/** Generate a concise title from content. */
export async function generateTitle(entry, { language = "en" } = {}) {
  const ctx = entryAsContext(entry);
  const ln = langName(language);
  return (await chatCompletion(
    [
      sys("Reply with a single short title, no quotes, no trailing period.", language),
      user(`Suggest a concise title in ${ln} (max 10 words) for this entry:\n\n${ctx}`),
    ],
    { temperature: 0.4, maxTokens: 60 }
  )).trim().replace(/^["']|["']$/g, "");
}

/** Generate a 1-2 sentence summary. */
export async function generateSummary(entry, { language = "en" } = {}) {
  const ctx = entryAsContext(entry);
  const ln = langName(language);
  return (await chatCompletion(
    [
      sys("", language),
      user(`Summarize this entry in 1-2 sentences in ${ln}:\n\n${ctx}`),
    ],
    { temperature: 0.3, maxTokens: 200 }
  )).trim();
}

/** Expand a short thought into a fuller paragraph. */
export async function expandContent(text, { tone = "neutral", language = "en" } = {}) {
  const ln = langName(language);
  return (await chatCompletion(
    [
      sys(`Expand without inventing facts.`, language),
      user(`Expand this short note into a clearer paragraph in ${ln} (${tone} tone):\n\n${text}`),
    ],
    { temperature: 0.5 }
  )).trim();
}

/** Translate text to a target language. */
export async function translateText(text, targetLang) {
  return (await chatCompletion(
    [
      sys("Translate faithfully, no added commentary."),
      user(`Translate to ${targetLang}:\n\n${text}`),
    ],
    { temperature: 0.2 }
  )).trim();
}

/** Extract action items hidden in a thought. */
export async function extractActionItems(entry) {
  const ctx = entryAsContext(entry);
  const result = await chatJson(
    [
      sys("Return ONLY valid JSON."),
      user(`Identify concrete action items in this entry. Return JSON { "actions": ["...", "..."] } or { "actions": [] } if none.\n\n${ctx}`),
    ],
    { temperature: 0.2 }
  );
  return Array.isArray(result.actions) ? result.actions.map(String) : [];
}

// ── Higher-level features ──────────────────────────────

/** Weekly/monthly digest — summarize a set of entries. */
export async function generateDigest(entries, { period = "week" } = {}) {
  const compact = entries.slice(0, 40).map((e, i) => {
    const txt = e.summary || e.excerpt || e.content || e.myNote || "";
    return `[${i + 1}] (${e.type}) ${e.title}${txt ? " — " + txt.slice(0, 240) : ""}`;
  }).join("\n");
  return (await chatCompletion(
    [
      sys(""),
      user(
        `Write a ${period}ly digest from these ${entries.length} entries. ` +
        `Group by theme, highlight 3-5 key insights, end with 1 question for reflection. ` +
        `Use bullet points. Reply in English.\n\n${compact}`
      ),
    ],
    { temperature: 0.5 }
  )).trim();
}

/** Synthesize multiple entries into a cohesive note. */
export async function synthesizeEntries(entries, { goal = "a cohesive summary" } = {}) {
  const compact = entries.slice(0, 30).map((e) => {
    return `## ${e.title}\n${e.excerpt || e.content || e.myNote || ""}`;
  }).join("\n\n");
  return (await chatCompletion(
    [
      sys(""),
      user(`Combine these entries into ${goal}. Reply in English.\n\n${compact}`),
    ],
    { temperature: 0.5 }
  )).trim();
}

/** Detect repeating themes across recent entries. */
export async function detectPatterns(entries) {
  const compact = entries.slice(0, 60).map((e, i) => `[${i + 1}] ${e.title}`).join("\n");
  const result = await chatJson(
    [
      sys("Return ONLY valid JSON."),
      user(
        `From these entry titles, identify 3-5 recurring themes. Return JSON ` +
        `{ "patterns": [{ "theme": "...", "description": "...", "examples": [1, 3] }] } ` +
        `where examples reference entry indices.\n\n${compact}`
      ),
    ],
    { temperature: 0.3 }
  );
  return Array.isArray(result.patterns) ? result.patterns : [];
}

/** Suggest a reflection prompt based on recent entries. */
export async function generateReflectionPrompt(entries) {
  const compact = entries.slice(0, 20).map((e) => `- ${e.title}`).join("\n");
  return (await chatCompletion(
    [
      sys("Ask a single open-ended reflection question in English."),
      user(`Given these recent entries, ask a thoughtful reflection question:\n\n${compact}`),
    ],
    { temperature: 0.7, maxTokens: 120 }
  )).trim();
}

/** Suggest groups of duplicate/equivalent tags to merge. */
export async function suggestTagMerges(tags) {
  if (tags.length < 2) return [];
  const result = await chatJson(
    [
      sys("Return ONLY valid JSON."),
      user(
        `Group these tags into clusters of semantic duplicates (e.g. js/javascript/JS). ` +
        `Return JSON { "groups": [{ "canonical": "...", "aliases": ["..."] }] }. ` +
        `Only include groups that actually have aliases to merge.\n\n${tags.join(", ")}`
      ),
    ],
    { temperature: 0.1 }
  );
  return Array.isArray(result.groups) ? result.groups : [];
}

/** Ask a question with RAG context from the user's entries. */
export async function askWithContext(question, contextEntries) {
  const context = contextEntries.map((e, i) => {
    const txt = e.summary || e.excerpt || e.content || e.myNote || "";
    return `[${i + 1}] "${e.title}"\n${txt.slice(0, 800)}`;
  }).join("\n\n");

  return (await chatCompletion(
    [
      sys(
        "You have access to excerpts from the user's own notes (below). " +
        "Answer based on those excerpts and cite them like [1], [2]. " +
        "If the notes don't contain the answer, say so."
      ),
      user(`Notes:\n${context}\n\nQuestion: ${question}`),
    ],
    { temperature: 0.3 }
  )).trim();
}

/** Chat with a single entry (multi-turn). */
export async function chatWithEntry(entry, history, newQuestion) {
  const messages = [
    sys(
      "You are discussing ONE specific note with the user. The full note is below. " +
      "Answer questions about it, help the user think through it, or extend it."
    ),
    user(`Note:\n${entryAsContext(entry)}`),
    ...history.map((m) => ({ role: m.role, content: m.content })),
    user(newQuestion),
  ];
  return (await chatCompletion(messages, { temperature: 0.5 })).trim();
}

// ── URL parsing via r.jina.ai (free CORS-enabled reader) ─────

/**
 * Fetch a readable version of a URL using r.jina.ai (no API key required).
 * Then ask the model to extract title, excerpt, and suggested tags.
 * @param {string} url
 * @returns {Promise<{title:string, excerpt:string, content:string, tags:string[]}>}
 */
export async function parseUrl(url, { language = "en" } = {}) {
  const readerUrl = `https://r.jina.ai/${url}`;
  let page = "";
  try {
    const res = await fetch(readerUrl);
    if (res.ok) page = await res.text();
  } catch {
    // ignore — fall through with empty page
  }

  if (!page) {
    throw new Error("Could not fetch URL content. Try pasting the text manually.");
  }

  const ln = langName(language);
  const trimmed = page.slice(0, 8000);
  const result = await chatJson(
    [
      sys("Return ONLY valid JSON.", language),
      user(
        `From this webpage content, extract (all text values in ${ln}):\n` +
        `{ "title": "...", "excerpt": "1-2 sentence summary", "tags": [3-5 lowercase tags] }\n\n` +
        trimmed
      ),
    ],
    { temperature: 0.2 }
  );

  return {
    title: result.title || "",
    excerpt: result.excerpt || "",
    content: trimmed.slice(0, 2000),
    tags: Array.isArray(result.tags) ? result.tags.map(String) : [],
  };
}
