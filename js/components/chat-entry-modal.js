/**
 * "Chat with entry" modal.
 * Opens a lightweight conversation scoped to a single entry.
 * History lives only in the DOM — closing the modal discards it.
 */

import { icon } from "../utils/icons.js";
import { chatWithEntry } from "../ai/ai-actions.js";
import { getEntry } from "../store/store.js";

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderChatEntryModal(entryId) {
  const entry = getEntry(entryId);
  if (!entry) return "";

  return `
    <div id="chat-entry-modal-backdrop" class="modal-backdrop open"></div>
    <div id="chat-entry-modal" class="modal modal--lg open" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">${icon("sparkles", 18)} Chat about &ldquo;${esc(entry.title).slice(0, 60)}${entry.title.length > 60 ? "…" : ""}&rdquo;</h3>
        <button class="modal-close" data-close-chat-entry aria-label="Close">${icon("close")}</button>
      </div>
      <div class="modal-body chat-entry-body" id="chat-entry-body">
        <div class="chat-messages" id="chat-messages"></div>
      </div>
      <div class="modal-footer chat-entry-footer">
        <textarea
          id="chat-entry-input"
          class="textarea"
          rows="2"
          placeholder="Ask anything about this note..."
        ></textarea>
        <button class="btn btn-primary" id="chat-entry-send">${icon("arrowRight", 16)} Send</button>
      </div>
    </div>
  `;
}

export function initChatEntryModal(entryId) {
  const entry = getEntry(entryId);
  if (!entry) return;

  const messagesEl = document.getElementById("chat-messages");
  const input = document.getElementById("chat-entry-input");
  const sendBtn = document.getElementById("chat-entry-send");
  const backdrop = document.getElementById("chat-entry-modal-backdrop");
  const modal = document.getElementById("chat-entry-modal");

  if (!messagesEl || !input || !sendBtn) return;

  const history = []; // [{ role, content }]

  function close() {
    backdrop?.remove();
    modal?.remove();
  }

  function appendMessage(role, content) {
    const div = document.createElement("div");
    div.className = `chat-msg chat-msg--${role}`;
    div.innerHTML = `<div class="chat-msg-bubble">${esc(content).replace(/\n/g, "<br />")}</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendLoading() {
    const div = document.createElement("div");
    div.className = "chat-msg chat-msg--assistant chat-msg--loading";
    div.id = "chat-msg-loading";
    div.innerHTML = `<div class="chat-msg-bubble">${icon("sparkles", 16)} Thinking...</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeLoading() {
    document.getElementById("chat-msg-loading")?.remove();
  }

  async function send() {
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    appendMessage("user", question);
    appendLoading();
    sendBtn.disabled = true;

    try {
      const reply = await chatWithEntry(entry, history, question);
      removeLoading();
      appendMessage("assistant", reply);
      history.push({ role: "user", content: question });
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      removeLoading();
      appendMessage("assistant", `Error: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  backdrop?.addEventListener("click", close);
  document.querySelector("[data-close-chat-entry]")?.addEventListener("click", close);

  input.focus();
}
