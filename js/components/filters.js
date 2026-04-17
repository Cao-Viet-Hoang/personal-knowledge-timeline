/**
 * Filter bar component.
 * Renders filter chips for type, tag, starred, status, and date range.
 */

import { icon } from "../utils/icons.js";
import { on } from "../utils/dom.js";
import { getAllTags } from "../store/store.js";

const STATUS_LABELS = { inbox: "Inbox", processed: "Processed", archived: "Archived" };

export function renderFilterBar(container, { activeFilters = {}, onFilterChange }) {
  const allTags = getAllTags();

  const statusChips = Object.entries(STATUS_LABELS)
    .map(([val, label]) => `
      <button class="filter-chip ${activeFilters.status === val ? "active" : ""}" data-filter="status" data-value="${val}">
        ${label}
      </button>
    `)
    .join("");

  const starChip = `
    <button class="filter-chip ${activeFilters.starred ? "active" : ""}" data-filter="starred" data-value="true">
      ${icon("star", 12)} Starred
    </button>
  `;

  const tagSelectHtml = allTags.length > 0
    ? `
      <select class="filter-select" id="filter-tag-select">
        <option value="">All tags</option>
        ${allTags.map((t) => `<option value="${t}" ${activeFilters.tag === t ? "selected" : ""}>#${t}</option>`).join("")}
      </select>
    `
    : "";

  const hasActiveFilters = Object.keys(activeFilters).length > 0;
  const clearBtn = hasActiveFilters
    ? `<button class="btn btn-ghost btn-sm filter-clear" id="clear-filters">${icon("close", 12)} Clear all</button>`
    : "";

  container.innerHTML = `
    <div class="filter-bar">
      <div class="filter-group">${statusChips}</div>
      <div class="filter-divider"></div>
      <div class="filter-group">
        ${starChip}
        ${tagSelectHtml}
      </div>
      ${clearBtn}
    </div>
  `;

  // ── Filter chip clicks ──
  on(container, "click", ".filter-chip", (e, el) => {
    const filter = el.dataset.filter;
    const value = el.dataset.value;
    const newFilters = { ...activeFilters };

    if (filter === "starred") {
      newFilters.starred ? delete newFilters.starred : (newFilters.starred = true);
    } else {
      newFilters[filter] === value ? delete newFilters[filter] : (newFilters[filter] = value);
    }

    onFilterChange?.(newFilters);
  });

  // ── Tag select ──
  const tagSelect = container.querySelector("#filter-tag-select");
  if (tagSelect) {
    tagSelect.addEventListener("change", () => {
      const newFilters = { ...activeFilters };
      tagSelect.value ? (newFilters.tag = tagSelect.value) : delete newFilters.tag;
      onFilterChange?.(newFilters);
    });
  }

  // ── Clear all ──
  on(container, "click", "#clear-filters", () => onFilterChange?.({}));
}
