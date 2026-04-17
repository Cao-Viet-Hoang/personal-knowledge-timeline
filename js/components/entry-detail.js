/**
 * Entry detail view (modal content).
 * Shows full entry details including related entries.
 */

import { icon } from "../utils/icons.js";
import { formatDate, formatTime, formatRelative } from "../utils/date.js";
import { getEntry } from "../store/store.js";

const TYPE_LABELS = {
  link: "Link",
  note: "Note",
  thought: "Thought",
  quote: "Quote",
};

export function renderEntryDetail(entry) {
  if (!entry) return "<p>Entry not found.</p>";

  const typeLabel = TYPE_LABELS[entry.type] || entry.type;
  const starIcon = entry.starred ? icon("starFilled") : icon("star");
  const starClass = entry.starred ? "star-btn starred" : "star-btn";

  const sourceHtml = entry.sourceUrl
    ? `
      <div class="detail-source">
        <a href="${entry.sourceUrl}" target="_blank" rel="noopener" class="detail-source-link">
          <span>${escapeHtml(entry.sourceUrl)}</span> ${icon("externalLink")}
        </a>
        ${entry.sourceDomain ? `<span class="detail-source-domain">${escapeHtml(entry.sourceDomain)}</span>` : ""}
      </div>
    `
    : "";

  const excerptHtml = entry.excerpt
    ? `
      <div class="detail-section">
        <div class="detail-section-title">Excerpt</div>
        <div class="detail-excerpt">${entry.type === "quote" ? `&ldquo;${escapeHtml(entry.excerpt)}&rdquo;` : escapeHtml(entry.excerpt)}</div>
      </div>
    `
    : "";

  const contentHtml = entry.content
    ? `
      <div class="detail-section">
        <div class="detail-section-title">Content</div>
        <div class="detail-content">${escapeHtml(entry.content)}</div>
      </div>
    `
    : "";

  const noteHtml = entry.myNote
    ? `
      <div class="detail-section">
        <div class="detail-section-title">My Note</div>
        <div class="detail-note">${escapeHtml(entry.myNote)}</div>
      </div>
    `
    : "";

  const tagsHtml = (entry.tags || []).length
    ? `
      <div class="detail-section">
        <div class="detail-section-title">Tags</div>
        <div class="detail-tags">
          ${(entry.tags || []).map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>
    `
    : "";

  // Images
  const imagesHtml = entry.images && entry.images.length > 0
    ? `
      <div class="detail-section">
        <div class="detail-section-title">Images (${entry.images.length})</div>
        <div class="detail-images-grid">
          ${entry.images.map((img, i) => `
            <div class="detail-image-item" data-action="open-lightbox" data-image-index="${i}" data-entry-id="${entry.id}" title="Click to view full size">
              <img src="${img.dataUrl}" alt="Image ${i + 1}" loading="lazy" />
            </div>
          `).join("")}
        </div>
      </div>
    `
    : "";

  // Related entries
  let relatedHtml = "";
  if (entry.relatedEntryIds && entry.relatedEntryIds.length > 0) {
    const relatedEntries = entry.relatedEntryIds
      .map((id) => getEntry(id))
      .filter(Boolean);

    if (relatedEntries.length > 0) {
      const relatedItemsHtml = relatedEntries
        .map(
          (re) => `
          <div class="related-entry-item" data-related-entry-id="${re.id}">
            <span class="related-entry-dot" style="background: hsl(var(--color-${re.type}))"></span>
            <span class="related-entry-title">${escapeHtml(re.title)}</span>
            <span class="related-entry-date">${formatRelative(re.createdAt)}</span>
          </div>
        `
        )
        .join("");

      relatedHtml = `
        <div class="detail-section">
          <div class="detail-section-title">Related Entries</div>
          <div class="related-entries">${relatedItemsHtml}</div>
        </div>
      `;
    }
  }

  // Status button label
  const statusActions = {
    inbox: { label: "Mark as processed", nextStatus: "processed", icon: icon("check") },
    processed: { label: "Archive", nextStatus: "archived", icon: icon("archive") },
    archived: { label: "Move to inbox", nextStatus: "inbox", icon: icon("inbox") },
  };
  const statusAction = statusActions[entry.status] || statusActions.inbox;

  // AI summary & action items
  const summaryHtml = entry.summary
    ? `
      <div class="detail-section">
        <div class="detail-section-title">${icon("sparkles", 14)} AI Summary</div>
        <div class="detail-note">${escapeHtml(entry.summary)}</div>
      </div>
    `
    : "";

  const actionsHtml = entry.aiActionItems && entry.aiActionItems.length
    ? `
      <div class="detail-section">
        <div class="detail-section-title">Action Items</div>
        <ul class="ai-action-items">${entry.aiActionItems.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
      </div>
    `
    : "";

  return `
    <div class="detail-type-badge">
      <span class="badge badge-${entry.type}">${typeLabel}</span>
      <span class="status-badge status-${entry.status}" style="margin-left: var(--space-2)">${entry.status}</span>
    </div>

    <h2 class="detail-title">${escapeHtml(entry.title)}</h2>

    ${sourceHtml}

    <div class="detail-meta">
      <span class="detail-meta-item">
        ${icon("calendar")}
        Created ${formatDate(entry.createdAt)} at ${formatTime(entry.createdAt)}
      </span>
    </div>

    <hr class="separator" />

    ${summaryHtml}
    ${excerptHtml}
    ${contentHtml}
    ${noteHtml}
    ${actionsHtml}
    ${imagesHtml}
    ${tagsHtml}
    ${relatedHtml}

    <div class="detail-section" id="ai-related-section">
      <div class="detail-section-title">
        ${icon("sparkles", 14)} AI Related Entries
        <button class="btn btn-ghost btn-sm" data-action="detail-ai-related" data-entry-id="${entry.id}" style="margin-left: auto">
          ${icon("refresh", 14)} Find similar
        </button>
      </div>
      <div id="ai-related-list" class="related-entries"></div>
    </div>

    <hr class="separator" />

    <div class="detail-actions">
      <button class="${starClass}" data-action="detail-star" data-entry-id="${entry.id}">
        ${starIcon}
      </button>
      <button class="btn btn-outline btn-sm" data-action="detail-edit" data-entry-id="${entry.id}">
        ${icon("edit")} Edit
      </button>
      <button class="btn btn-outline btn-sm" data-action="detail-chat" data-entry-id="${entry.id}">
        ${icon("messageSquare", 14)} Chat
      </button>
      <button class="btn btn-ghost btn-sm" data-action="detail-status" data-entry-id="${entry.id}" data-next-status="${statusAction.nextStatus}">
        ${statusAction.icon} ${statusAction.label}
      </button>
      <div style="flex:1"></div>
      <button class="btn btn-destructive btn-sm" data-action="detail-delete" data-entry-id="${entry.id}">
        ${icon("trash")} Delete
      </button>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
