/**
 * Digest view — AI-generated summaries of entries over a time window.
 * Supports:
 *   - Weekly / monthly digest
 *   - Multi-entry synthesis (pick any set of entries by tag or date)
 *   - Pattern detection (recurring themes)
 */

import { icon } from "../utils/icons.js";
import { on } from "../utils/dom.js";
import { isAIConfigured } from "../ai/ai-config.js";
import { filterEntries, getAllEntries } from "../store/store.js";
import {
  generateDigest,
  synthesizeEntries,
  detectPatterns,
} from "../ai/ai-actions.js";

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function renderDigestView(container) {
  if (!isAIConfigured()) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("sparkles", 48)}</div>
        <h3 class="empty-state-title">AI not configured</h3>
        <p class="empty-state-description">Add your API key in AI Settings to generate digests.</p>
        <button class="btn btn-primary" data-action="open-ai-settings">${icon("sparkles", 16)} Open AI Settings</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="digest-view">
      <div class="ask-header">
        <h2>${icon("sparkles", 24)} Digest & Synthesis</h2>
        <p class="ask-intro">Let AI summarize patterns and insights from your entries.</p>
      </div>

      <div class="digest-actions">
        <button class="btn btn-outline" data-digest-period="week">
          ${icon("calendar", 16)} Weekly digest
        </button>
        <button class="btn btn-outline" data-digest-period="month">
          ${icon("calendar", 16)} Monthly digest
        </button>
        <button class="btn btn-outline" id="digest-patterns-btn">
          ${icon("sparkles", 16)} Detect patterns
        </button>
        <button class="btn btn-outline" id="digest-synthesize-btn">
          ${icon("fileText", 16)} Synthesize starred
        </button>
      </div>

      <div id="digest-result" class="digest-result"></div>
    </div>
  `;

  const resultEl = container.querySelector("#digest-result");

  function showLoading(label) {
    resultEl.innerHTML = `<div class="ask-loading">${icon("sparkles", 18)} ${esc(label)}</div>`;
  }

  function showError(msg) {
    resultEl.innerHTML = `<div class="ask-error">${esc(msg)}</div>`;
  }

  function showMarkdown(title, md) {
    resultEl.innerHTML = `
      <div class="digest-output">
        <h3 class="digest-output-title">${esc(title)}</h3>
        <div class="digest-output-body">${esc(md).replace(/\n/g, "<br />")}</div>
      </div>
    `;
  }

  on(container, "click", "[data-digest-period]", async (e, el) => {
    const period = el.dataset.digestPeriod;
    const days = period === "week" ? 7 : 30;
    const entries = filterEntries({ dateFrom: daysAgo(days).slice(0, 10) });
    if (entries.length === 0) {
      showError(`No entries in the last ${days} days.`);
      return;
    }
    showLoading(`Summarizing ${entries.length} entries from the last ${days} days...`);
    try {
      const text = await generateDigest(entries, { period });
      showMarkdown(`${period[0].toUpperCase()}${period.slice(1)}ly digest (${entries.length} entries)`, text);
    } catch (err) {
      showError(err.message);
    }
  });

  on(container, "click", "#digest-patterns-btn", async () => {
    const entries = getAllEntries().slice(0, 80);
    if (entries.length < 5) {
      showError("Need at least 5 entries to detect patterns.");
      return;
    }
    showLoading(`Scanning ${entries.length} entries for recurring themes...`);
    try {
      const patterns = await detectPatterns(entries);
      if (patterns.length === 0) {
        resultEl.innerHTML = `<div class="ask-empty">No strong patterns detected.</div>`;
        return;
      }
      resultEl.innerHTML = `
        <div class="digest-output">
          <h3 class="digest-output-title">Patterns</h3>
          <div class="digest-patterns">
            ${patterns.map((p) => `
              <div class="digest-pattern">
                <div class="digest-pattern-theme">${esc(p.theme || "Theme")}</div>
                <div class="digest-pattern-desc">${esc(p.description || "")}</div>
                ${Array.isArray(p.examples) && p.examples.length ? `
                  <div class="digest-pattern-examples">
                    Examples: ${p.examples.map((i) => {
                      const e = entries[i - 1];
                      return e ? `<span class="tag">${esc(e.title.slice(0, 40))}</span>` : "";
                    }).join(" ")}
                  </div>
                ` : ""}
              </div>
            `).join("")}
          </div>
        </div>
      `;
    } catch (err) {
      showError(err.message);
    }
  });

  on(container, "click", "#digest-synthesize-btn", async () => {
    const entries = getAllEntries().filter((e) => e.starred);
    if (entries.length < 2) {
      showError("Star at least 2 entries to synthesize.");
      return;
    }
    showLoading(`Combining ${entries.length} starred entries into a cohesive note...`);
    try {
      const text = await synthesizeEntries(entries, { goal: "a cohesive synthesis with a clear narrative" });
      showMarkdown(`Synthesis of ${entries.length} starred entries`, text);
    } catch (err) {
      showError(err.message);
    }
  });
}
