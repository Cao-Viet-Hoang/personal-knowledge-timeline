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
  createEntry,
  updateEntry,
  deleteEntry,
  toggleStar,
  setStatus,
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
  parseAndFillJson,
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
    });
  }

  closeModal("entry-form-modal");
  render();
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
    });
  });

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
 * Show the Firebase credentials modal and wait for the user to connect.
 * Resolves when Firebase is initialized successfully.
 */
function showFirebaseSetup() {
  return new Promise((resolve) => {
    const savedCred = getSavedCredentials();
    const container = document.getElementById("modals");
    container.insertAdjacentHTML("beforeend", renderFirebaseModal(savedCred));

    // Parse JSON button
    const parseBtn = document.getElementById("fb-parse-json");
    if (parseBtn) {
      parseBtn.addEventListener("click", () => {
        const textarea = document.getElementById("fb-json-paste");
        if (!textarea) return;
        const ok = parseAndFillJson(textarea.value);
        if (!ok) {
          showFirebaseError("Invalid JSON. Paste the firebaseConfig object from Firebase Console.");
        } else {
          hideFirebaseError();
          textarea.value = "";
        }
      });
    }

    // Connect button
    const connectBtn = document.getElementById("fb-connect-btn");
    if (connectBtn) {
      connectBtn.addEventListener("click", async () => {
        hideFirebaseError();
        const cred = collectFirebaseCredentials();
        const check = validateCredentials(cred);

        if (!check.valid) {
          showFirebaseError(`Missing required fields: ${check.missing.join(", ")}`);
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
        } catch {
          // Show modal so user can fix credentials
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
