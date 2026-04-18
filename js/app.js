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
import { openConfirm, initConfirmModal } from "./components/confirm-modal.js";
import { compressImages, getImagesFromClipboard, getImagesFromDrop, checkImageLimits } from "./utils/image.js";
import {
  renderFirebaseModal,
  collectFirebaseCredentials,
  showFirebaseError,
  hideFirebaseError,
  closeFirebaseModal,
} from "./components/firebase-modal.js";
import { renderAskView } from "./components/ask-view.js";
import { renderDigestView } from "./components/digest-view.js";
import { renderChatEntryModal, initChatEntryModal } from "./components/chat-entry-modal.js";
import {
  renderAISettingsModal,
  collectAISettings,
  showAISettingsError,
  hideAISettingsError,
  closeAISettingsModal,
  saveAIConfig,
  clearAIConfig,
  validateAIConfig,
} from "./components/ai-settings-modal.js";
import { isAIConfigured, getAIConfig } from "./ai/ai-config.js";
import { testConnection, embed } from "./ai/ai-client.js";
import { indexAllMissing, indexEntry } from "./ai/ai-index.js";
import { floatToBase64, entryEmbeddingText } from "./ai/embeddings.js";
import { findSimilarToEntry, findPossibleDuplicates } from "./ai/ai-search.js";
import {
  enrichEntry,
  generateTitle,
  generateSummary,
  generateTags,
  expandContent,
  translateText,
  parseUrl,
  suggestTagMerges,
} from "./ai/ai-actions.js";
import { embeddingCoverage, getAllTags, mergeTags, loadEmbeddings, clearEmbeddingCache, setEmbedding } from "./store/store.js";
import { formatRelative } from "./utils/date.js";
import { normalizeTags } from "./utils/tags.js";

// ── App State ──────────────────────────────────────────

let currentView = "timeline";
let activeFilters = {};

const PAGE_SIZE = 50;
let _timelineDisplayCount = PAGE_SIZE;
let _isEntrySavePending = false;

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
  ask: "Ask",
  digest: "Digest",
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
  _timelineDisplayCount = PAGE_SIZE;
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

  // Toggle top-bar actions visibility per view to avoid duplication
  const topBar = $(".top-bar");
  if (topBar) topBar.setAttribute("data-view", currentView);

  // Filter bar
  if (["search", "review", "ask", "digest"].includes(currentView)) {
    filterBarEl.innerHTML = "";
  } else {
    renderFilterBar(filterBarEl, {
      activeFilters,
      onFilterChange: (filters) => {
        activeFilters = filters;
        _timelineDisplayCount = PAGE_SIZE;
        render();
      },
    });
  }

  // Main content area
  if (currentView === "search") {
    renderSearchView();
  } else if (currentView === "review") {
    renderReviewView();
  } else if (currentView === "ask") {
    renderAskView(pageContent, { onEntryClick: openEntryDetail });
  } else if (currentView === "digest") {
    renderDigestView(pageContent);
  } else {
    renderTimelineView();
  }
}

