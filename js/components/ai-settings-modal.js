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

  return `
    <div id="ai-settings-modal-backdrop" class="modal-backdrop open"></div>
    <div id="ai-settings-modal" class="modal modal--lg open" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">${icon("sparkles", 20)} AI Settings</h3>
        <button class="modal-close" data-close-ai-settings aria-label="Close">${icon("close")}</button>
      </div>
      <div class="modal-body" id="ai-settings-body">
        <p class="ai-settings-desc">
          Configure an OpenAI-compatible endpoint. Your key is stored only in this browser (localStorage) and never leaves the device except when calling the endpoint you specify.
        </p>

        <div class="form-group">
          <label class="label" for="ai-base-url">Endpoint Base URL <span class="fb-required">*</span></label>
          <input type="text" id="ai-base-url" class="input mono" spellcheck="false"
                 placeholder="https://{resource}.openai.azure.com/openai/v1" value="${esc(cfg.baseUrl)}" />
          <span class="form-hint">Must support <code>/chat/completions</code> and <code>/embeddings</code>.</span>
        </div>

        <div class="form-group">
          <label class="label" for="ai-api-key">API Key <span class="fb-required">*</span></label>
          <input type="password" id="ai-api-key" class="input mono" spellcheck="false"
                 placeholder="Your API key" value="${esc(cfg.apiKey)}" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="label" for="ai-chat-model">Chat Model / Deployment <span class="fb-required">*</span></label>
            <input type="text" id="ai-chat-model" class="input mono" spellcheck="false"
                   placeholder="gpt-5.2" value="${esc(cfg.chatModel)}" />
          </div>
          <div class="form-group">
            <label class="label" for="ai-embedding-model">Embedding Model / Deployment <span class="fb-required">*</span></label>
            <input type="text" id="ai-embedding-model" class="input mono" spellcheck="false"
                   placeholder="text-embedding-3-large" value="${esc(cfg.embeddingModel)}" />
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-row">
            <input type="checkbox" id="ai-auto-enrich" ${cfg.autoEnrich ? "checked" : ""} />
            <span>Auto-enrich new entries (summary, tags, embedding)</span>
          </label>
          <span class="form-hint">When enabled, each new or edited entry is analyzed by AI in the background.</span>
        </div>

        <div class="ai-test-block">
          <button type="button" class="btn btn-outline" id="ai-test-btn">
            ${icon("checkCircle", 16)} Test connection
          </button>
          <span id="ai-test-result" class="ai-test-result"></span>
        </div>

        <hr class="separator" />

        <div class="detail-section-title">Embedding Index</div>
        <div class="ai-index-block">
          <div class="ai-index-stats">
            <strong id="ai-index-stats">${coverage.indexed} / ${coverage.total}</strong> entries indexed
          </div>
          <div class="ai-index-actions">
            <button type="button" class="btn btn-primary" id="ai-index-btn">
              ${icon("sparkles", 16)} Index missing entries
            </button>
            <button type="button" class="btn btn-outline" id="ai-reindex-all-btn">
              ${icon("refresh", 16)} Re-index all
            </button>
            <button type="button" class="btn btn-ghost" id="ai-clear-index-btn">
              ${icon("trash", 16)} Clear embeddings
            </button>
          </div>
          <div class="ai-progress" id="ai-progress" hidden>
            <div class="ai-progress-bar"><div class="ai-progress-fill" id="ai-progress-fill"></div></div>
            <span class="ai-progress-text" id="ai-progress-text"></span>
          </div>
        </div>

        <hr class="separator" />

        <div class="detail-section-title">Maintenance</div>
        <div class="ai-maintenance-actions">
          <button type="button" class="btn btn-outline" id="ai-merge-tags-btn">
            ${icon("tag", 16)} Suggest tag merges
          </button>
        </div>
        <div id="ai-tag-merge-result" class="ai-tag-merge-result"></div>

        <div class="fb-error" id="ai-settings-error" hidden></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="ai-forget-btn">Forget credentials</button>
        <div style="flex:1"></div>
        <button type="button" class="btn btn-outline" data-close-ai-settings>Cancel</button>
        <button type="button" class="btn btn-primary" id="ai-save-btn">Save</button>
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
