/**
 * Main application entry point.
 * Manages routing, state, and wires all components to the store.
 */

import { $, on } from "./utils/dom.js";
import { icon } from "./utils/icons.js";
import config from "./config.js";

import {
  initStore,
  setAdapter,
  getEntry,
  getAllEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  toggleStar,
  setStatus,
  linkEntries,
  unlinkEntries,
  filterEntries,
} from "./store/store.js";

import localAdapter from "./store/local-adapter.js";
import firebaseAdapter, {
  getSavedCredentials,
  saveCredentials,
  clearCredentials,
  validateCredentials,
  initFirebase,
} from "./store/firebase-adapter.js";

import { renderSidebar } from "./components/sidebar.js";
import { renderTimeline } from "./components/timeline.js";
import { renderSearch } from "./components/search.js";
import { renderFilterBar } from "./components/filters.js";
import { renderReview } from "./components/review.js";
import { renderEntryDetail } from "./components/entry-detail.js";
import { renderEntryForm, getEntryFormFooter, collectFormData, getFormImages, setFormImages } from "./components/entry-form.js";
import { createModalShell, openModal, closeModal, initModalListeners } from "./components/modal.js";
import { compressImages, getImagesFromClipboard, getImagesFromDrop, checkImageLimits } from "./utils/image.js";
import {
  renderFirebaseModal,
  collectFirebaseCredentials,
  showFirebaseError,
  hideFirebaseError,
  closeFirebaseModal,
} from "./components/firebase-modal.js";

// ── App State ──────────────────────────────────────────

let currentView = "timeline";
let activeFilters = {};

// ── DOM References ─────────────────────────────────────

const sidebarEl = $("#sidebar");
const topBarTitle = $("#top-bar-title");
const pageContent = $("#page-content");
const filterBarEl = $("#filter-bar");
const modalsContainer = $("#modals");

// ── View Titles ────────────────────────────────────────

const VIEW_TITLES = {
  timeline: "Timeline",
  inbox: "Inbox",
  starred: "Starred",
  archive: "Archived",
  "type-link": "Links",
  "type-note": "Notes",
  "type-thought": "Thoughts",
  "type-quote": "Quotes",
  search: "Search",
  review: "Review",
};

// ── Sidebar (mobile drawer) ───────────────────────────

const sidebarBackdrop = $("#sidebar-backdrop");
const sidebarToggleBtn = $("#sidebar-toggle");

function openSidebar() {
  sidebarEl.classList.add("open");
  sidebarBackdrop.classList.add("open");
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  sidebarBackdrop.classList.remove("open");
}

