/**
 * Review / Resurface view.
 * Shows old entries for spaced review and daily reflection with persistence.
 */

import { icon } from "../utils/icons.js";
import { formatDate, formatRelative } from "../utils/date.js";
import { getReviewEntries, getReflection, saveReflection } from "../store/store.js";
import { on } from "../utils/dom.js";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderReviewCard(entry) {
  const sourceHtml = entry.sourceUrl
    ? `
      <div class="review-card-source">
        ${icon("globe")}
        <a href="${entry.sourceUrl}" target="_blank" rel="noopener">${escapeHtml(entry.sourceDomain || entry.sourceUrl)}</a>
        ${icon("externalLink")}
      </div>
    `
    : "";

  const excerptText = entry.excerpt || entry.content;
  const excerptHtml = excerptText
    ? `<div class="review-card-excerpt">${
        entry.type === "quote" ? `&ldquo;${escapeHtml(excerptText)}&rdquo;` : escapeHtml(excerptText.slice(0, 400)) + (excerptText.length > 400 ? "..." : "")
      }</div>`
    : "";

  const noteHtml = entry.myNote
    ? `<div class="review-card-note">${escapeHtml(entry.myNote)}</div>`
    : "";

  const tagsHtml = entry.tags.length
    ? `<div class="review-card-tags">${entry.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join("")}</div>`
    : "";

  return `
    <div class="review-card animate-fade-in" data-entry-id="${entry.id}">
      <div class="review-card-accent review-card-accent--${entry.type}"></div>
      <div class="review-card-body">
        <div class="review-card-meta">
          <span class="badge badge-${entry.type}">${entry.type}</span>
          <span class="review-card-date">${formatDate(entry.createdAt)}</span>
        </div>
        <h3 class="review-card-title">${escapeHtml(entry.title)}</h3>
        ${excerptHtml}
        ${noteHtml}
        ${tagsHtml}
      </div>
      <div class="review-card-footer">
        ${sourceHtml}
        <span class="text-xs text-muted">${formatRelative(entry.createdAt)}</span>
      </div>
    </div>
  `;
}

export function renderReview(container, { onEntryClick }) {
  const reviewEntries = getReviewEntries(2, 5);
  const totalCount = reviewEntries.length;
  let currentIndex = 0;

  // Load today's reflection
  const today = todayKey();
  const existingReflection = getReflection(today);

  function renderState() {
    const isComplete = currentIndex >= totalCount;
    const currentEntry = reviewEntries[currentIndex];
    const progressPercent = totalCount > 0 ? ((currentIndex + (isComplete ? 0 : 1)) / totalCount) * 100 : 0;

    const headerHtml = `
      <div class="review-header">
        <div class="review-header-icon">${icon("brain")}</div>
        <h2>Review & Resurface</h2>
        <p>Revisit your past knowledge to strengthen retention.</p>
      </div>
    `;

    let mainHtml;
    if (totalCount === 0) {
      mainHtml = `
        <div class="empty-state" style="padding-top: var(--space-8)">
          <div class="empty-state-icon">${icon("checkCircle")}</div>
          <h3 class="empty-state-title">Nothing to review yet</h3>
          <p class="empty-state-description">Add more entries and come back in a few days.</p>
        </div>
      `;
    } else if (isComplete) {
      mainHtml = `
        <div class="empty-state" style="padding-top: var(--space-8)">
          <div class="empty-state-icon">${icon("checkCircle")}</div>
          <h3 class="empty-state-title">Review complete!</h3>
          <p class="empty-state-description">You've reviewed all entries for today. Come back tomorrow for more.</p>
          <button class="btn btn-outline" id="review-restart">${icon("refresh", 16)} Start over</button>
        </div>
      `;
    } else {
      mainHtml = `
        <div class="review-progress">
          <span class="review-progress-text">${currentIndex + 1} of ${totalCount}</span>
          <div class="review-progress-bar">
            <div class="review-progress-fill" style="width: ${progressPercent}%"></div>
          </div>
        </div>
        ${renderReviewCard(currentEntry)}
        <div class="review-actions">
          <button class="btn btn-outline" id="review-skip">
            ${icon("skipForward", 16)} Skip
          </button>
          <button class="btn btn-primary" id="review-done">
            ${icon("checkCircle", 16)} Got it
          </button>
        </div>
      `;
    }

    // Reflection section
    const reflectionContent = existingReflection?.content || "";
    const reflectionHtml = `
      <div class="reflection-card" style="margin-top: var(--space-8)">
        <div class="detail-section-title">Daily Reflection</div>
        <div class="reflection-prompt">What did you learn today? What connections did you make?</div>
        <textarea class="reflection-textarea" id="reflection-text" placeholder="Write your reflection here...">${escapeHtml(reflectionContent)}</textarea>
        <div class="reflection-footer">
          <span class="reflection-date">${formatDate(new Date().toISOString())}</span>
          <button class="btn btn-primary btn-sm" id="save-reflection">Save Reflection</button>
        </div>
      </div>
    `;

    container.innerHTML = `<div class="review-page">${headerHtml}${mainHtml}${reflectionHtml}</div>`;

    // ── Bind review navigation ──
    const advanceFn = () => {
      currentIndex++;
      renderState();
    };

    on(container, "click", "#review-skip", advanceFn);
    on(container, "click", "#review-done", advanceFn);
    on(container, "click", "#review-restart", () => {
      currentIndex = 0;
      renderState();
    });

    // ── Bind card click → detail ──
    on(container, "click", ".review-card", (e, el) => {
      onEntryClick?.(el.dataset.entryId);
    });

    // ── Bind save reflection ──
    on(container, "click", "#save-reflection", () => {
      const textarea = container.querySelector("#reflection-text");
      if (textarea && textarea.value.trim()) {
        saveReflection(today, textarea.value.trim());
        // Brief visual feedback
        const btn = container.querySelector("#save-reflection");
        const original = btn.innerHTML;
        btn.innerHTML = `${icon("checkCircle", 16)} Saved!`;
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-outline");
        setTimeout(() => {
          btn.innerHTML = original;
          btn.classList.add("btn-primary");
          btn.classList.remove("btn-outline");
        }, 1500);
      }
    });
  }

  renderState();
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