function renderTimelineView() {
  const allEntries = getViewEntries();
  const displayEntries = allEntries.slice(0, _timelineDisplayCount);
  const hasMore = allEntries.length > _timelineDisplayCount;

  renderTimeline(pageContent, displayEntries, {
    hasMore,
    totalCount: allEntries.length,
    onLoadMore: () => {
      _timelineDisplayCount += PAGE_SIZE;
      renderTimelineView();
    },
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
    const data = { ...quickCaptureData };
    delete data.quickCapture;

    // Auto-generate title for URLs
    if (data.type === "link" && data.sourceUrl && !data.title) {
      data.title = data.sourceUrl;
    }

    handleQuickCapture(data).catch((err) => {
      console.error("[QuickCapture] failed:", err);
      setQuickCaptureBusy(false);
    });
    return;
  }

  // Full form modal
  const bodyEl = $("#entry-form-modal-body");
  bodyEl.innerHTML = renderEntryForm(null);
  $("#entry-form-modal .modal-title").textContent = "New Entry";
  updateFormFooter(false);
  openModal("entry-form-modal");
  initFormInteractions();
  setEntryFormSaveProgress("", { busy: false });
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
  setEntryFormSaveProgress("", { busy: false });
}

function updateFormFooter(isEdit) {
  const footer = $("#entry-form-modal .modal-footer");
  if (footer) footer.innerHTML = getEntryFormFooter(isEdit);
}

function setEntryFormSaveProgress(message = "", { busy = false, error = false } = {}) {
  const modalEl = $("#entry-form-modal");
  if (modalEl) modalEl.dataset.busy = busy ? "true" : "false";

  const saveBtn = $("#entry-form-save");
  if (saveBtn) {
    if (!saveBtn.dataset.idleLabel) saveBtn.dataset.idleLabel = saveBtn.innerHTML;
    saveBtn.disabled = busy;
    saveBtn.innerHTML = busy ? "Processing..." : (saveBtn.dataset.idleLabel || saveBtn.innerHTML);
  }

  // Cancel button lives in the modal footer; the X button lives in the header.
  // Select them separately so both get disabled while a save is in flight.
  const footerCancelBtn = document.querySelector('#entry-form-modal .modal-footer [data-close-modal="entry-form-modal"]');
  if (footerCancelBtn) footerCancelBtn.disabled = busy;

  const headerCloseBtn = document.querySelector('#entry-form-modal .modal-header .modal-close');
  if (headerCloseBtn) headerCloseBtn.disabled = busy;

  const statusEl = $("#entry-form-save-status");
  if (statusEl) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("entry-form-footer-status--error", !!error);
  }

  const formEl = $("#entry-form");
  if (formEl) formEl.setAttribute("aria-busy", busy ? "true" : "false");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function sameString(a, b) {
  return normalizeText(a) === normalizeText(b);
}

function sameTags(a, b) {
  const left = normalizeTags(a).sort();
  const right = normalizeTags(b).sort();
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function hasEnrichInputChanges(prev, next) {
  if (!prev) return true;
  return (
    prev.type !== next.type ||
    !sameString(prev.title, next.title) ||
    !sameString(prev.sourceUrl, next.sourceUrl) ||
    !sameString(prev.excerpt, next.excerpt) ||
    !sameString(prev.content, next.content) ||
    !sameString(prev.myNote, next.myNote)
  );
}

function hasEmbeddingInputChanges(prev, next) {
  if (!prev) return true;
  return (
    !sameString(prev.title, next.title) ||
    !sameString(prev.excerpt, next.excerpt) ||
    !sameString(prev.content, next.content) ||
    !sameString(prev.myNote, next.myNote) ||
    !sameString(prev.summary, next.summary) ||
    !sameTags(prev.tags, next.tags)
  );
}

function buildDraftFromFormData(data) {
  return {
    type: data.type,
    title: data.title,
    sourceUrl: data.sourceUrl,
    excerpt: data.excerpt,
    content: data.content,
    myNote: data.myNote,
    tags: normalizeTags(data.tags),
    status: data.status,
    images: data.images || [],
    relatedEntryIds: data.relatedEntryIds || [],
    summary: normalizeText(data.summary),
    aiActionItems: data.aiActionItems || [],
    aiLanguage: data.aiLanguage === "vi" ? "vi" : "en",
    createdDate: data.createdDate || "",
  };
}

/**
 * Resolve the ISO `createdAt` timestamp from the user-selected YYYY-MM-DD date.
 * - Invalid/empty date → undefined (caller should let the store pick now()).
 * - Edit mode + unchanged date → keep the original timestamp exactly.
 * - Edit mode + new date → swap date portion, keep the original time-of-day.
 * - New entry → combine selected date with the current time-of-day.
 */
function resolveCreatedAt(dateStr, original) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined;
  if (original?.createdAt) {
    if (original.createdAt.slice(0, 10) === dateStr) return original.createdAt;
    return dateStr + original.createdAt.slice(10);
  }
  return dateStr + new Date().toISOString().slice(10);
}

function computeAIPlan({ isEdit, original, draft }) {
  if (!isAIConfigured()) {
    return { shouldEnrich: false, shouldEmbed: false };
  }

  const cfg = getAIConfig();
  const needTags = !draft.tags || draft.tags.length === 0;
  const needSummary = !draft.summary;

  const shouldEnrich = cfg.autoEnrich &&
    (needTags || needSummary) &&
    (isEdit ? hasEnrichInputChanges(original, draft) : true);

  const changedForEmbedding = isEdit ? hasEmbeddingInputChanges(original, draft) : true;
  const hasEmbeddingText = !!entryEmbeddingText(draft);
  const shouldEmbed = hasEmbeddingText && (changedForEmbedding || shouldEnrich);

  return { shouldEnrich, shouldEmbed };
}

async function runAIStepsForDraft(draft, aiPlan, { onStatus } = {}) {
  const result = {
    enrichError: null,
    indexError: null,
    embeddingBase64: "",
  };

  if (aiPlan.shouldEnrich) {
    onStatus?.("Enriching content...");
    try {
      const needTags = !draft.tags || draft.tags.length === 0;
      const needSummary = !draft.summary;
      const enriched = await enrichEntry(draft, { language: draft.aiLanguage || "en" });
      if (needSummary && enriched.summary) {
        draft.summary = normalizeText(enriched.summary);
      }
      if (needTags && Array.isArray(enriched.tags) && enriched.tags.length > 0) {
        draft.tags = normalizeTags([...(draft.tags || []), ...enriched.tags]);
      }
    } catch (err) {
      result.enrichError = err;
      return result;
    }
  }

  if (aiPlan.shouldEmbed) {
    onStatus?.("Generating embedding...");
    try {
      const text = entryEmbeddingText(draft);
      if (text) {
        const [vec] = await embed(text);
        if (!vec) throw new Error("Empty embedding response.");
        result.embeddingBase64 = floatToBase64(vec);
      }
    } catch (err) {
      result.indexError = err;
      return result;
    }
  }

  return result;
}

/**
 * Persist a draft to the store (create or update) and attach the embedding
 * if one was computed. Assumes the draft already carries any AI enrichment.
 */
function persistCommitted({ draft, isEdit, originalId, embeddingBase64 }) {
  const savedEntry = isEdit ? updateEntry(originalId, draft) : createEntry(draft);
  if (!savedEntry) return null;
  if (embeddingBase64) {
    const cfg = getAIConfig();
    setEmbedding(savedEntry.id, embeddingBase64, cfg.embeddingModel);
  }
  return savedEntry;
}

/**
 * Run the AI pipeline (enrich + embedding) on a draft, then return the plan
 * and result so the caller decides how to render errors and persist.
 */
async function runEntryAIPipeline({ draft, isEdit, original, skipAI = false, onStatus }) {
  const aiPlan = skipAI
    ? { shouldEnrich: false, shouldEmbed: false }
    : computeAIPlan({ isEdit, original, draft });
  const aiResult = await runAIStepsForDraft(draft, aiPlan, { onStatus });
  return { aiPlan, aiResult };
}

/**
 * Toggle the "Save without AI" escape-hatch button inside the entry form
 * footer. Only visible after the AI pipeline fails for the current draft.
 */
function setSaveWithoutAIVisible(visible) {
  const footerActions = document.querySelector("#entry-form-modal .entry-form-footer-actions");
  if (!footerActions) return;
  let btn = footerActions.querySelector("#entry-form-save-without-ai");
  if (visible) {
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "entry-form-save-without-ai";
      btn.className = "btn btn-outline";
      btn.textContent = "Save without AI";
      const saveBtn = footerActions.querySelector("#entry-form-save");
      footerActions.insertBefore(btn, saveBtn);
    }
  } else if (btn) {
    btn.remove();
  }
}

