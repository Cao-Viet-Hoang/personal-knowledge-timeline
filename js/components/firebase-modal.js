/**
 * Firebase credentials modal.
 * Shown in "prod" mode when no saved credentials exist.
 * User pastes their Firebase config JSON to connect.
 */

import { icon } from "../utils/icons.js";

const EXAMPLE_JSON = `{
  "apiKey": "AIzaSy...",
  "authDomain": "your-app.firebaseapp.com",
  "projectId": "your-app",
  "storageBucket": "your-app.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abc..."
}`;

export function renderFirebaseModal(savedCred = null) {
  const prefilled = savedCred ? JSON.stringify(savedCred, null, 2) : "";

  return `
    <div id="firebase-modal-backdrop" class="modal-backdrop open"></div>
    <div id="firebase-modal" class="modal modal--lg open" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">${icon("settings", 20)} Firebase Configuration</h3>
      </div>
      <div class="modal-body" id="firebase-modal-body">
        <p class="fb-modal-desc">
          Paste your <strong>Firebase Web App config</strong> JSON to connect to Firestore.
        </p>
        <p class="fb-modal-hint">
          Firebase Console → Project Settings → Your apps → Config → Copy
        </p>

        <div class="fb-paste-section">
          <label class="label" for="fb-json-paste">Firebase Config JSON <span class="fb-required">*</span></label>
          <textarea
            id="fb-json-paste"
            class="textarea mono"
            rows="10"
            spellcheck="false"
            placeholder='${esc(EXAMPLE_JSON)}'
          >${esc(prefilled)}</textarea>
        </div>

        <div class="fb-error" id="fb-error" hidden></div>
      </div>
      <div class="modal-footer">
        <span class="fb-env-badge">PROD</span>
        <div style="flex:1"></div>
        <button type="button" class="btn btn-primary" id="fb-connect-btn">
          Connect to Firebase
        </button>
      </div>
    </div>
  `;
}

/**
 * Parse the JSON textarea and return a credential object.
 * Handles raw JSON, `const firebaseConfig = {...}` syntax, and trailing semicolons.
 * @returns {{ cred: object|null, error: string|null }}
 */
export function collectFirebaseCredentials() {
  const textarea = document.getElementById("fb-json-paste");
  if (!textarea) return { cred: null, error: "Textarea not found" };

  let raw = textarea.value.trim();
  if (!raw) return { cred: null, error: "Please paste your Firebase config JSON." };

  // Strip JS variable assignment prefix: const/let/var firebaseConfig =
  raw = raw.replace(/^(const|let|var)\s+\w+\s*=\s*/, "");
  // Strip trailing semicolon
  raw = raw.replace(/;\s*$/, "");
  // Convert JS object literal to valid JSON (wrap unquoted keys with quotes)
  raw = raw.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');

  try {
    const obj = JSON.parse(raw);

    // Validate required fields
    const required = ["apiKey", "authDomain", "projectId"];
    const missing = required.filter((k) => !obj[k]?.trim());
    if (missing.length > 0) {
      return { cred: null, error: `Missing required fields: ${missing.join(", ")}` };
    }

    // Return only known fields
    return {
      cred: {
        apiKey: obj.apiKey?.trim() || "",
        authDomain: obj.authDomain?.trim() || "",
        projectId: obj.projectId?.trim() || "",
        storageBucket: obj.storageBucket?.trim() || "",
        messagingSenderId: obj.messagingSenderId?.trim() || "",
        appId: obj.appId?.trim() || "",
      },
      error: null,
    };
  } catch {
    return { cred: null, error: "Invalid JSON. Paste the firebaseConfig object from Firebase Console." };
  }
}

export function showFirebaseError(msg) {
  const el = document.getElementById("fb-error");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

export function hideFirebaseError() {
  const el = document.getElementById("fb-error");
  if (el) el.hidden = true;
}

export function closeFirebaseModal() {
  const backdrop = document.getElementById("firebase-modal-backdrop");
  const modal = document.getElementById("firebase-modal");
  if (backdrop) backdrop.remove();
  if (modal) modal.remove();
}

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