function initSidebar() {
  sidebarToggleBtn?.addEventListener("click", () => {
    sidebarEl.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  sidebarBackdrop?.addEventListener("click", closeSidebar);
}

// ── Navigation ─────────────────────────────────────────

function navigate(view) {
  currentView = view;
  activeFilters = {};
  closeSidebar();
  render();
}

// ── Get entries for current view ───────────────────────

function getViewEntries() {
  // Build filter criteria from view + user-selected filters
  const criteria = { ...activeFilters };

  switch (currentView) {
    case "inbox":
      criteria.status = criteria.status || "inbox";
      break;
    case "starred":
      criteria.starred = true;
      break;
    case "archive":
      criteria.status = criteria.status || "archived";
      break;
    case "type-link":
      criteria.type = criteria.type || "link";
      break;
    case "type-note":
      criteria.type = criteria.type || "note";
      break;
    case "type-thought":
      criteria.type = criteria.type || "thought";
      break;
    case "type-quote":
      criteria.type = criteria.type || "quote";
      break;
  }

  return filterEntries(criteria);
}

// ── Render ─────────────────────────────────────────────

function render() {
  // Sidebar
  renderSidebar(sidebarEl, { activeView: currentView, onNavigate: navigate });

  // Top bar title
  topBarTitle.textContent = VIEW_TITLES[currentView] || "Timeline";

  // Filter bar
  if (currentView === "search" || currentView === "review") {
    filterBarEl.innerHTML = "";
  } else {
    renderFilterBar(filterBarEl, {
      activeFilters,
      onFilterChange: (filters) => {
        activeFilters = filters;
        render();
      },
    });
  }

  // Main content area
  if (currentView === "search") {
    renderSearchView();
  } else if (currentView === "review") {
    renderReviewView();
  } else {
    renderTimelineView();
  }
}

function renderTimelineView() {
  const entries = getViewEntries();
  renderTimeline(pageContent, entries, {
    onEntryClick: openEntryDetail,
    onNewEntry: handleNewEntry,
    onStar: handleToggleStar,
    onEdit: openEditForm,
  });
}

function renderSearchView() {
  renderSearch(pageContent, {
    onEntryClick: openEntryDetail,
    onStar: handleToggleStar,
    onEdit: openEditForm,
  });
}

function renderReviewView() {
  renderReview(pageContent, {
    onEntryClick: openEntryDetail,
  });
}

// ── Entry Detail ───────────────────────────────────────

function openEntryDetail(entryId) {
  const entry = getEntry(entryId);
  if (!entry) return;

  const bodyEl = $("#entry-detail-modal-body");
  bodyEl.innerHTML = renderEntryDetail(entry);
  openModal("entry-detail-modal");
}

function refreshEntryDetail(entryId) {
  const entry = getEntry(entryId);
  if (!entry) {
    closeModal("entry-detail-modal");
    return;
  }
  const bodyEl = $("#entry-detail-modal-body");
  bodyEl.innerHTML = renderEntryDetail(entry);
}

// ── Entry Form ─────────────────────────────────────────

function handleNewEntry(quickCaptureData) {
  if (quickCaptureData?.quickCapture) {
    // Quick capture: create immediately, no form
    const data = { ...quickCaptureData };
    delete data.quickCapture;

    // Auto-generate title for URLs
    if (data.type === "link" && data.sourceUrl && !data.title) {
      data.title = data.sourceUrl;
    }

    createEntry(data);
    render();
    return;
  }

  // Full form modal
  const bodyEl = $("#entry-form-modal-body");
  bodyEl.innerHTML = renderEntryForm(null);
  $("#entry-form-modal .modal-title").textContent = "New Entry";
  updateFormFooter(false);
  openModal("entry-form-modal");
  initFormInteractions();
}

function openEditForm(entryId) {
  const entry = getEntry(entryId);
  if (!entry) return;

  closeModal("entry-detail-modal");

  const bodyEl = $("#entry-form-modal-body");
  bodyEl.innerHTML = renderEntryForm(entry);
  $("#entry-form-modal .modal-title").textContent = "Edit Entry";
  updateFormFooter(true);
  openModal("entry-form-modal");
  initFormInteractions();
}

function updateFormFooter(isEdit) {
  const footer = $("#entry-form-modal .modal-footer");
  if (footer) footer.innerHTML = getEntryFormFooter(isEdit);
}

function handleSaveEntry() {
  const data = collectFormData();
  if (!data) return;

  // Validation
  if (!data.title.trim()) {
    const titleInput = $("#entry-title");
    if (titleInput) {
      titleInput.style.borderColor = "hsl(var(--destructive))";
      titleInput.focus();
      titleInput.addEventListener("input", () => {
        titleInput.style.borderColor = "";
      }, { once: true });
    }
    return;
  }

  // Image size check
  if (data.images && data.images.length > 0) {
    const check = checkImageLimits(data.images);
    if (!check.ok) {
      alert(check.message);
      return;
    }
  }

  if (data.id) {
    // Editing existing entry
    updateEntry(data.id, {
      type: data.type,
      title: data.title,
      sourceUrl: data.sourceUrl,
      excerpt: data.excerpt,
      content: data.content,
      myNote: data.myNote,
      tags: data.tags,
      status: data.status,
      images: data.images || [],
      relatedEntryIds: data.relatedEntryIds || [],
    });
  } else {
    // Creating new entry
    createEntry({
      type: data.type,
      title: data.title,
      sourceUrl: data.sourceUrl,
      excerpt: data.excerpt,
      content: data.content,
      myNote: data.myNote,
      tags: data.tags,
      images: data.images || [],
      relatedEntryIds: data.relatedEntryIds || [],
    });
  }

  closeModal("entry-form-modal");
  render();
}

/**
 * Show/hide form fields based on entry type.
 *
 * | Field      | Link | Note | Thought | Quote |
 * |------------|------|------|---------|-------|
 * | Title      |  ✅  |  ✅  |   ✅    |  ✅   |
 * | Source URL |  ✅  |  ❌  |   ❌    |  ✅   |
 * | Excerpt    |  ✅  |  ❌  |   ❌    |  ✅   |
 * | Content    |  ❌  |  ✅  |   ✅    |  ❌   |
 * | My Note    |  ✅  |  ✅  |   ❌    |  ✅   |
 */
const TYPE_FIELD_MAP = {
  link:    { source: true,  excerpt: true,  content: false, note: true  },
  note:    { source: false, excerpt: false, content: true,  note: true  },
  thought: { source: false, excerpt: false, content: true,  note: false },
  quote:   { source: true,  excerpt: true,  content: false, note: true  },
};

function updateFormFieldsByType(type) {
  const cfg = TYPE_FIELD_MAP[type] || TYPE_FIELD_MAP.link;

  const sourceGroup  = document.getElementById("form-source-group");
  const excerptGroup = document.getElementById("form-excerpt-group");
  const contentGroup = document.getElementById("form-content-group");
  const noteGroup    = document.getElementById("form-note-group");

  if (sourceGroup)  sourceGroup.hidden  = !cfg.source;
  if (excerptGroup) excerptGroup.hidden = !cfg.excerpt;
  if (contentGroup) contentGroup.hidden = !cfg.content;
  if (noteGroup)    noteGroup.hidden    = !cfg.note;

  // Update excerpt label & placeholder for quote type
  const excerptLabel = document.getElementById("form-excerpt-label");
  const excerptField = document.getElementById("entry-excerpt");
  if (excerptLabel && excerptField) {
    if (type === "quote") {
      excerptLabel.textContent = "Quote Text";
      excerptField.placeholder = "The quote you want to save...";
    } else {
      excerptLabel.textContent = "Excerpt / Quote";
      excerptField.placeholder = "Key excerpt or quote from the source...";
    }
  }

  // Update content placeholder per type
  const contentField = document.getElementById("entry-content");
  if (contentField) {
    if (type === "thought") {
      contentField.placeholder = "Write your thought...";
    } else {
      contentField.placeholder = "Write your note...";
    }
  }
}

function initFormInteractions() {
  // Type selector toggle
  const typeButtons = document.querySelectorAll("[data-form-type]");
  typeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // Update hidden input
      const hiddenType = document.querySelector('#entry-form [name="type"]');
      if (hiddenType) hiddenType.value = btn.dataset.formType;
      // Update field visibility
      updateFormFieldsByType(btn.dataset.formType);
    });
  });

  // Set initial field visibility
  const currentType = document.querySelector('#entry-form [name="type"]')?.value || "link";
  updateFormFieldsByType(currentType);

  // Tag input
  const tagInput = $("#tag-input");
  if (tagInput) {
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTagToForm(tagInput.value);
        tagInput.value = "";
      }
      // Backspace removes last tag if input is empty
      if (e.key === "Backspace" && !tagInput.value) {
        const tags = document.querySelectorAll("#tag-input-wrapper .tag");
        if (tags.length > 0) {
          tags[tags.length - 1].remove();
        }
      }
    });
  }

  // Click on tag-input-wrapper focuses the input
  const wrapper = $("#tag-input-wrapper");
  if (wrapper) {
    wrapper.addEventListener("click", () => tagInput?.focus());
  }

  // ── Image interactions ─────────────────────────────
  initFormImageHandlers();

  // ── Related entries search ─────────────────────────
  initRelatedEntriesSearch();
}

