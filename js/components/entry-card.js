/**
 * Entry card component.
 * Renders a single entry card for the timeline view.
 *
 * Layout zones:
 *   [header]  — type badge, status, domain, time, star (pinned right)
 *   [body]    — title, excerpt/content, personal note
 *   [footer]  — tags (left), action buttons (right, hover-reveal)
 */

import { icon } from "../utils/icons.js";
import { formatRelative } from "../utils/date.js";

const TYPE_LABELS = { link: "Link", note: "Note", thought: "Thought", quote: "Quote" };

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderEntryCard(entry) {
  const typeLabel = TYPE_LABELS[entry.type] || entry.type;
  const starIcon = entry.starred ? icon("starFilled") : icon("star");
  const starClass = entry.starred ? "ec-star starred" : "ec-star";

  // ── Header meta chips ──
  const domainChip = entry.sourceDomain
    ? `<span class="ec-chip">${icon("globe")} ${esc(entry.sourceDomain)}</span>`
    : "";

  const timeChip = `<span class="ec-chip">${formatRelative(entry.createdAt)}</span>`;

  // ── Body: excerpt / content / note ──
  const textSource = entry.excerpt || entry.content;
  let bodyHtml = "";

  if (entry.type === "quote" && entry.excerpt) {
    bodyHtml += `<blockquote class="ec-quote">&ldquo;${esc(entry.excerpt)}&rdquo;</blockquote>`;
  } else if (textSource) {
    bodyHtml += `<p class="ec-excerpt">${esc(textSource)}</p>`;
  }

  if (entry.myNote) {
    bodyHtml += `
      <div class="ec-note">
        <span class="ec-note-label">Note</span>
        ${esc(entry.myNote)}
      </div>`;
  }

  // ── Images (thumbnail strip) ──
  let imagesHtml = "";
  if (entry.images && entry.images.length > 0) {
    const shown = entry.images.slice(0, 3);
    const extra = entry.images.length - 3;
    imagesHtml = `
      <div class="ec-images">
        ${shown.map((img) => `<img class="ec-img-thumb" src="${img.dataUrl}" alt="" loading="lazy" />`).join("")}
        ${extra > 0 ? `<span class="ec-img-more">+${extra}</span>` : ""}
      </div>`;
  }

  // ── Footer tags ──
  const tagsHtml = entry.tags.length
    ? entry.tags.map((t) => `<span class="tag" data-tag="${esc(t)}">#${esc(t)}</span>`).join("")
    : "";

  return `
    <article class="ec ec--${entry.type}" data-entry-id="${entry.id}">
      <div class="ec-inner">
        <!-- Header -->
        <div class="ec-header">
          <div class="ec-meta">
            <span class="badge badge-${entry.type}">${typeLabel}</span>
            <span class="status-badge status-${entry.status}">${entry.status}</span>
            ${domainChip}
            ${timeChip}
          </div>
          <button class="${starClass}" data-action="star" data-entry-id="${entry.id}" aria-label="${entry.starred ? "Unstar" : "Star"}">
            ${starIcon}
          </button>
        </div>

        <!-- Body -->
        <h4 class="ec-title">${esc(entry.title)}</h4>
        ${bodyHtml ? `<div class="ec-body">${bodyHtml}</div>` : ""}
        ${imagesHtml}

        <!-- Footer -->
        <div class="ec-footer">
          <div class="ec-tags">${tagsHtml}</div>
          <div class="ec-actions">
            <button class="btn btn-ghost btn-icon btn-sm" data-action="edit" data-entry-id="${entry.id}" data-tooltip="Edit">
              ${icon("edit")}
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" data-action="more" data-entry-id="${entry.id}" data-tooltip="More">
              ${icon("moreVertical")}
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}
