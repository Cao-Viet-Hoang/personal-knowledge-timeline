/**
 * Sidebar navigation component.
 * Renders the sidebar and handles view switching.
 */

import { on } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { getStats } from "../store/store.js";
import config from "../config.js";

export function renderSidebar(container, { onNavigate, activeView }) {
  const stats = getStats();

  container.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <div class="sidebar-logo-icon">${icon("sparkles", 18)}</div>
        <span class="sidebar-logo-text">Knowledge Timeline</span>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="sidebar-section">
        <div class="sidebar-section-label">Views</div>
        <button class="sidebar-item ${activeView === "timeline" ? "active" : ""}" data-view="timeline">
          <span class="sidebar-item-icon">${icon("timeline")}</span>
          Timeline
          <span class="sidebar-item-badge">${stats.total}</span>
        </button>
        <button class="sidebar-item ${activeView === "inbox" ? "active" : ""}" data-view="inbox">
          <span class="sidebar-item-icon">${icon("inbox")}</span>
          Inbox
          <span class="sidebar-item-badge">${stats.inbox}</span>
        </button>
        <button class="sidebar-item ${activeView === "starred" ? "active" : ""}" data-view="starred">
          <span class="sidebar-item-icon">${icon("star")}</span>
          Starred
          <span class="sidebar-item-badge">${stats.starred}</span>
        </button>
        <button class="sidebar-item ${activeView === "archive" ? "active" : ""}" data-view="archive">
          <span class="sidebar-item-icon">${icon("archive")}</span>
          Archived
          <span class="sidebar-item-badge">${stats.archived}</span>
        </button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-label">Types</div>
        <button class="sidebar-item ${activeView === "type-link" ? "active" : ""}" data-view="type-link">
          <span class="sidebar-item-icon">${icon("link")}</span>
          Links
        </button>
        <button class="sidebar-item ${activeView === "type-note" ? "active" : ""}" data-view="type-note">
          <span class="sidebar-item-icon">${icon("fileText")}</span>
          Notes
        </button>
        <button class="sidebar-item ${activeView === "type-thought" ? "active" : ""}" data-view="type-thought">
          <span class="sidebar-item-icon">${icon("lightbulb")}</span>
          Thoughts
        </button>
        <button class="sidebar-item ${activeView === "type-quote" ? "active" : ""}" data-view="type-quote">
          <span class="sidebar-item-icon">${icon("quote")}</span>
          Quotes
        </button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-label">Tools</div>
        <button class="sidebar-item ${activeView === "search" ? "active" : ""}" data-view="search">
          <span class="sidebar-item-icon">${icon("search", 18)}</span>
          Search
        </button>
        <button class="sidebar-item ${activeView === "review" ? "active" : ""}" data-view="review">
          <span class="sidebar-item-icon">${icon("refresh")}</span>
          Review
        </button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-label">AI</div>
        <button class="sidebar-item ${activeView === "ask" ? "active" : ""}" data-view="ask">
          <span class="sidebar-item-icon">${icon("sparkles", 18)}</span>
          Ask
        </button>
        <button class="sidebar-item ${activeView === "digest" ? "active" : ""}" data-view="digest">
          <span class="sidebar-item-icon">${icon("fileText", 18)}</span>
          Digest
        </button>
        <button class="sidebar-item" data-action="open-ai-settings">
          <span class="sidebar-item-icon">${icon("settings", 18)}</span>
          AI Settings
        </button>
      </div>
    </nav>

    ${config.isProd ? `
    <div class="sidebar-footer">
      <div class="sidebar-connection">
        ${icon("database", 14)}
        <span class="sidebar-connection-text">Firestore connected</span>
      </div>
      <button class="sidebar-item sidebar-item--danger" data-action="firebase-disconnect">
        <span class="sidebar-item-icon">${icon("logOut")}</span>
        Disconnect
      </button>
    </div>
    ` : ""}
  `;

  on(container, "click", ".sidebar-item[data-view]", (e, el) => {
    onNavigate(el.dataset.view);
  });
  // [data-action] handlers (open-ai-settings, firebase-disconnect) are
  // wired via global event delegation in app.js — no action needed here.
}