function initRelatedEntriesSearch() {
  const input = document.getElementById("related-search-input");
  const dropdown = document.getElementById("related-search-dropdown");
  const list = document.getElementById("related-entries-list");
  if (!input || !dropdown || !list) return;

  // Get current entry id (if editing) to exclude from results
  const form = document.getElementById("entry-form");
  const currentId = form?.querySelector('[name="id"]')?.value || null;

  let debounceTimer = null;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim().toLowerCase();

    if (query.length < 2) {
      dropdown.hidden = true;
      dropdown.innerHTML = "";
      return;
    }

    debounceTimer = setTimeout(() => {
      // Get already-linked ids
      const linkedIds = new Set();
      list.querySelectorAll("[data-related-id]").forEach((el) => {
        linkedIds.add(el.dataset.relatedId);
      });

      // Search entries by title
      const results = getAllEntries()
        .filter((e) => {
          if (e.id === currentId) return false;
          if (linkedIds.has(e.id)) return false;
          return e.title.toLowerCase().includes(query);
        })
        .slice(0, 6);

      if (results.length === 0) {
        dropdown.innerHTML = `<div class="related-search-empty">No matching entries</div>`;
      } else {
        dropdown.innerHTML = results
          .map(
            (e) => `
          <div class="related-search-item" data-select-related="${e.id}">
            <span class="type-dot type-dot--${e.type}"></span>
            <span class="related-search-item-title">${escapeForHtml(e.title)}</span>
            <span class="related-search-item-type">${e.type}</span>
          </div>
        `
          )
          .join("");
      }
      dropdown.hidden = false;
    }, 200);
  });

  // Select from dropdown
  dropdown.addEventListener("click", (e) => {
    const item = e.target.closest("[data-select-related]");
    if (!item) return;

    const entryId = item.dataset.selectRelated;
    const entry = getEntry(entryId);
    if (!entry) return;

    // Add chip to list
    const chip = document.createElement("div");
    chip.className = "related-entry-chip";
    chip.dataset.relatedId = entry.id;
    chip.innerHTML = `
      <span class="type-dot type-dot--${entry.type}"></span>
      <span class="related-entry-chip-title">${escapeForHtml(entry.title)}</span>
      <button type="button" class="related-entry-chip-remove" data-remove-related="${entry.id}">${icon("close")}</button>
    `;
    list.appendChild(chip);

    // Clear input & hide dropdown
    input.value = "";
    dropdown.hidden = true;
    dropdown.innerHTML = "";
  });

  // Remove related entry chip
  list.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-related]");
    if (!removeBtn) return;
    const chip = removeBtn.closest(".related-entry-chip");
    if (chip) chip.remove();
  });

  // Hide dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#related-search-wrapper")) {
      dropdown.hidden = true;
    }
  });

  // Hide dropdown on Escape
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      dropdown.hidden = true;
      input.blur();
    }
  });
}

function escapeForHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function initFormImageHandlers() {
  const form = document.getElementById("entry-form");
  if (!form) return;

  // Initialize _images from existing entry data
  const existingImages = [];
  form.querySelectorAll("#image-preview-grid .image-preview-item img").forEach((img) => {
    existingImages.push({ dataUrl: img.src });
  });
  form._images = existingImages;
  form._imageProfile = "auto"; // default profile

  const uploadArea = document.getElementById("image-upload-area");
  const fileInput = document.getElementById("image-file-input");

  if (!uploadArea || !fileInput) return;

  // Profile toggle buttons
  const profileBtns = document.querySelectorAll("#image-profile-toggle .profile-btn");
  profileBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      profileBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      form._imageProfile = btn.dataset.profile;
    });
  });

  // Click to upload
  uploadArea.addEventListener("click", () => fileInput.click());

  // File input change
  fileInput.addEventListener("change", async () => {
    if (fileInput.files.length > 0) {
      await addImagesToForm(fileInput.files);
      fileInput.value = "";
    }
  });

  // Drag & drop
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("drag-over");
  });
  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("drag-over");
  });
  uploadArea.addEventListener("drop", async (e) => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    const files = getImagesFromDrop(e);
    if (files.length > 0) await addImagesToForm(files);
  });

  // Paste anywhere in the form modal
  const modalBody = document.getElementById("entry-form-modal-body");
  if (modalBody) {
    modalBody.addEventListener("paste", async (e) => {
      const files = getImagesFromClipboard(e);
      if (files.length > 0) {
        e.preventDefault();
        await addImagesToForm(files);
      }
    });
  }
}

async function addImagesToForm(files) {
  const form = document.getElementById("entry-form");
  if (!form) return;

  const current = form._images || [];
  const profile = form._imageProfile || "auto";
  const uploadArea = document.getElementById("image-upload-area");

  // Show loading state
  if (uploadArea) uploadArea.classList.add("compressing");

  try {
    const compressed = await compressImages(files, profile);
    const merged = [...current, ...compressed];
    setFormImages(merged);
  } catch (err) {
    console.error("[Image] Compression failed:", err);
  } finally {
    if (uploadArea) uploadArea.classList.remove("compressing");
  }
}

