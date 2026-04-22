/**
 * Entry form component.
 * Renders the new/edit entry form inside a modal.
 * Collects form data for the store.
 */

import { icon } from "../utils/icons.js";
import { formatBytes, checkImageLimits } from "../utils/image.js";
import { getAllEntries } from "../store/store.js";

export function renderEntryForm(entry = null) {
  const type = entry?.type || "link";
  const title = entry?.title || "";
  const sourceUrl = entry?.sourceUrl || "";
  const excerpt = entry?.excerpt || "";
  const content = entry?.content || "";
  const myNote = entry?.myNote || "";
  const tags = entry?.tags || [];
  const status = entry?.status || "inbox";
  const images = entry?.images || [];
  const relatedEntryIds = entry?.relatedEntryIds || [];
  const aiLanguage = entry ? (entry.aiLanguage === "vi" ? "vi" : "en") : "vi";
  const createdDate = entry?.createdAt
    ? entry.createdAt.slice(0, 10)
    : todayDateString();

  // Build related entries HTML from current data
  const allEntries = getAllEntries();
  const relatedEntries = relatedEntryIds
    .map((id) => allEntries.find((e) => e.id === id))
    .filter(Boolean);

  const relatedHtml = relatedEntries
    .map(
      (re) => `
    <div class="related-entry-chip" data-related-id="${esc(re.id)}">
      <span class="type-dot type-dot--${re.type}"></span>
      ${re.ticketNumber ? `<span class="related-entry-chip-ticket">#${re.ticketNumber}</span>` : ""}
      <span class="related-entry-chip-title">${esc(re.title)}</span>
      <button type="button" class="related-entry-chip-remove" data-remove-related="${esc(re.id)}">${icon("close")}</button>
    </div>
  `
    )
    .join("");

  const tagsHtml = tags
    .map(
      (t) => `
    <span class="tag" data-tag="${esc(t)}">
      #${esc(t)}
      <button type="button" class="tag-remove" data-remove-tag="${esc(t)}">${icon("close")}</button>
    </span>
  `
    )
    .join("");

  const existingSummary = entry?.summary || "";
  const existingActions = entry?.aiActionItems || [];

  return `
    <form class="entry-form" id="entry-form" novalidate>
      <input type="hidden" name="id" value="${entry?.id || ""}" />
      <input type="hidden" name="type" value="${type}" />
      <input type="hidden" name="aiLanguage" value="${aiLanguage}" />

      <div class="ai-toolbar" role="group" aria-label="AI assist">
        <div class="ai-toolbar-header">
          <span class="ai-toolbar-title">${icon("sparkles", 14)} AI Assist</span>
          <div class="ai-toolbar-header-right">
            <span id="form-ai-status" class="ai-toolbar-status" aria-live="polite"></span>
            <div class="ai-lang-toggle" role="group" aria-label="AI output language" title="Language used by AI to generate and enrich content">
              <button type="button" class="ai-lang-btn ${aiLanguage === "en" ? "active" : ""}" data-ai-lang="en" aria-pressed="${aiLanguage === "en"}">EN</button>
              <button type="button" class="ai-lang-btn ${aiLanguage === "vi" ? "active" : ""}" data-ai-lang="vi" aria-pressed="${aiLanguage === "vi"}">VI</button>
            </div>
          </div>
        </div>
        <div class="ai-toolbar-actions">
          <div class="ai-toolbar-group" aria-label="Fetch from URL">
            <button type="button" class="ai-chip" data-ai-action="parse-url" title="Fetch and analyze the source URL">
              ${icon("globe")}<span>From URL</span>
            </button>
          </div>

          <span class="ai-toolbar-divider" aria-hidden="true"></span>

          <div class="ai-toolbar-group" aria-label="Generate fields">
            <button type="button" class="ai-chip" data-ai-action="auto-title" title="Generate a title from the content">
              ${icon("wand")}<span>Title</span>
            </button>
            <button type="button" class="ai-chip" data-ai-action="auto-summary" title="Summarize the content">
              ${icon("fileText")}<span>Summary</span>
            </button>
            <button type="button" class="ai-chip" data-ai-action="auto-tags" title="Suggest tags">
              ${icon("tag")}<span>Tags</span>
            </button>
          </div>

          <span class="ai-toolbar-divider" aria-hidden="true"></span>

          <div class="ai-toolbar-group" aria-label="Rewrite content">
            <button type="button" class="ai-chip" data-ai-action="expand" title="Expand the content with more detail">
              ${icon("wand")}<span>Expand</span>
            </button>
            <div class="ai-toolbar-menu-wrapper" id="ai-translate-wrapper">
              <button type="button" class="ai-chip ai-chip--menu" data-ai-menu-toggle="translate" aria-haspopup="menu" aria-expanded="false" title="Translate the content">
                ${icon("languages")}<span>Translate</span>
                <svg class="ai-chip-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div class="ai-toolbar-menu" id="ai-translate-menu" role="menu" hidden>
                <button type="button" class="ai-toolbar-menu-item" data-ai-action="translate-en" role="menuitem">English</button>
                <button type="button" class="ai-toolbar-menu-item" data-ai-action="translate-vi" role="menuitem">Vietnamese</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-group" id="form-title-group">
        <label class="label" for="entry-title">Title <span style="color: hsl(var(--destructive))">*</span></label>
        <input type="text" id="entry-title" name="title" class="input" placeholder="Entry title..." value="${esc(title)}" required />
      </div>

      <div class="form-row" id="form-type-row">
        <div class="form-group" id="form-type-group">
          <label class="label">Type</label>
          <div class="type-selector">
            <button type="button" class="type-selector-btn ${type === "link" ? "active" : ""}" data-form-type="link">
              <span class="type-dot type-dot--link"></span> Link
            </button>
            <button type="button" class="type-selector-btn ${type === "note" ? "active" : ""}" data-form-type="note">
              <span class="type-dot type-dot--note"></span> Note
            </button>
            <button type="button" class="type-selector-btn ${type === "thought" ? "active" : ""}" data-form-type="thought">
              <span class="type-dot type-dot--thought"></span> Thought
            </button>
            <button type="button" class="type-selector-btn ${type === "quote" ? "active" : ""}" data-form-type="quote">
              <span class="type-dot type-dot--quote"></span> Quote
            </button>
          </div>
        </div>
        <div class="form-group" id="form-status-group">
          <label class="label" for="entry-status">Status</label>
          <select id="entry-status" name="status" class="select">
            <option value="inbox" ${status === "inbox" ? "selected" : ""}>Inbox</option>
            <option value="processed" ${status === "processed" ? "selected" : ""}>Processed</option>
            <option value="archived" ${status === "archived" ? "selected" : ""}>Archived</option>
          </select>
        </div>
        <div class="form-group" id="form-date-group">
          <label class="label" for="entry-created-date">Date</label>
          <input type="date" id="entry-created-date" name="createdDate" class="input" value="${esc(createdDate)}" />
        </div>
      </div>

      <div class="form-group" id="form-source-group">
        <label class="label" for="entry-source">Source URL</label>
        <input type="url" id="entry-source" name="sourceUrl" class="input" placeholder="https://..." value="${esc(sourceUrl)}" />
      </div>

      <div class="form-group" id="form-images-group">
        <label class="label">Images</label>
        <div class="image-upload-controls">
          <div class="image-profile-toggle" id="image-profile-toggle">
            <button type="button" class="profile-btn active" data-profile="auto" title="Auto-detect: screenshot vs photo">Auto</button>
            <button type="button" class="profile-btn" data-profile="photo" title="Optimize for photos (smaller file)">Photo</button>
            <button type="button" class="profile-btn" data-profile="screenshot" title="Optimize for screenshots (clearer text)">Screenshot</button>
          </div>
        </div>
        <div class="image-upload-area" id="image-upload-area">
          <div class="image-upload-prompt" id="image-upload-prompt">
            ${icon("plus")}
            <span>Drop images, paste from clipboard, or click to upload</span>
            <span class="form-hint">Max 10 images. Auto-compressed to save space.</span>
          </div>
          <input type="file" id="image-file-input" accept="image/*" multiple hidden />
        </div>
        <div class="image-preview-grid" id="image-preview-grid">
          ${images.map((img, i) => `
            <div class="image-preview-item" data-image-index="${i}">
              <img src="${img.dataUrl}" alt="Image ${i + 1}" />
              <button type="button" class="image-remove-btn" data-remove-image="${i}" title="Remove">${icon("close")}</button>
              <span class="image-size-label">${formatBytes(img.dataUrl.length)}${img.profile ? ` · ${img.profile}` : ""}</span>
            </div>
          `).join("")}
        </div>
        <div class="image-limit-warning" id="image-limit-warning" hidden></div>
      </div>

      <div class="form-group" id="form-excerpt-group">
        <label class="label" id="form-excerpt-label" for="entry-excerpt">Excerpt / Quote</label>
        <textarea id="entry-excerpt" name="excerpt" class="textarea" rows="3" placeholder="Key excerpt or quote from the source...">${esc(excerpt)}</textarea>
      </div>

      <div class="form-group" id="form-content-group">
        <label class="label" for="entry-content">Content</label>
        <textarea id="entry-content" name="content" class="textarea" rows="5" placeholder="Write your note or thought...">${esc(content)}</textarea>
      </div>

      <div class="form-group" id="form-note-group">
        <label class="label" for="entry-note">My Note</label>
        <textarea id="entry-note" name="myNote" class="textarea" rows="3" placeholder="Your personal annotation...">${esc(myNote)}</textarea>
        <span class="form-hint">Your personal thoughts about this entry</span>
      </div>

      <div class="form-group" id="form-tags-group">
        <label class="label">Tags</label>
        <div class="tag-input-wrapper" id="tag-input-wrapper">
          ${tagsHtml}
          <input
            type="text"
            class="tag-input-field"
            id="tag-input"
            placeholder="Add tags (press Enter)..."
          />
        </div>
        <span class="form-hint">Press Enter or comma to add a tag</span>
      </div>

      <div class="form-group" id="form-related-group">
        <label class="label">Links to</label>
        <div class="related-search-wrapper" id="related-search-wrapper">
          <input
            type="text"
            class="input"
            id="related-search-input"
            placeholder="Search by title or #number..."
            autocomplete="off"
          />
          <div class="related-search-dropdown" id="related-search-dropdown" hidden></div>
        </div>
        <div class="related-entries-list" id="related-entries-list">
          ${relatedHtml}
        </div>
        <span class="form-hint">Other entries this one points to. They will see this entry under "Linked from".</span>
      </div>

      <div class="form-group" id="form-summary-group" ${existingSummary ? "" : "hidden"}>
        <label class="label" for="entry-summary">AI Summary</label>
        <textarea id="entry-summary" name="summary" class="textarea" rows="2" placeholder="AI-generated summary will appear here...">${esc(existingSummary)}</textarea>
      </div>

      <div class="form-group" id="form-actions-group" ${existingActions.length ? "" : "hidden"}>
        <label class="label">Action Items</label>
        <ul class="ai-action-items" id="ai-action-items-list">
          ${existingActions.map((a) => `<li>${esc(a)}</li>`).join("")}
        </ul>
      </div>

      <div class="form-group" id="duplicate-warning-group" hidden>
        <div class="duplicate-warning" id="duplicate-warning"></div>
      </div>
    </form>
  `;
}

export function getEntryFormFooter(isEdit = false) {
  return `
    <span class="entry-form-footer-status" id="entry-form-save-status" aria-live="polite"></span>
    <div class="entry-form-footer-actions">
      <button type="button" class="btn btn-outline" data-close-modal="entry-form-modal">Cancel</button>
      <button type="button" class="btn btn-primary" id="entry-form-save">
        ${isEdit ? "Save Changes" : "Create Entry"}
      </button>
    </div>
  `;
}

/**
 * Collect all form values into a plain object.
 * Reads from the live DOM inside #entry-form.
 */
export function collectFormData() {
  const form = document.getElementById("entry-form");
  if (!form) return null;

  const id = form.querySelector('[name="id"]').value || null;
  const type = form.querySelector('[name="type"]').value;
  const title = form.querySelector('[name="title"]').value.trim();
  const sourceUrl = form.querySelector('[name="sourceUrl"]').value.trim();
  const excerpt = form.querySelector('[name="excerpt"]').value.trim();
  const content = form.querySelector('[name="content"]').value.trim();
  const myNote = form.querySelector('[name="myNote"]').value.trim();
  const status = form.querySelector('[name="status"]').value;
  const summary = form.querySelector('[name="summary"]')?.value.trim() || "";
  const aiLanguageRaw = form.querySelector('[name="aiLanguage"]')?.value || "en";
  const aiLanguage = aiLanguageRaw === "vi" ? "vi" : "en";
  const createdDateRaw = form.querySelector('[name="createdDate"]')?.value || "";
  const createdDate = /^\d{4}-\d{2}-\d{2}$/.test(createdDateRaw) ? createdDateRaw : "";

  // Collect tags from rendered tag elements
  const tags = [];
  form.querySelectorAll("#tag-input-wrapper .tag[data-tag]").forEach((el) => {
    tags.push(el.dataset.tag);
  });

  // Collect images from preview grid
  const images = getFormImages();

  // Collect related entry ids
  const relatedEntryIds = [];
  form.querySelectorAll("#related-entries-list .related-entry-chip[data-related-id]").forEach((el) => {
    relatedEntryIds.push(el.dataset.relatedId);
  });

  // AI action items (if present in DOM)
  const aiActionItems = [];
  form.querySelectorAll("#ai-action-items-list li").forEach((li) => {
    const text = li.textContent?.trim();
    if (text) aiActionItems.push(text);
  });

  return { id, type, title, sourceUrl, excerpt, content, myNote, tags, status, images, relatedEntryIds, summary, aiActionItems, aiLanguage, createdDate };
}

/**
 * Get current images array from the form state.
 * Stored on the form element as _images.
 */
export function getFormImages() {
  const form = document.getElementById("entry-form");
  return form?._images || [];
}

/**
 * Set images array on the form state and re-render preview.
 */
export function setFormImages(images) {
  const form = document.getElementById("entry-form");
  if (!form) return;
  form._images = images;
  renderImagePreviews();
  updateImageWarning();
}

function renderImagePreviews() {
  const grid = document.getElementById("image-preview-grid");
  const form = document.getElementById("entry-form");
  if (!grid || !form) return;

  const images = form._images || [];
  grid.innerHTML = images
    .map(
      (img, i) => `
    <div class="image-preview-item" data-image-index="${i}">
      <img src="${img.dataUrl}" alt="Image ${i + 1}" />
      <button type="button" class="image-remove-btn" data-remove-image="${i}" title="Remove">${icon("close")}</button>
      <span class="image-size-label">${formatBytes(img.dataUrl.length)}${img.profile ? ` · ${img.profile}` : ""}</span>
    </div>
  `
    )
    .join("");
}

function updateImageWarning() {
  const warningEl = document.getElementById("image-limit-warning");
  const form = document.getElementById("entry-form");
  if (!warningEl || !form) return;

  const images = form._images || [];
  if (images.length === 0) {
    warningEl.hidden = true;
    return;
  }

  const check = checkImageLimits(images);
  if (check.level === "ok") {
    warningEl.hidden = true;
  } else {
    warningEl.hidden = false;
    warningEl.className = `image-limit-warning image-limit-${check.level}`;
    warningEl.textContent = check.message;
  }
}

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
