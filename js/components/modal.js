/**
 * Generic modal component.
 * Handles open/close animations and backdrop click.
 */

import { $, on } from "../utils/dom.js";
import { icon } from "../utils/icons.js";

const _modalStack = [];

export function openModal(id) {
  const backdrop = $(`#${id}-backdrop`);
  const modal = $(`#${id}`);
  if (!backdrop || !modal) return;

  backdrop.classList.add("open");
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  const idx = _modalStack.indexOf(id);
  if (idx !== -1) _modalStack.splice(idx, 1);
  _modalStack.push(id);
}

export function closeModal(id) {
  const backdrop = $(`#${id}-backdrop`);
  const modal = $(`#${id}`);
  if (!backdrop || !modal) return;

  backdrop.classList.remove("open");
  modal.classList.remove("open");
  const idx = _modalStack.indexOf(id);
  if (idx !== -1) _modalStack.splice(idx, 1);
  if (_modalStack.length === 0) {
    document.body.style.overflow = "";
  }
}

export function closeActiveModal() {
  const top = _modalStack[_modalStack.length - 1];
  if (top) closeModal(top);
}

export function createModalShell(id, title, { size = "", footerHtml = "" } = {}) {
  const sizeClass = size === "lg" ? "modal--lg" : size === "sm" ? "modal--sm" : "";

  return `
    <div id="${id}-backdrop" class="modal-backdrop"></div>
    <div id="${id}" class="modal ${sizeClass}" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" data-close-modal="${id}" aria-label="Close">
          ${icon("close")}
        </button>
      </div>
      <div class="modal-body" id="${id}-body"></div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ""}
    </div>
  `;
}

/** Bind global escape key and backdrop click to close modals. */
export function initModalListeners() {
  on(document, "keydown", (e) => {
    if (e.key === "Escape") closeActiveModal();
  });

  on(document, "click", ".modal-backdrop.open", (e, el) => {
    const id = el.id.replace("-backdrop", "");
    closeModal(id);
  });

  on(document, "click", "[data-close-modal]", (e, el) => {
    closeModal(el.dataset.closeModal);
  });
}
