/**
 * Search view component.
 * Live search with debounce. Supports three modes:
 *   - keyword:  existing full-text scoring via store.searchEntries
 *   - semantic: embedding-based cosine similarity
 *   - hybrid:   blends keyword + semantic scores
 */

import { icon } from "../utils/icons.js";
import { renderEntryCard } from "./entry-card.js";
import { searchEntries } from "../store/store.js";
import { on } from "../utils/dom.js";
import { isAIConfigured } from "../ai/ai-config.js";
import { semanticSearch, hybridSearch } from "../ai/ai-search.js";

const SEARCH_PAGE_SIZE = 50;

function renderResults(results, query, displayCount) {
  if (!query || !query.trim()) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("search", 48)}</div>
        <h3 class="empty-state-title">Search your knowledge</h3>
        <p class="empty-state-description">Keyword, semantic, or hybrid search across all your entries.</p>
      </div>
    `;
  }

  if (results.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("search", 48)}</div>
        <h3 class="empty-state-title">No results found</h3>
        <p class="empty-state-description">Try different keywords or switch search mode.</p>
      </div>
    `;
  }

  const displayed = results.slice(0, displayCount);
  const hasMore = results.length > displayCount;
  const remaining = results.length - displayCount;

  let html = displayed.map((e) => renderEntryCard(e)).join("");

  if (hasMore) {
    html += `
      <div class="timeline-load-more">
        <button class="btn btn-outline" id="search-load-more">
          Show more results (${remaining} remaining)
        </button>
      </div>
    `;
  }

  return html;
}

function renderCount(results, query) {
  if (!query || !query.trim()) return "";
  return `<span class="search-results-count"><strong>${results.length}</strong> result${results.length !== 1 ? "s" : ""} for &ldquo;${escapeHtml(query)}&rdquo;</span>`;
}

/** Run the configured search mode and return plain entry array. */
async function runSearch(query, mode) {
  if (!query.trim()) return [];
  if (mode === "keyword" || !isAIConfigured()) {
    return searchEntries(query);
  }
  if (mode === "semantic") {
    try {
      const hits = await semanticSearch(query, 100, 0.25);
      return hits.map((h) => ({ ...h.entry, _score: h.score }));
    } catch (err) {
      console.error("[Search] Semantic failed, falling back to keyword:", err);
      return searchEntries(query);
    }
  }
  // hybrid (default when AI is configured)
  try {
    const keyword = searchEntries(query);
    const blended = await hybridSearch(query, keyword, 100);
    return blended.map((b) => ({ ...b.entry, _score: b.score }));
  } catch (err) {
    console.error("[Search] Hybrid failed, falling back to keyword:", err);
    return searchEntries(query);
  }
}

export function renderSearch(container, { onEntryClick, onStar, onEdit, initialQuery = "" }) {
  // Default mode: hybrid if AI configured, else keyword
  let mode = isAIConfigured() ? "hybrid" : "keyword";
  let currentResults = [];
  let displayCount = SEARCH_PAGE_SIZE;
  let searchToken = 0; // guard against out-of-order async results

  const aiEnabled = isAIConfigured();

  container.innerHTML = `
    <div class="search-page-header">
      <div class="search-page-input">
        <div class="search-input-wrapper" style="max-width: 100%">
          <span class="search-icon">${icon("search")}</span>
          <input
            type="text"
            class="input input-lg"
            id="search-page-input"
            placeholder="Search entries..."
            value="${escapeHtml(initialQuery)}"
            style="padding-left: 40px"
            autofocus
          />
          <span class="search-shortcut">Ctrl+K</span>
        </div>
      </div>

      <div class="search-mode-toggle">
        <button class="search-mode-btn ${mode === "keyword" ? "active" : ""}" data-search-mode="keyword">
          ${icon("search", 14)} Keyword
        </button>
        <button class="search-mode-btn ${mode === "semantic" ? "active" : ""}" data-search-mode="semantic" ${aiEnabled ? "" : "disabled"}>
          ${icon("sparkles", 14)} Semantic
        </button>
        <button class="search-mode-btn ${mode === "hybrid" ? "active" : ""}" data-search-mode="hybrid" ${aiEnabled ? "" : "disabled"}>
          ${icon("wand", 14)} Hybrid
        </button>
      </div>

      <div class="search-results-meta" id="search-meta"></div>
    </div>
    <div id="search-results">${renderResults([], "", displayCount)}</div>
  `;

  const input = container.querySelector("#search-page-input");
  const resultsContainer = container.querySelector("#search-results");
  const metaEl = container.querySelector("#search-meta");

  async function refresh() {
    const q = input.value.trim();
    if (!q) {
      currentResults = [];
      displayCount = SEARCH_PAGE_SIZE;
      resultsContainer.innerHTML = renderResults([], "", displayCount);
      metaEl.innerHTML = "";
      return;
    }

    const myToken = ++searchToken;
    metaEl.innerHTML = `<span class="search-loading">${icon("sparkles", 14)} Searching...</span>`;

    const results = await runSearch(q, mode);
    if (myToken !== searchToken) return; // newer search started

    currentResults = results;
    displayCount = SEARCH_PAGE_SIZE;
    resultsContainer.innerHTML = renderResults(results, q, displayCount);
    metaEl.innerHTML = renderCount(results, q);
  }

  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 200);
  });

  on(container, "click", "[data-search-mode]", (e, el) => {
    if (el.disabled) return;
    mode = el.dataset.searchMode;
    container.querySelectorAll("[data-search-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.searchMode === mode);
    });
    refresh();
  });

  on(container, "click", "#search-load-more", () => {
    displayCount += SEARCH_PAGE_SIZE;
    const q = input.value.trim() || initialQuery;
    resultsContainer.innerHTML = renderResults(currentResults, q, displayCount);
  });

  on(container, "click", ".ec", (e, el) => {
    if (e.target.closest("[data-action]")) return;
    if (e.target.closest(".tag")) return;
    onEntryClick?.(el.dataset.entryId);
  });

  on(container, "click", '[data-action="star"]', (e, el) => {
    e.stopPropagation();
    onStar?.(el.dataset.entryId);
  });

  on(container, "click", '[data-action="edit"]', (e, el) => {
    e.stopPropagation();
    onEdit?.(el.dataset.entryId);
  });

  requestAnimationFrame(() => input.focus());
  if (initialQuery) refresh();
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