async function handleSaveEntry({ skipAI = false } = {}) {
  if (_isEntrySavePending) return;

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

  const isEdit = !!data.id;
  const original = isEdit ? getEntry(data.id) : null;
  if (isEdit && !original) {
    setEntryFormSaveProgress("Entry no longer exists.", { busy: false, error: true });
    return;
  }

  const draft = buildDraftFromFormData(data);
  const resolvedCreatedAt = resolveCreatedAt(draft.createdDate, original);
  delete draft.createdDate;
  if (resolvedCreatedAt) draft.createdAt = resolvedCreatedAt;
  _isEntrySavePending = true;
  setEntryFormSaveProgress("Saving entry...", { busy: true });
  setSaveWithoutAIVisible(false);

  try {
    const { aiPlan, aiResult } = await runEntryAIPipeline({
      draft, isEdit, original, skipAI,
      onStatus: (message) => setEntryFormSaveProgress(message, { busy: true }),
    });

    if (aiResult.enrichError) {
      setEntryFormSaveProgress(
        `Enrich failed: ${truncateError(aiResult.enrichError)}. Retry Save, or click "Save without AI".`,
        { busy: false, error: true }
      );
      setSaveWithoutAIVisible(true);
      return;
    }

    if (aiResult.indexError) {
      setEntryFormSaveProgress(
        `Embedding failed: ${truncateError(aiResult.indexError)}. Retry Save, or click "Save without AI".`,
        { busy: false, error: true }
      );
      setSaveWithoutAIVisible(true);
      return;
    }

    const savedEntry = persistCommitted({
      draft,
      isEdit,
      originalId: data.id,
      embeddingBase64: aiPlan.shouldEmbed ? aiResult.embeddingBase64 : "",
    });
    if (!savedEntry) {
      setEntryFormSaveProgress("Failed to save entry.", { busy: false, error: true });
      return;
    }

    setEntryFormSaveProgress("", { busy: false });
    closeModal("entry-form-modal");
    render();
  } finally {
    _isEntrySavePending = false;
  }
}

function truncateError(err) {
  const msg = String(err?.message || err || "unknown error");
  return msg.length > 80 ? msg.slice(0, 77) + "..." : msg;
}

/**
 * Quick-capture flow: run the AI pipeline on the draft first, then persist.
 * If AI fails, fall back to creating the entry without AI so the user does
 * not get stuck — quick capture prioritizes speed over perfect enrichment.
 */
async function handleQuickCapture(data) {
  const draft = buildDraftFromFormData({
    type: data.type || "note",
    title: data.title || "",
    sourceUrl: data.sourceUrl || "",
    excerpt: "",
    content: data.content || "",
    myNote: "",
    tags: [],
    status: "inbox",
    images: [],
    relatedEntryIds: [],
    summary: "",
    aiActionItems: [],
  });
  delete draft.createdDate;

  setQuickCaptureBusy(true, "Processing...");

  const { aiPlan, aiResult } = await runEntryAIPipeline({
    draft, isEdit: false, original: null,
    onStatus: (message) => setQuickCaptureBusy(true, message),
  });

  if (aiResult.enrichError) console.error("[AI] quick capture enrich failed:", aiResult.enrichError);
  if (aiResult.indexError) console.error("[AI] quick capture embedding failed:", aiResult.indexError);

  const embeddingBase64 = aiPlan.shouldEmbed && !aiResult.indexError ? aiResult.embeddingBase64 : "";
  persistCommitted({ draft, isEdit: false, embeddingBase64 });
  setQuickCaptureBusy(false);
  render();
}