function addTagToForm(rawValue) {
  const value = rawValue.trim().toLowerCase().replace(/,/g, "").replace(/^#/, "");
  if (!value) return;

  const wrapper = document.getElementById("tag-input-wrapper");
  const input = document.getElementById("tag-input");
  if (!wrapper || !input) return;

  // Check for duplicate
  const existing = wrapper.querySelectorAll(".tag[data-tag]");
  for (const el of existing) {
    if (el.dataset.tag === value) return;
  }

  const tagEl = document.createElement("span");
  tagEl.className = "tag";
  tagEl.dataset.tag = value;
  tagEl.innerHTML = `#${value} <button type="button" class="tag-remove" data-remove-tag="${value}">${icon("close")}</button>`;
  wrapper.insertBefore(tagEl, input);
}

// ── Image Lightbox ─────────────────────────────────────

function openImageLightbox(images, startIndex = 0) {
  let currentIndex = startIndex;

  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.innerHTML = `
    <div class="lightbox-backdrop"></div>
    <div class="lightbox-content">
      ${images.length > 1 ? `<button class="lightbox-nav lightbox-prev" aria-label="Previous">${icon("chevronLeft")}</button>` : ""}
      <img class="lightbox-img" src="${images[currentIndex].dataUrl}" alt="Image ${currentIndex + 1}" />
      ${images.length > 1 ? `<button class="lightbox-nav lightbox-next" aria-label="Next">${icon("chevronRight")}</button>` : ""}
      <button class="lightbox-close" aria-label="Close">${icon("close")}</button>
      ${images.length > 1 ? `<span class="lightbox-counter">${currentIndex + 1} / ${images.length}</span>` : ""}
    </div>
  `;

  document.body.appendChild(lightbox);
  // Trigger open animation
  requestAnimationFrame(() => lightbox.classList.add("open"));

  const img = lightbox.querySelector(".lightbox-img");
  const counter = lightbox.querySelector(".lightbox-counter");

  function showImage(index) {
    currentIndex = index;
    img.src = images[index].dataUrl;
    if (counter) counter.textContent = `${index + 1} / ${images.length}`;
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    setTimeout(() => lightbox.remove(), 200);
  }

  lightbox.querySelector(".lightbox-backdrop").addEventListener("click", closeLightbox);
  lightbox.querySelector(".lightbox-close").addEventListener("click", closeLightbox);

  const prevBtn = lightbox.querySelector(".lightbox-prev");
  const nextBtn = lightbox.querySelector(".lightbox-next");
  if (prevBtn) prevBtn.addEventListener("click", () => showImage((currentIndex - 1 + images.length) % images.length));
  if (nextBtn) nextBtn.addEventListener("click", () => showImage((currentIndex + 1) % images.length));

  // Keyboard navigation
  function onKeyDown(e) {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft" && prevBtn) showImage((currentIndex - 1 + images.length) % images.length);
    if (e.key === "ArrowRight" && nextBtn) showImage((currentIndex + 1) % images.length);
  }
  document.addEventListener("keydown", onKeyDown);

  // Cleanup keyboard handler when lightbox is removed
  const observer = new MutationObserver(() => {
    if (!document.body.contains(lightbox)) {
      document.removeEventListener("keydown", onKeyDown);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
}

// ── Actions ────────────────────────────────────────────

function handleToggleStar(entryId) {
  toggleStar(entryId);
  render();
}

function handleDelete(entryId) {
  if (!confirm("Are you sure you want to delete this entry?")) return;
  deleteEntry(entryId);
  closeModal("entry-detail-modal");
  render();
}

function handleStatusChange(entryId, newStatus) {
  setStatus(entryId, newStatus);
  refreshEntryDetail(entryId);
  render();
}

// ── Global Event Delegation ────────────────────────────

function initGlobalDelegation() {
  // Detail modal actions
  on(document, "click", "[data-action='detail-star']", (e, el) => {
    e.stopPropagation();
    const id = el.dataset.entryId;
    toggleStar(id);
    refreshEntryDetail(id);
    render();
  });

  on(document, "click", "[data-action='detail-edit']", (e, el) => {
    openEditForm(el.dataset.entryId);
  });

  on(document, "click", "[data-action='detail-status']", (e, el) => {
    handleStatusChange(el.dataset.entryId, el.dataset.nextStatus);
  });

  on(document, "click", "[data-action='detail-delete']", (e, el) => {
    handleDelete(el.dataset.entryId);
  });

  // Image lightbox
  on(document, "click", "[data-action='open-lightbox']", (e, el) => {
    const entryId = el.dataset.entryId;
    const index = parseInt(el.dataset.imageIndex, 10);
    const entry = getEntry(entryId);
    if (entry?.images?.[index]) {
      openImageLightbox(entry.images, index);
    }
  });

  // Related entry click inside detail modal
  on(document, "click", "[data-related-entry-id]", (e, el) => {
    openEntryDetail(el.dataset.relatedEntryId);
  });

  // Save entry form
  on(document, "click", "#entry-form-save", () => {
    handleSaveEntry();
  });

  // Remove tag in form
  on(document, "click", "[data-remove-tag]", (e, el) => {
    const tag = el.closest(".tag");
    if (tag) tag.remove();
  });

  // Remove image in form
  on(document, "click", "[data-remove-image]", (e, el) => {
    e.stopPropagation();
    const index = parseInt(el.dataset.removeImage, 10);
    const images = getFormImages();
    if (index >= 0 && index < images.length) {
      images.splice(index, 1);
      setFormImages(images);
    }
  });

  // Firebase disconnect (prod mode)
  on(document, "click", "[data-action='firebase-disconnect']", () => {
    handleFirebaseDisconnect();
  });
}

// ── Keyboard Shortcuts ─────────────────────────────────

function initShortcuts() {
  on(document, "keydown", (e) => {
    // Ctrl+K → Search
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      navigate("search");
      requestAnimationFrame(() => {
        const input = $("#search-page-input");
        if (input) input.focus();
      });
    }

    // Ctrl+N → New entry
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      handleNewEntry();
    }
  });
}

// ── Create Modal Shells ────────────────────────────────

function createModals() {
  modalsContainer.innerHTML = `
    ${createModalShell("entry-detail-modal", "Entry Detail", { size: "lg" })}
    ${createModalShell("entry-form-modal", "New Entry", {
      size: "lg",
      footerHtml: getEntryFormFooter(false),
    })}
  `;
}

// ── Top Bar Bindings ───────────────────────────────────

function initTopBar() {
  const topBarSearch = $("#top-bar-search");
  if (topBarSearch) {
    topBarSearch.addEventListener("click", () => navigate("search"));
  }

  const topBarNew = $("#top-bar-new");
  if (topBarNew) {
    topBarNew.addEventListener("click", () => handleNewEntry());
  }
}

// ── Bootstrap ──────────────────────────────────────────

/**
 * Boot the app after the adapter is ready.
 */
async function bootApp() {
  await initStore();

  createModals();
  initModalListeners();
  initGlobalDelegation();
  initShortcuts();
  initTopBar();
  initSidebar();

  render();
}

/**
 * Disconnect from Firebase and show the credentials modal again.
 * Credentials are kept in localStorage so the modal is pre-filled.
 */
async function handleFirebaseDisconnect() {
  clearCredentials();
  // Reload the page to reset Firebase state and show the modal
  window.location.reload();
}

/**
 * Show the Firebase credentials modal and wait for the user to connect.
 * Resolves when Firebase is initialized successfully.
 */
function showFirebaseSetup() {
  return new Promise((resolve) => {
    const savedCred = getSavedCredentials();
    const container = document.getElementById("modals");
    container.insertAdjacentHTML("beforeend", renderFirebaseModal(savedCred));

    // Connect button
    const connectBtn = document.getElementById("fb-connect-btn");
    if (connectBtn) {
      connectBtn.addEventListener("click", async () => {
        hideFirebaseError();
        const { cred, error } = collectFirebaseCredentials();

        if (error) {
          showFirebaseError(error);
          return;
        }

        connectBtn.disabled = true;
        connectBtn.textContent = "Connecting...";

        try {
          await initFirebase(cred);
          saveCredentials(cred);
          closeFirebaseModal();
          resolve();
        } catch (err) {
          console.error("[Firebase] Init failed:", err);
          showFirebaseError(`Connection failed: ${err.message}. Check your credentials.`);
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect to Firebase";
        }
      });
    }

    // If credentials are already saved, auto-try
    if (savedCred && validateCredentials(savedCred).valid) {
      (async () => {
        try {
          await initFirebase(savedCred);
          closeFirebaseModal();
          resolve();
        } catch (err) {
          showFirebaseError(`Auto-connect failed: ${err.message}. Please re-enter your credentials.`);
        }
      })();
    }
  });
}

async function init() {
  if (config.isDev) {
    // Dev mode: use localStorage adapter
    setAdapter(localAdapter);
    await bootApp();
  } else {
    // Prod mode: need Firebase credentials first
    await showFirebaseSetup();
    setAdapter(firebaseAdapter);
    await bootApp();
  }

  // Show env badge in console
  console.log(`[PKT] Running in ${config.env.toUpperCase()} mode`);
}

document.addEventListener("DOMContentLoaded", init);
