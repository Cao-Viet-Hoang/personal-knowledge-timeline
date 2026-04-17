/**
 * AI client — wraps chat + embeddings endpoints for any OpenAI-compatible API.
 *
 * All requests use fetch() directly from the browser with the user's API key
 * stored in localStorage. No backend server is required.
 */

import { getAIConfig, isAIConfigured } from "./ai-config.js";

/** Thrown when the user hasn't set up AI yet. */
export class AINotConfiguredError extends Error {
  constructor() {
    super("AI is not configured. Open AI Settings to add your API key.");
    this.name = "AINotConfiguredError";
  }
}

/** Thrown for non-2xx HTTP responses. */
export class AIRequestError extends Error {
  constructor(status, body) {
    super(`AI request failed (${status}): ${body}`);
    this.name = "AIRequestError";
    this.status = status;
  }
}

function requireConfig() {
  if (!isAIConfigured()) throw new AINotConfiguredError();
  return getAIConfig();
}

async function postJson(cfg, path, body, signal) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AIRequestError(res.status, text.slice(0, 500));
  }
  return res.json();
}

/**
 * Chat completion (non-streaming).
 * @param {Array<{role:string,content:string}>} messages
 * @param {object} [options] - { model, temperature, jsonMode, signal }
 * @returns {Promise<string>} assistant message content
 */
export async function chatCompletion(messages, options = {}) {
  const cfg = requireConfig();
  const body = {
    model: options.model || cfg.chatModel,
    messages,
  };
  // NOTE: `temperature` is intentionally NOT forwarded.
  // GPT-5 and o-series models only accept the default (1) and 400 on any
  // other value. Default sampling is fine for our enrichment use cases,
  // especially combined with `response_format: json_object` for structured
  // outputs. Callers can still pass the option — it is simply ignored.
  if (options.jsonMode) body.response_format = { type: "json_object" };
  // Newer models require `max_completion_tokens`; legacy `max_tokens` is rejected.
  if (options.maxTokens) body.max_completion_tokens = options.maxTokens;

  const json = await postJson(cfg, "/chat/completions", body, options.signal);
  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * Chat completion that expects a JSON response.
 * Enables JSON mode and parses the result.
 * @param {Array} messages
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function chatJson(messages, options = {}) {
  const text = await chatCompletion(messages, { ...options, jsonMode: true });
  try {
    return JSON.parse(text);
  } catch {
    // Attempt to extract the first JSON block if the model added prose
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fallthrough */ }
    }
    throw new Error(`AI did not return valid JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * Embed one or many texts.
 * @param {string|string[]} input
 * @param {object} [options] - { model, signal }
 * @returns {Promise<Float32Array[]>}
 */
export async function embed(input, options = {}) {
  const cfg = requireConfig();
  const inputs = Array.isArray(input) ? input : [input];

  const body = {
    model: options.model || cfg.embeddingModel,
    input: inputs,
  };

  const json = await postJson(cfg, "/embeddings", body, options.signal);
  return (json.data || []).map((d) => Float32Array.from(d.embedding));
}

/**
 * Connection test: fire a minimal chat + embedding request to verify credentials.
 * @returns {Promise<{ok:boolean, chatOk:boolean, embedOk:boolean, error?:string}>}
 */
export async function testConnection() {
  const result = { ok: false, chatOk: false, embedOk: false };
  try {
    await chatCompletion([{ role: "user", content: "ping" }], { maxTokens: 5 });
    result.chatOk = true;
  } catch (err) {
    result.error = `Chat failed: ${err.message}`;
    return result;
  }
  try {
    await embed("ping");
    result.embedOk = true;
  } catch (err) {
    result.error = `Embedding failed: ${err.message}`;
    return result;
  }
  result.ok = true;
  return result;
}
