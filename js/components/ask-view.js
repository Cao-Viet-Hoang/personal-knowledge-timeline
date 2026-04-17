/**
 * Ask-your-knowledge view (RAG).
 * User types a question → we retrieve top-K similar entries by embedding,
 * then stream a grounded answer with numbered citations.
 */

import { icon } from "../utils/icons.js";
import { on } from "../utils/dom.js";
import { isAIConfigured } from "../ai/ai-config.js";
import { semanticSearch } from "../ai/ai-search.js";
import { askWithContext } from "../ai/ai-actions.js";
import { formatRelative } from "../utils/date.js";

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderAskView(container, { onEntryClick }) {
  if (!isAIConfigured()) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("sparkles", 48)}</div>
        <h3 class="empty-state-title">AI not configured</h3>
        <p class="empty-state-description">Add your API key in AI Settings to ask questions across your knowledge.</p>
        <button class="btn btn-primary" data-action="open-ai-settings">${icon("sparkles", 16)} Open AI Settings</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="ask-view">
      <div class="ask-header">
        <h2>${icon("sparkles", 24)} Ask your knowledge</h2>
        <p class="ask-intro">Ask questions and get answers grounded in your own notes.</p>
      </div>

      <div class="ask-input-row">
        <textarea
          id="ask-input"
          class="textarea"
          rows="2"
          placeholder="What have I captured about... ?"
        ></textarea>
        <button class="btn btn-primary" id="ask-submit">
          ${icon("sparkles", 16)} Ask
        </button>
      </div>

      <div id="ask-result" class="ask-result"></div>
    </div>
  `;

  const input = container.querySelector("#ask-input");
  const resultEl = container.querySelector("#ask-result");

  input.focus();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAsk();
    }
  });

  async function handleAsk() {
    const question = input.value.trim();
    if (!question) return;

    resultEl.innerHTML = `
      <div class="ask-loading">${icon("sparkles", 18)} Searching your notes...</div>
    `;

    try {
      const hits = await semanticSearch(question, 6, 0.2);
      if (hits.length === 0) {
        resultEl.innerHTML = `
          <div class="ask-empty">No entries found. Try indexing your entries in AI Settings first.</div>
        `;
        return;
      }

      resultEl.innerHTML = `
        <div class="ask-loading">${icon("sparkles", 18)} Thinking with ${hits.length} relevant note${hits.length === 1 ? "" : "s"}...</div>
      `;

      const contextEntries = hits.map((h) => h.entry);
      const answer = await askWithContext(question, contextEntries);

      const citationsHtml = contextEntries
        .map(
          (e, i) => `
          <div class="ask-citation" data-entry-id="${esc(e.id)}">
            <div class="ask-citation-num">[${i + 1}]</div>
            <div class="ask-citation-body">
              <div class="ask-citation-title">${esc(e.title)}</div>
              <div class="ask-citation-meta">
                <span class="badge badge-${esc(e.type)}">${esc(e.type)}</span>
                <span>${formatRelative(e.createdAt)}</span>
                <span class="ask-citation-score">${Math.round(hits[i].score * 100)}%</span>
              </div>
            </div>
          </div>
        `
        )
        .join("");

      resultEl.innerHTML = `
        <div class="ask-answer">${esc(answer).replace(/\n/g, "<br />")}</div>
        <div class="detail-section-title" style="margin-top: var(--space-6)">Sources</div>
        <div class="ask-citations">${citationsHtml}</div>
      `;
    } catch (err) {
      resultEl.innerHTML = `
        <div class="ask-error">${esc(err.message)}</div>
      `;
    }
  }

  on(container, "click", "#ask-submit", handleAsk);
  on(container, "click", ".ask-citation", (e, el) => {
    if (onEntryClick && el.dataset.entryId) onEntryClick(el.dataset.entryId);
  });
}
