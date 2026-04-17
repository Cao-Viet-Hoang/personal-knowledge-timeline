/**
 * Main application entry point.
 * Manages routing, state, and wires all components to the store.
 */

import { $, on } from "./utils/dom.js";
import { icon } from "./utils/icons.js";

import {
  initStore,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  toggleStar,
  setStatus,
  filterEntries,
} from "./store/store.js";

import { renderSidebar } from "./components/sidebar.js";
import { renderTimeline } from "./components/timeline.js";
import { renderSearch } from "./components/search.js";
import { renderFilterBar } from "./components/filters.js";
import { renderReview } from "./components/review.js";
import { renderEntryDetail } from "./components/entry-detail.js";
import { renderEntryForm, getEntryFormFooter, collectFormData } from "./components/entry-form.js";
import { createModalShell, openModal, closeModal, initModalListeners } from "./components/modal.js";

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

async function init() {
  // Initialize data store (loads from localStorage or seeds from JSON)
  await initStore();

  createModals();
  initModalListeners();
  initGlobalDelegation();
  initShortcuts();
  initTopBar();
  initSidebar();

  render();
}

document.addEventListener("DOMContentLoaded", init);
