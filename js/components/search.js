/**
 * Search view component.
 * Live search with debounce, renders results with matched-field indicators.
 */

import { icon } from "../utils/icons.js";
import { renderEntryCard } from "./entry-card.js";
import { searchEntries } from "../store/store.js";
import { on } from "../utils/dom.js";

const SEARCH_PAGE_SIZE = 50;

function renderResults(results, query, displayCount) {
  if (!query || !query.trim()) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("search", 48)}</div>
        <h3 class="empty-state-title">Search your knowledge</h3>
        <p class="empty-state-description">Search across titles, content, excerpts, notes, tags, and domains.</p>
      </div>
    `;
  }

  if (results.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("search", 48)}</div>
        <h3 class="empty-state-title">No results found</h3>
        <p class="empty-state-description">Try different keywords or check your spelling.</p>
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

export function renderSearch(container, { onEntryClick, onStar, onEdit, initialQuery = "" }) {
  const results = initialQuery ? searchEntries(initialQuery) : [];
  let currentResults = results;
  let displayCount = SEARCH_PAGE_SIZE;

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
      <div class="search-results-meta" id="search-meta">${renderCount(results, initialQuery)}</div>
    </div>
    <div id="search-results">${renderResults(results, initialQuery, displayCount)}</div>
  `;

  // ── Debounced live search ──
  let timer = null;
  const input = container.querySelector("#search-page-input");
  if (input) {
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = input.value.trim();
        currentResults = searchEntries(q);
        displayCount = SEARCH_PAGE_SIZE;
        container.querySelector("#search-results").innerHTML = renderResults(currentResults, q, displayCount);
        container.querySelector("#search-meta").innerHTML = renderCount(currentResults, q);
      }, 150);
    });

    // Focus the input after render
    requestAnimationFrame(() => input.focus());
  }

  // ── Load more search results ──
  on(container, "click", "#search-load-more", () => {
    displayCount += SEARCH_PAGE_SIZE;
    const q = input?.value?.trim() || initialQuery;
    container.querySelector("#search-results").innerHTML = renderResults(currentResults, q, displayCount);
  });

  // ── Entry interactions inside search results ──
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
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
