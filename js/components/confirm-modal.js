/**
 * Generic confirmation modal.
 * Replaces the native window.confirm() dialog with a shadcn-styled modal.
 *
 * Usage:
 *   const ok = await openConfirm({
 *     title: "Delete entry?",
 *     message: "This action cannot be undone.",
 *     confirmLabel: "Delete",
 *     destructive: true,
 *   });
 *   if (!ok) return;
 */

import { $, on } from "../utils/dom.js";
import { openModal, closeModal } from "./modal.js";

let _resolver = null;

/**
 * Open a confirmation dialog. Returns a Promise resolving to `true` when the
 * user confirms, `false` on cancel / Escape / backdrop click.
 */
export function openConfirm({
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
} = {}) {
  // If a previous confirm is still unresolved (should not happen), cancel it.
  if (_resolver) {
    _resolver(false);
    _resolver = null;
  }

  return new Promise((resolve) => {
    const titleEl = $("#confirm-modal .modal-title");
    const bodyEl = $("#confirm-modal-body");
    const footerEl = $("#confirm-modal .modal-footer");
    if (!titleEl || !bodyEl || !footerEl) {
      resolve(false);
      return;
    }

    titleEl.textContent = title;
    bodyEl.innerHTML = `<p class="confirm-modal-message">${esc(message)}</p>`;
    footerEl.innerHTML = `
      <button type="button" class="btn btn-outline" data-confirm-cancel>${esc(cancelLabel)}</button>
      <button type="button" class="btn ${destructive ? "btn-destructive" : "btn-primary"}" data-confirm-ok>${esc(confirmLabel)}</button>
    `;

    _resolver = resolve;
    openModal("confirm-modal");
    requestAnimationFrame(() => {
      $("#confirm-modal [data-confirm-ok]")?.focus();
    });
  });
}

/** Wire the global listeners for confirm-modal. Call once at boot. */
export function initConfirmModal() {
  on(document, "click", "[data-confirm-ok]", () => resolveAndClose(true));
  on(document, "click", "[data-confirm-cancel]", () => resolveAndClose(false));

  // Treat backdrop click / Escape as cancel.
  // modal.js's own listeners close the modal; we just resolve the promise.
  // Guard only on `_resolver` because modal.js runs first and strips the .open class.
  on(document, "click", "#confirm-modal-backdrop", () => {
    if (_resolver) resolveAndClose(false);
  });
  on(document, "keydown", (e) => {
    if (e.key === "Escape" && _resolver) resolveAndClose(false);
  });
}

function resolveAndClose(result) {
  if (_resolver) {
    _resolver(result);
    _resolver = null;
  }
  closeModal("confirm-modal");
}

function esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
