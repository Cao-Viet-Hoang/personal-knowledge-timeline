/**
 * Timeline view component.
 * Renders entries grouped by date with quick capture bar.
 */

import { on } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { getDateGroup } from "../utils/date.js";
import { renderEntryCard } from "./entry-card.js";
import { groupByDate } from "../store/store.js";

export function renderTimeline(container, entries, { onEntryClick, onNewEntry, onStar, onEdit }) {
  const groups = groupByDate(entries);

  const quickCaptureHtml = `
    <div class="quick-capture">
      <div class="quick-capture-row">
        <input
          type="text"
          class="quick-capture-input"
          id="quick-capture-input"
          placeholder="Paste a link or type a note..."
        />
        <button class="btn btn-primary" id="quick-capture-expand">
          ${icon("plus", 16)}
          New Entry
        </button>
      </div>
    </div>
  `;

  let groupsHtml = "";

  if (groups.size === 0) {
    groupsHtml = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("bookOpen")}</div>
        <h3 class="empty-state-title">No entries yet</h3>
        <p class="empty-state-description">Start capturing links, notes, thoughts, and quotes to build your personal knowledge timeline.</p>
        <button class="btn btn-primary" id="empty-new-entry">${icon("plus", 16)} New Entry</button>
      </div>
    `;
  } else {
    for (const [, dateEntries] of groups) {
      const dateLabel = getDateGroup(dateEntries[0].createdAt);
      const cardsHtml = dateEntries.map((e) => renderEntryCard(e)).join("");

      groupsHtml += `
        <div class="timeline-date-group">
          <div class="timeline-date-header">
            <span class="timeline-date-label">${dateLabel}</span>
            <div class="timeline-date-line"></div>
            <span class="timeline-date-count">${dateEntries.length} ${dateEntries.length === 1 ? "entry" : "entries"}</span>
          </div>
          ${cardsHtml}
        </div>
      `;
    }
  }

  container.innerHTML = quickCaptureHtml + groupsHtml;

  // ── Quick-capture submit (Enter key) ──
  const qcInput = container.querySelector("#quick-capture-input");
  if (qcInput) {
    qcInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && qcInput.value.trim()) {
        const value = qcInput.value.trim();
        const isUrl = /^https?:\/\//i.test(value);

        onNewEntry({
          quickCapture: true,
          type: isUrl ? "link" : "note",
          title: isUrl ? "" : value,
          sourceUrl: isUrl ? value : "",
          content: isUrl ? "" : value,
        });

        qcInput.value = "";
      }
    });
  }

  // ── New entry button ──
  on(container, "click", "#quick-capture-expand", () => onNewEntry?.());
  on(container, "click", "#empty-new-entry", () => onNewEntry?.());

  // ── Entry card click → detail ──
  on(container, "click", ".ec", (e, el) => {
    if (e.target.closest("[data-action]")) return;
    if (e.target.closest(".tag")) return;
    onEntryClick?.(el.dataset.entryId);
  });

  // ── Star toggle ──
  on(container, "click", '[data-action="star"]', (e, el) => {
    e.stopPropagation();
    onStar?.(el.dataset.entryId);
  });

  // ── Edit button ──
  on(container, "click", '[data-action="edit"]', (e, el) => {
    e.stopPropagation();
    onEdit?.(el.dataset.entryId);
  });
}
