/**
 * Search view component.
 * Live search with debounce, renders results with matched-field indicators.
 */

import { icon } from "../utils/icons.js";
import { renderEntryCard } from "./entry-card.js";
import { searchEntries } from "../store/store.js";
import { on } from "../utils/dom.js";

function renderResults(results, query) {
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

  return results.map((e) => renderEntryCard(e)).join("");
}

function renderCount(results, query) {
  if (!query || !query.trim()) return "";
  return `<span class="search-results-count"><strong>${results.length}</strong> result${results.length !== 1 ? "s" : ""} for &ldquo;${escapeHtml(query)}&rdquo;</span>`;
}

export function renderSearch(container, { onEntryClick, onStar, onEdit, initialQuery = "" }) {
  const results = initialQuery ? searchEntries(initialQuery) : [];

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
    <div id="search-results">${renderResults(results, initialQuery)}</div>
  `;

  // ── Debounced live search ──
  let timer = null;
  const input = container.querySelector("#search-page-input");
  if (input) {
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = input.value.trim();
        const newResults = searchEntries(q);
        container.querySelector("#search-results").innerHTML = renderResults(newResults, q);
        container.querySelector("#search-meta").innerHTML = renderCount(newResults, q);
      }, 150);
    });

    // Focus the input after render
    requestAnimationFrame(() => input.focus());
  }

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
