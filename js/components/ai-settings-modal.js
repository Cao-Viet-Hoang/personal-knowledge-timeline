/**
 * AI Settings modal.
 * Lets the user enter endpoint URL, API key, chat model, and embedding model.
 * Also provides maintenance actions (test, reindex, clear embeddings, tag merge).
 */

import { icon } from "../utils/icons.js";
import { getAIConfig, saveAIConfig, clearAIConfig, validateAIConfig } from "../ai/ai-config.js";

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderAISettingsModal(coverage = { total: 0, indexed: 0 }) {
  const cfg = getAIConfig();
  const pct = coverage.total > 0 ? Math.round((coverage.indexed / coverage.total) * 100) : 0;

  return `
    <div id="ai-settings-modal-backdrop" class="modal-backdrop open"></div>
    <div id="ai-settings-modal" class="modal modal--lg open" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">${icon("sparkles", 20)} AI Settings</h3>
        <button class="modal-close" data-close-ai-settings aria-label="Close">${icon("close")}</button>
      </div>
      <div class="modal-body ai-settings-body" id="ai-settings-body">
        <p class="ai-settings-intro">
          Configure an OpenAI-compatible endpoint. Your key is stored only in this browser (localStorage) and never leaves the device except when calling the endpoint you specify.
        </p>

        <section class="ai-section">
          <header class="ai-section-head">
            <h4 class="ai-section-title">Endpoint & credentials</h4>
            <p class="ai-section-desc">Must support <code>/chat/completions</code> and <code>/embeddings</code>.</p>
          </header>

          <div class="form-group">
            <label class="label" for="ai-base-url">Base URL <span class="fb-required">*</span></label>
            <input type="text" id="ai-base-url" class="input mono" spellcheck="false"
                   placeholder="https://{resource}.openai.azure.com/openai/v1" value="${esc(cfg.baseUrl)}" />
          </div>

          <div class="form-group">
            <label class="label" for="ai-api-key">API Key <span class="fb-required">*</span></label>
            <input type="password" id="ai-api-key" class="input mono" spellcheck="false"
                   placeholder="Your API key" value="${esc(cfg.apiKey)}" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="label" for="ai-chat-model">Chat model <span class="fb-required">*</span></label>
              <input type="text" id="ai-chat-model" class="input mono" spellcheck="false"
                     placeholder="gpt-5.2" value="${esc(cfg.chatModel)}" />
            </div>
            <div class="form-group">
              <label class="label" for="ai-embedding-model">Embedding model <span class="fb-required">*</span></label>
              <input type="text" id="ai-embedding-model" class="input mono" spellcheck="false"
                     placeholder="text-embedding-3-large" value="${esc(cfg.embeddingModel)}" />
            </div>
          </div>

          <div class="ai-test-block">
            <button type="button" class="btn btn-outline" id="ai-test-btn">
              ${icon("checkCircle", 16)} Test connection
            </button>
            <span id="ai-test-result" class="ai-test-result"></span>
          </div>
        </section>

        <section class="ai-section">
          <header class="ai-section-head">
            <h4 class="ai-section-title">Preferences</h4>
          </header>

          <label class="ai-toggle-row">
            <input type="checkbox" id="ai-auto-enrich" ${cfg.autoEnrich ? "checked" : ""} />
            <span class="ai-toggle-body">
              <span class="ai-toggle-title">Auto-enrich new entries</span>
              <span class="ai-toggle-desc">Each new or edited entry is analyzed in the background to generate summary, tags, and embeddings.</span>
            </span>
          </label>
        </section>

        <section class="ai-section">
          <header class="ai-section-head">
            <h4 class="ai-section-title">Embedding index</h4>
            <p class="ai-section-desc">Vectors power semantic search, duplicate detection, and RAG answers.</p>
          </header>

          <div class="ai-index-card">
            <div class="ai-index-summary">
              <div class="ai-index-summary-text">
                <strong id="ai-index-stats">${coverage.indexed} / ${coverage.total}</strong>
                <span>entries indexed</span>
                <span class="ai-progress-text" id="ai-progress-text"></span>
              </div>
              <div class="ai-index-coverage-bar" aria-hidden="true">
                <div class="ai-index-coverage-fill" id="ai-progress-fill" style="width:${pct}%"></div>
              </div>
            </div>

            <div class="ai-index-actions">
              <button type="button" class="btn btn-primary" id="ai-index-btn">
                ${icon("sparkles", 16)} Index missing
              </button>
              <button type="button" class="btn btn-outline" id="ai-reindex-all-btn">
                ${icon("refresh", 16)} Re-index all
              </button>
              <button type="button" class="btn btn-ghost" id="ai-clear-index-btn">
                ${icon("trash", 16)} Clear
              </button>
            </div>
          </div>
        </section>

        <section class="ai-section">
          <header class="ai-section-head">
            <h4 class="ai-section-title">Maintenance</h4>
            <p class="ai-section-desc">Cleanup helpers that run on demand.</p>
          </header>

          <div class="ai-maintenance-actions">
            <button type="button" class="btn btn-outline" id="ai-merge-tags-btn">
              ${icon("tag", 16)} Suggest tag merges
            </button>
          </div>
          <div id="ai-tag-merge-result" class="ai-tag-merge-result"></div>
        </section>

        <div class="fb-error" id="ai-settings-error" hidden></div>
      </div>
      <div class="modal-footer ai-settings-footer">
        <button type="button" class="btn btn-ghost ai-forget-btn" id="ai-forget-btn">Forget credentials</button>
        <div class="ai-settings-footer-actions">
          <button type="button" class="btn btn-outline" data-close-ai-settings>Cancel</button>
          <button type="button" class="btn btn-primary" id="ai-save-btn">Save changes</button>
        </div>
      </div>
    </div>
  `;
}

/** Read current form values. */
export function collectAISettings() {
  return {
    baseUrl: document.getElementById("ai-base-url")?.value.trim() || "",
    apiKey: document.getElementById("ai-api-key")?.value.trim() || "",
    chatModel: document.getElementById("ai-chat-model")?.value.trim() || "",
    embeddingModel: document.getElementById("ai-embedding-model")?.value.trim() || "",
    autoEnrich: document.getElementById("ai-auto-enrich")?.checked || false,
  };
}

export function showAISettingsError(msg) {
  const el = document.getElementById("ai-settings-error");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

export function hideAISettingsError() {
  const el = document.getElementById("ai-settings-error");
  if (el) el.hidden = true;
}

export function closeAISettingsModal() {
  document.getElementById("ai-settings-modal-backdrop")?.remove();
  document.getElementById("ai-settings-modal")?.remove();
}

export { saveAIConfig, clearAIConfig, validateAIConfig };
