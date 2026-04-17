/**
 * AI configuration storage.
 * Saves OpenAI-compatible endpoint settings in localStorage so the
 * API key never leaves the device. Configured via the AI settings modal.
 *
 * Works with any OpenAI-compatible v1 surface, including Azure OpenAI /
 * Foundry v1 (`https://{resource}.openai.azure.com/openai/v1`) — Azure's
 * v1 surface accepts `Authorization: Bearer {key}` and deployment names
 * in the `model` field, identical to the OpenAI SDK contract.
 *
 * Shape:
 *   {
 *     baseUrl:        string,  // e.g. "https://{resource}.openai.azure.com/openai/v1"
 *     apiKey:         string,
 *     chatModel:      string,  // OpenAI model name OR Azure deployment name
 *     embeddingModel: string,  // OpenAI model name OR Azure deployment name
 *     autoEnrich:     boolean  // auto tag/summary/embed on entry save
 *   }
 */

const CONFIG_KEY = "pkt_ai_config";

const DEFAULT_CONFIG = {
  baseUrl: "",
  apiKey: "",
  chatModel: "gpt-5.2",
  embeddingModel: "text-embedding-3-large",
  autoEnrich: true,
};

let _cached = null;

export function getAIConfig() {
  if (_cached) return _cached;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      _cached = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      return _cached;
    }
  } catch {
    // ignore parse errors
  }
  _cached = { ...DEFAULT_CONFIG };
  return _cached;
}

export function saveAIConfig(partial) {
  const next = { ...getAIConfig(), ...partial };
  // Normalize: strip trailing slash on baseUrl
  if (next.baseUrl) next.baseUrl = next.baseUrl.replace(/\/+$/, "");
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  _cached = next;
  return next;
}

export function clearAIConfig() {
  localStorage.removeItem(CONFIG_KEY);
  _cached = null;
}

export function isAIConfigured() {
  const cfg = getAIConfig();
  return !!(cfg.baseUrl && cfg.apiKey && cfg.chatModel && cfg.embeddingModel);
}

export function validateAIConfig(cfg) {
  const missing = [];
  if (!cfg.baseUrl?.trim()) missing.push("Base URL");
  if (!cfg.apiKey?.trim()) missing.push("API Key");
  if (!cfg.chatModel?.trim()) missing.push("Chat Model");
  if (!cfg.embeddingModel?.trim()) missing.push("Embedding Model");
  return { valid: missing.length === 0, missing };
}

export const AI_DEFAULTS = DEFAULT_CONFIG;
