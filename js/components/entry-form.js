/**
 * Entry form component.
 * Renders the new/edit entry form inside a modal.
 * Collects form data for the store.
 */

import { icon } from "../utils/icons.js";

export function renderEntryForm(entry = null) {
  const type = entry?.type || "link";
  const title = entry?.title || "";
  const sourceUrl = entry?.sourceUrl || "";
  const excerpt = entry?.excerpt || "";
  const content = entry?.content || "";
  const myNote = entry?.myNote || "";
  const tags = entry?.tags || [];
  const status = entry?.status || "inbox";

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

  return `
    <form class="entry-form" id="entry-form" novalidate>
      <input type="hidden" name="id" value="${entry?.id || ""}" />
      <input type="hidden" name="type" value="${type}" />

      <div class="form-group">
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

      <div class="form-group">
        <label class="label" for="entry-title">Title <span style="color: hsl(var(--destructive))">*</span></label>
        <input type="text" id="entry-title" name="title" class="input" placeholder="Entry title..." value="${esc(title)}" required />
      </div>

      <div class="form-group" id="form-source-group">
        <label class="label" for="entry-source">Source URL</label>
        <input type="url" id="entry-source" name="sourceUrl" class="input" placeholder="https://..." value="${esc(sourceUrl)}" />
      </div>

      <div class="form-group" id="form-excerpt-group">
        <label class="label" for="entry-excerpt">Excerpt / Quote</label>
        <textarea id="entry-excerpt" name="excerpt" class="textarea" rows="3" placeholder="Key excerpt or quote from the source...">${esc(excerpt)}</textarea>
      </div>

      <div class="form-group" id="form-content-group">
        <label class="label" for="entry-content">Content</label>
        <textarea id="entry-content" name="content" class="textarea" rows="5" placeholder="Write your note or thought...">${esc(content)}</textarea>
      </div>

      <div class="form-group">
        <label class="label" for="entry-note">My Note</label>
        <textarea id="entry-note" name="myNote" class="textarea" rows="3" placeholder="Your personal annotation...">${esc(myNote)}</textarea>
        <span class="form-hint">Your personal thoughts about this entry</span>
      </div>

      <div class="form-group">
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

      <div class="form-row">
        <div class="form-group">
          <label class="label" for="entry-status">Status</label>
          <select id="entry-status" name="status" class="select">
            <option value="inbox" ${status === "inbox" ? "selected" : ""}>Inbox</option>
            <option value="processed" ${status === "processed" ? "selected" : ""}>Processed</option>
            <option value="archived" ${status === "archived" ? "selected" : ""}>Archived</option>
          </select>
        </div>
      </div>
    </form>
  `;
}

export function getEntryFormFooter(isEdit = false) {
  return `
    <button type="button" class="btn btn-outline" data-close-modal="entry-form-modal">Cancel</button>
    <button type="button" class="btn btn-primary" id="entry-form-save">
      ${isEdit ? "Save Changes" : "Create Entry"}
    </button>
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

  // Collect tags from rendered tag elements
  const tags = [];
  form.querySelectorAll("#tag-input-wrapper .tag[data-tag]").forEach((el) => {
    tags.push(el.dataset.tag);
  });

  return { id, type, title, sourceUrl, excerpt, content, myNote, tags, status };
}

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