function setQuickCaptureBusy(busy, message = "") {
  const input = document.getElementById("quick-capture-input");
  const btn = document.getElementById("quick-capture-expand");
  if (input) {
    input.disabled = busy;
    if (busy) {
      input.dataset.idlePlaceholder = input.dataset.idlePlaceholder || input.placeholder;
      input.placeholder = message || "Processing...";
    } else {
      input.placeholder = input.dataset.idlePlaceholder || "Paste a link or type a note...";
    }
  }
  if (btn) btn.disabled = busy;
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

async function handleDelete(entryId) {
  const entry = getEntry(entryId);
  const title = entry?.title ? `"${entry.title}"` : "this entry";
  const ok = await openConfirm({
    title: "Delete entry?",
    message: `Delete ${title}? This action cannot be undone.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    destructive: true,
  });
  if (!ok) return;
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
  on(document, "click", "#entry-form-save", async () => {
    await handleSaveEntry();
  });

  // Escape hatch after AI failure: create/update the entry skipping AI steps.
  on(document, "click", "#entry-form-save-without-ai", async () => {
    await handleSaveEntry({ skipAI: true });
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

  // AI Settings modal
  on(document, "click", "[data-action='open-ai-settings']", () => {
    openAISettings();
  });

  // Entry detail: Chat
  on(document, "click", "[data-action='detail-chat']", (e, el) => {
    openChatWithEntry(el.dataset.entryId);
  });

  // Entry detail: AI Related
  on(document, "click", "[data-action='detail-ai-related']", (e, el) => {
    runFindAIRelated(el.dataset.entryId, el);
  });

  // Entry form: AI action buttons
  on(document, "click", "[data-ai-action]", (e, el) => {
    e.preventDefault();
    closeAIToolbarMenus();
    runFormAIAction(el.dataset.aiAction, el);
  });

  // Entry form: AI output language toggle
  on(document, "click", "[data-ai-lang]", (e, el) => {
    e.preventDefault();
    const lang = el.dataset.aiLang === "vi" ? "vi" : "en";
    const input = document.querySelector('#entry-form [name="aiLanguage"]');
    if (input) input.value = lang;
    syncLanguageButtons(lang);
  });

  // Entry form: AI toolbar dropdown (Translate)
  on(document, "click", "[data-ai-menu-toggle]", (e, el) => {
    e.preventDefault();
    e.stopPropagation();
    const key = el.dataset.aiMenuToggle;
    const menu = document.getElementById(`ai-${key}-menu`);
    if (!menu) return;
    const isOpen = !menu.hidden;
    closeAIToolbarMenus();
    if (!isOpen) {
      menu.hidden = false;
      el.setAttribute("aria-expanded", "true");
    }
  });

  // Close AI toolbar dropdowns on outside click / Escape
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ai-toolbar-menu-wrapper")) closeAIToolbarMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAIToolbarMenus();
  });

  // Duplicate warning: ignore / view duplicate
  on(document, "click", "[data-dup-dismiss]", () => {
    const el = $("#duplicate-warning-group");
    if (el) el.hidden = true;
  });
  on(document, "click", "[data-dup-open]", (e, el) => {
    closeModal("entry-form-modal");
    openEntryDetail(el.dataset.entryId);
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
      size: "xl",
      footerHtml: getEntryFormFooter(false),
    })}
    ${createModalShell("confirm-modal", "Confirm", {
      size: "sm",
      footerHtml: `
        <button type="button" class="btn btn-outline" data-confirm-cancel>Cancel</button>
        <button type="button" class="btn btn-destructive" data-confirm-ok>Confirm</button>
      `,
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
  // Load embeddings into memory so semantic search is instant.
  // Safe to call even when AI is not configured — embeddings may still
  // exist from a previous session.
  await loadEmbeddings();

  createModals();
  initModalListeners();
  initConfirmModal();
  initGlobalDelegation();
  initShortcuts();
  initTopBar();
  initSidebar();

  render();
}

// ── AI Settings Modal ─────────────────────────────────

function openAISettings() {
  closeSidebar();
  const coverage = embeddingCoverage();
  modalsContainer.insertAdjacentHTML("beforeend", renderAISettingsModal(coverage));

  const backdrop = $("#ai-settings-modal-backdrop");
  const close = () => closeAISettingsModal();

  backdrop?.addEventListener("click", close);
  document.querySelectorAll("[data-close-ai-settings]").forEach((btn) =>
    btn.addEventListener("click", close)
  );

  // Save
  $("#ai-save-btn")?.addEventListener("click", () => {
    hideAISettingsError();
    const cfg = collectAISettings();
    const v = validateAIConfig(cfg);
    if (!v.valid) {
      showAISettingsError(`Missing: ${v.missing.join(", ")}`);
      return;
    }
    saveAIConfig(cfg);
    close();
    render();
  });

  // Test connection
  $("#ai-test-btn")?.addEventListener("click", async () => {
    const cfg = collectAISettings();
    const v = validateAIConfig(cfg);
    if (!v.valid) {
      showAISettingsError(`Missing: ${v.missing.join(", ")}`);
      return;
    }
    saveAIConfig(cfg);
    const resultEl = $("#ai-test-result");
    if (resultEl) resultEl.textContent = "Testing...";
    const result = await testConnection();
    if (!resultEl) return;
    if (result.ok) {
      resultEl.innerHTML = `<span class="ai-test-ok">✓ Chat + Embeddings OK</span>`;
    } else {
      resultEl.innerHTML = `<span class="ai-test-fail">✗ ${result.error || "Failed"}</span>`;
    }
  });

  // Index missing entries
  $("#ai-index-btn")?.addEventListener("click", () => runIndexing(false));
  $("#ai-reindex-all-btn")?.addEventListener("click", () => runIndexing(true));

  // Clear embeddings
  $("#ai-clear-index-btn")?.addEventListener("click", async () => {
    const ok = await openConfirm({
      title: "Delete all embeddings?",
      message: "All stored vectors will be removed. You can re-index any time.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const adapter = _currentAdapter;
    if (adapter?.clearEmbeddings) await adapter.clearEmbeddings();
    clearEmbeddingCache();
    // Re-render the modal to refresh stats
    close();
    openAISettings();
  });

  // Suggest tag merges
  let _tagMergeGroups = [];
  const renderTagMergeGroups = () => {
    const resultEl = $("#ai-tag-merge-result");
    if (!resultEl) return;
    if (_tagMergeGroups.length === 0) {
      resultEl.innerHTML = `<span class="ai-test-result">No duplicate tag groups to merge.</span>`;
      return;
    }
    resultEl.innerHTML = `
      <div class="ai-tag-merge-toolbar">
        <span class="ai-tag-merge-count">${_tagMergeGroups.length} group${_tagMergeGroups.length === 1 ? "" : "s"} suggested</span>
        <button type="button" class="btn btn-outline" data-tag-merge-all>
          ${icon("checkCircle", 14)} Apply all
        </button>
      </div>
      <div class="ai-tag-groups">
        ${_tagMergeGroups.map((g, i) => `
          <div class="ai-tag-group" data-merge-index="${i}">
            <div class="ai-tag-group-body">
              <span class="tag">#${escapeForHtml(g.canonical)}</span>
              <span class="ai-tag-group-arrow">←</span>
              ${(g.aliases || []).map((a) => `<span class="tag tag--muted">#${escapeForHtml(a)}</span>`).join(" ")}
            </div>
            <div class="ai-tag-group-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-tag-merge-skip="${i}" title="Skip this group">
                ${icon("close", 14)}
              </button>
              <button type="button" class="btn btn-primary btn-sm" data-tag-merge-apply="${i}">
                Apply
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  };

  $("#ai-merge-tags-btn")?.addEventListener("click", async () => {
    const resultEl = $("#ai-tag-merge-result");
    if (!resultEl) return;
    resultEl.innerHTML = `<span class="ai-test-result">Analyzing tags...</span>`;
    try {
      const groups = await suggestTagMerges(getAllTags());
      _tagMergeGroups = (groups || []).filter((g) => g && g.canonical && Array.isArray(g.aliases) && g.aliases.length > 0);
      if (_tagMergeGroups.length === 0) {
        resultEl.innerHTML = `<span class="ai-test-result">No duplicate tag groups found.</span>`;
        return;
      }
      renderTagMergeGroups();
    } catch (err) {
      resultEl.innerHTML = `<span class="ai-test-fail">${escapeForHtml(err.message)}</span>`;
    }
  });

  const applyMergeAtIndex = async (idx) => {
    const group = _tagMergeGroups[idx];
    if (!group) return;
    const aliasList = group.aliases.join(", ");
    const ok = await openConfirm({
      title: `Merge into #${group.canonical}?`,
      message: `All entries tagged with ${aliasList} will be retagged as #${group.canonical}. This cannot be undone automatically.`,
      confirmLabel: "Apply merge",
    });
    if (!ok) return;
    const changed = mergeTags(group.canonical, group.aliases);
    _tagMergeGroups.splice(idx, 1);
    renderTagMergeGroups();
    const resultEl = $("#ai-tag-merge-result");
    if (resultEl) {
      const notice = document.createElement("div");
      notice.className = "ai-tag-merge-notice";
      notice.textContent = `Merged into #${group.canonical} · ${changed} ${changed === 1 ? "entry" : "entries"} updated.`;
      resultEl.prepend(notice);
      setTimeout(() => notice.remove(), 4000);
    }
  };

  on($("#ai-tag-merge-result"), "click", "[data-tag-merge-apply]", (_e, el) => {
    applyMergeAtIndex(Number(el.getAttribute("data-tag-merge-apply")));
  });
  on($("#ai-tag-merge-result"), "click", "[data-tag-merge-skip]", (_e, el) => {
    const idx = Number(el.getAttribute("data-tag-merge-skip"));
    _tagMergeGroups.splice(idx, 1);
    renderTagMergeGroups();
  });
  on($("#ai-tag-merge-result"), "click", "[data-tag-merge-all]", async () => {
    if (_tagMergeGroups.length === 0) return;
    const ok = await openConfirm({
      title: `Apply all ${_tagMergeGroups.length} merges?`,
      message: `Every listed alias will be replaced with its canonical tag across all entries. This cannot be undone automatically.`,
      confirmLabel: "Apply all",
    });
    if (!ok) return;
    let totalChanged = 0;
    for (const group of _tagMergeGroups) {
      totalChanged += mergeTags(group.canonical, group.aliases);
    }
    const applied = _tagMergeGroups.length;
    _tagMergeGroups = [];
    renderTagMergeGroups();
    const resultEl = $("#ai-tag-merge-result");
    if (resultEl) {
      const notice = document.createElement("div");
      notice.className = "ai-tag-merge-notice";
      notice.textContent = `Applied ${applied} merges · ${totalChanged} ${totalChanged === 1 ? "entry" : "entries"} updated.`;
      resultEl.prepend(notice);
    }
  });

  // Forget credentials
  $("#ai-forget-btn")?.addEventListener("click", async () => {
    const ok = await openConfirm({
      title: "Forget AI credentials?",
      message: "Remove the stored API key and endpoint from this browser. You can re-enter them later.",
      confirmLabel: "Forget",
      destructive: true,
    });
    if (!ok) return;
    clearAIConfig();
    close();
    render();
  });
}

async function runIndexing(reindexAll) {
  if (!isAIConfigured()) {
    showAISettingsError("Configure AI first.");
    return;
  }
  const barEl = $("#ai-progress-fill");
  const textEl = $("#ai-progress-text");
  const statsEl = $("#ai-index-stats");

  if (reindexAll && _currentAdapter?.clearEmbeddings) {
    await _currentAdapter.clearEmbeddings();
    // Keep the in-memory cache in sync so indexAllMissing re-embeds everything.
    clearEmbeddingCache();
  }

  try {
    await indexAllMissing((progress) => {
      const processed = progress.done + progress.errors;
      const pct = progress.total === 0 ? 100 : (processed / progress.total) * 100;
      if (barEl) barEl.style.width = `${Math.min(100, pct)}%`;
      if (statsEl) statsEl.textContent = `${progress.done} / ${progress.total}`;
      if (textEl) {
        textEl.textContent = processed < progress.total
          ? `· indexing${progress.errors ? ` (${progress.errors} errors)` : "..."}`
          : progress.errors ? `· done, ${progress.errors} errors` : "";
      }
    });
    const cov = embeddingCoverage();
    if (statsEl) statsEl.textContent = `${cov.indexed} / ${cov.total}`;
    if (barEl) {
      const pct = cov.total > 0 ? (cov.indexed / cov.total) * 100 : 0;
      barEl.style.width = `${pct}%`;
    }
  } catch (err) {
    if (textEl) textEl.textContent = `· failed: ${err.message}`;
  }
}

// ── Chat-with-entry Modal ─────────────────────────────

function openChatWithEntry(entryId) {
  if (!isAIConfigured()) {
    alert("Configure AI first (AI Settings in the sidebar).");
    return;
  }
  modalsContainer.insertAdjacentHTML("beforeend", renderChatEntryModal(entryId));
  initChatEntryModal(entryId);
}

// ── AI Related (similarity) in entry detail ──────────

async function runFindAIRelated(entryId, buttonEl) {
  const listEl = $("#ai-related-list");
  if (!listEl) return;
  if (!isAIConfigured()) {
    listEl.innerHTML = `<div class="ask-empty">AI not configured.</div>`;
    return;
  }
  const origLabel = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.innerHTML = `Loading...`;
  listEl.innerHTML = `<div class="ask-loading">Finding similar entries...</div>`;

  try {
    // If the current entry has no embedding yet, index it now
    const entry = getEntry(entryId);
    if (entry) await indexEntry(entry);
    const hits = await findSimilarToEntry(entryId, 5, 0.35);
    if (hits.length === 0) {
      listEl.innerHTML = `<div class="ask-empty">No similar entries found.</div>`;
    } else {
      listEl.innerHTML = hits.map(({ entry: e, score }) => `
        <div class="related-entry-item" data-related-entry-id="${e.id}">
          <span class="related-entry-dot" style="background: hsl(var(--color-${e.type}))"></span>
          <span class="related-entry-title">${escapeForHtml(e.title)}</span>
          <span class="related-entry-date">${formatRelative(e.createdAt)} · ${Math.round(score * 100)}%</span>
        </div>
      `).join("");
    }
  } catch (err) {
    listEl.innerHTML = `<div class="ask-error">${escapeForHtml(err.message)}</div>`;
  } finally {
    buttonEl.disabled = false;
    buttonEl.innerHTML = origLabel;
  }
}

// ── Entry-form AI actions ────────────────────────────

async function runFormAIAction(action, buttonEl) {
  if (!isAIConfigured()) {
    setFormAIStatus("Configure AI first (AI Settings).", true);
    return;
  }

  const spinTarget = getAIActionSpinTarget(buttonEl);
  const origSpinHtml = spinTarget ? spinTarget.innerHTML : null;
  const allControls = document.querySelectorAll(
    ".ai-toolbar [data-ai-action], .ai-toolbar [data-ai-menu-toggle]"
  );
  allControls.forEach((el) => (el.disabled = true));
  if (spinTarget) applyAIChipLoading(spinTarget);

  try {
    const data = collectFormData();
    const entry = data ? buildFormEntry(data) : null;
    const language = getFormAILanguage();

    switch (action) {
      case "parse-url": {
        if (!entry?.sourceUrl) { setFormAIStatus("Enter a URL first."); break; }
        setFormAIStatus("Fetching & parsing URL...");
        const parsed = await parseUrl(entry.sourceUrl, { language });
        if (parsed.title && !entry.title) setFieldValue("entry-title", parsed.title);
        if (parsed.excerpt) setFieldValue("entry-excerpt", parsed.excerpt);
        if (parsed.tags?.length) {
          parsed.tags.forEach((t) => addTagToForm(String(t).toLowerCase()));
        }
        setFormAIStatus("Parsed ✓");
        break;
      }
      case "auto-title": {
        setFormAIStatus("Generating title...");
        const title = await generateTitle(entry, { language });
        if (title) setFieldValue("entry-title", title);
        setFormAIStatus("Done ✓");
        break;
      }
      case "auto-summary": {
        setFormAIStatus("Summarizing...");
        const summary = await generateSummary(entry, { language });
        setFieldValue("entry-summary", summary);
        const group = $("#form-summary-group");
        if (group) group.hidden = false;
        setFormAIStatus("Done ✓");
        break;
      }
      case "auto-tags": {
        setFormAIStatus("Suggesting tags...");
        const tags = await generateTags(entry, { language });
        tags.forEach((t) => addTagToForm(String(t).toLowerCase()));
        setFormAIStatus(`Added ${tags.length} tag${tags.length === 1 ? "" : "s"} ✓`);
        break;
      }
      case "expand": {
        const contentEl = $("#entry-content");
        const excerptEl = $("#entry-excerpt");
        const target = (contentEl && !contentEl.closest("[hidden]")) ? contentEl : excerptEl;
        if (!target || !target.value.trim()) { setFormAIStatus("Nothing to expand."); break; }
        setFormAIStatus("Expanding...");
        const expanded = await expandContent(target.value, { language });
        target.value = expanded;
        setFormAIStatus("Done ✓");
        break;
      }
      case "translate-en":
      case "translate-vi": {
        const lang = action === "translate-en" ? "English" : "Vietnamese";
        const contentEl = $("#entry-content");
        const excerptEl = $("#entry-excerpt");
        const summaryEl = $("#entry-summary");
        const target = (contentEl && !contentEl.closest("[hidden]")) ? contentEl : excerptEl;
        const summaryVisible = summaryEl && !summaryEl.closest("[hidden]");
        const summaryText = summaryVisible ? summaryEl.value.trim() : "";
        const primaryText = target?.value.trim() || "";

        if (!primaryText && !summaryText) {
          setFormAIStatus("Nothing to translate.");
          break;
        }

        setFormAIStatus(`Translating to ${lang}...`);
        const tasks = [];
        if (primaryText) tasks.push(translateText(primaryText, lang).then((t) => { target.value = t; }));
        if (summaryText) tasks.push(translateText(summaryText, lang).then((t) => { summaryEl.value = t; }));
        await Promise.all(tasks);

        const formLangInput = document.querySelector('#entry-form [name="aiLanguage"]');
        const nextLang = action === "translate-vi" ? "vi" : "en";
        if (formLangInput) formLangInput.value = nextLang;
        syncLanguageButtons(nextLang);

        setFormAIStatus(tasks.length > 1 ? "Translated content + summary ✓" : "Done ✓");
        break;
      }
      default:
        setFormAIStatus(`Unknown action: ${action}`, true);
    }
  } catch (err) {
    setFormAIStatus(err.message, true);
  } finally {
    allControls.forEach((el) => (el.disabled = false));
    if (spinTarget && origSpinHtml !== null) {
      spinTarget.classList.remove("ai-chip--loading");
      spinTarget.innerHTML = origSpinHtml;
    }
    runDuplicateCheck().catch(() => {});
  }
}

/**
 * Resolve the chip that should show the loading spinner for a given AI action click.
 * For toolbar chips this is the button itself; for dropdown menu items (e.g. Translate →
 * English), the menu is hidden on click so we spin the parent menu toggle instead.
 */
function getAIActionSpinTarget(buttonEl) {
  if (buttonEl.classList.contains("ai-chip")) return buttonEl;
  const wrapper = buttonEl.closest(".ai-toolbar-menu-wrapper");
  return wrapper ? wrapper.querySelector("[data-ai-menu-toggle]") : null;
}

function applyAIChipLoading(chipEl) {
  const svg = chipEl.querySelector("svg:not(.ai-chip-caret)");
  const size = svg ? parseInt(svg.getAttribute("width"), 10) || 14 : 14;
  if (svg) svg.outerHTML = icon("loader", size);
  chipEl.classList.add("ai-chip--loading");
}

function buildFormEntry(data) {
  return {
    id: data.id,
    type: data.type,
    title: data.title,
    sourceUrl: data.sourceUrl,
    excerpt: data.excerpt,
    content: data.content,
    myNote: data.myNote,
    tags: data.tags || [],
    summary: data.summary,
    aiLanguage: data.aiLanguage === "vi" ? "vi" : "en",
  };
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function closeAIToolbarMenus() {
  document.querySelectorAll(".ai-toolbar-menu").forEach((m) => (m.hidden = true));
  document.querySelectorAll("[data-ai-menu-toggle]").forEach((b) =>
    b.setAttribute("aria-expanded", "false")
  );
}

function setFormAIStatus(msg, isError = false) {
  const el = $("#form-ai-status");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("ai-toolbar-status--error", isError);
  el.title = msg || "";
}

/**
 * Read the AI output language currently selected in the entry form.
 * Falls back to "en" when the form or hidden field is missing.
 */
function getFormAILanguage() {
  const input = document.querySelector('#entry-form [name="aiLanguage"]');
  const raw = input?.value || "en";
  return raw === "vi" ? "vi" : "en";
}

/** Reflect the chosen language on the toolbar toggle buttons. */
function syncLanguageButtons(lang) {
  const buttons = document.querySelectorAll("#entry-form .ai-lang-btn[data-ai-lang]");
  buttons.forEach((btn) => {
    const active = btn.dataset.aiLang === lang;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

/** Check for possible duplicates based on current form title+content. */
async function runDuplicateCheck() {
  if (!isAIConfigured()) return;
  const data = collectFormData();
  if (!data) return;
  const text = [data.title, data.excerpt, data.content, data.myNote].filter(Boolean).join("\n");
  if (text.trim().length < 20) return;

  const group = $("#duplicate-warning-group");
  const warn = $("#duplicate-warning");
  if (!group || !warn) return;

  try {
    const dups = await findPossibleDuplicates(text, { excludeId: data.id || null, threshold: 0.82, k: 3 });
    if (dups.length === 0) {
      group.hidden = true;
      return;
    }
    warn.innerHTML = `
      <div class="duplicate-warning-title">Possible duplicate entries detected</div>
      <ul class="duplicate-warning-list">
        ${dups.map((d) => `
          <li>
            <button class="duplicate-warning-link" data-dup-open data-entry-id="${d.entry.id}">
              ${escapeForHtml(d.entry.title)}
            </button>
            <span class="duplicate-warning-score">${Math.round(d.score * 100)}% similar</span>
          </li>
        `).join("")}
      </ul>
      <button class="btn btn-ghost btn-sm" data-dup-dismiss>Dismiss</button>
    `;
    group.hidden = false;
  } catch (err) {
    console.error("[AI] duplicate check:", err);
  }
}

// Track the current adapter so AI settings can access it for clearEmbeddings etc.
let _currentAdapter = null;

/**
 * Disconnect from Firebase and show the credentials modal again.
 * Credentials are kept in localStorage so the modal is pre-filled.
 */
async function handleFirebaseDisconnect() {
  // Preserve credentials so the modal is pre-filled after reload
  const lastCred = getSavedCredentials();
  if (lastCred) {
    sessionStorage.setItem("pkt_last_firebase_cred", JSON.stringify(lastCred));
  }
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
    // Check persisted creds first, fall back to session creds from disconnect
    let savedCred = getSavedCredentials();
    let fromDisconnect = false;
    if (!savedCred) {
      try {
        const raw = sessionStorage.getItem("pkt_last_firebase_cred");
        if (raw) {
          savedCred = JSON.parse(raw);
          fromDisconnect = true;
        }
      } catch { /* ignore */ }
      sessionStorage.removeItem("pkt_last_firebase_cred");
    }
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

    // If credentials are already saved (not from disconnect), auto-try
    if (savedCred && !fromDisconnect && validateCredentials(savedCred).valid) {
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
    // Dev mode: use IndexedDB adapter
    _currentAdapter = localAdapter;
    setAdapter(localAdapter);
    await bootApp();
  } else {
    // Prod mode: need Firebase credentials first
    await showFirebaseSetup();
    _currentAdapter = firebaseAdapter;
    setAdapter(firebaseAdapter);
    await bootApp();
  }

  // Show env badge in console
  console.log(`[PKT] Running in ${config.env.toUpperCase()} mode`);
}

document.addEventListener("DOMContentLoaded", init);
