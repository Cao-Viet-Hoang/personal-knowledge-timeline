/**
 * Firebase credentials modal.
 * Shown in "prod" mode when no saved credentials exist.
 * User pastes their Firebase config JSON or fills individual fields.
 */

import { icon } from "../utils/icons.js";

export function renderFirebaseModal(savedCred = null) {
  const v = (field) => savedCred?.[field] || "";

  return `
    <div id="firebase-modal-backdrop" class="modal-backdrop open"></div>
    <div id="firebase-modal" class="modal modal--lg open" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">Firebase Configuration</h3>
      </div>
      <div class="modal-body" id="firebase-modal-body">
        <p class="fb-modal-desc">
          App is running in <strong>production mode</strong>. Enter your Firebase project credentials to connect to Firestore.
        </p>

        <div class="fb-paste-section">
          <label class="label" for="fb-json-paste">Paste Firebase config JSON</label>
          <textarea
            id="fb-json-paste"
            class="textarea"
            rows="6"
            placeholder='{"apiKey": "...", "authDomain": "...", "projectId": "...", ...}'
          ></textarea>
          <button type="button" class="btn btn-outline btn-sm" id="fb-parse-json" style="margin-top: var(--space-2)">
            Parse JSON
          </button>
        </div>

        <div class="fb-divider"><span>OR fill manually</span></div>

        <div class="fb-fields">
          <div class="form-group">
            <label class="label" for="fb-apiKey">API Key <span class="fb-required">*</span></label>
            <input type="text" id="fb-apiKey" class="input" placeholder="AIzaSy..." value="${esc(v("apiKey"))}" />
          </div>
          <div class="form-group">
            <label class="label" for="fb-authDomain">Auth Domain <span class="fb-required">*</span></label>
            <input type="text" id="fb-authDomain" class="input" placeholder="your-app.firebaseapp.com" value="${esc(v("authDomain"))}" />
          </div>
          <div class="form-group">
            <label class="label" for="fb-projectId">Project ID <span class="fb-required">*</span></label>
            <input type="text" id="fb-projectId" class="input" placeholder="your-app" value="${esc(v("projectId"))}" />
          </div>
          <div class="form-group">
            <label class="label" for="fb-storageBucket">Storage Bucket</label>
            <input type="text" id="fb-storageBucket" class="input" placeholder="your-app.appspot.com" value="${esc(v("storageBucket"))}" />
          </div>
          <div class="form-group">
            <label class="label" for="fb-messagingSenderId">Messaging Sender ID</label>
            <input type="text" id="fb-messagingSenderId" class="input" placeholder="123456789" value="${esc(v("messagingSenderId"))}" />
          </div>
          <div class="form-group">
            <label class="label" for="fb-appId">App ID</label>
            <input type="text" id="fb-appId" class="input" placeholder="1:123456789:web:abc..." value="${esc(v("appId"))}" />
          </div>
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
 * Read credential fields from the modal DOM.
 * @returns {object}
 */
export function collectFirebaseCredentials() {
  const fields = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
  const cred = {};
  for (const f of fields) {
    const el = document.getElementById(`fb-${f}`);
    if (el) cred[f] = el.value.trim();
  }
  return cred;
}

/**
 * Attempt to parse a JSON string and fill the form fields.
 * @param {string} jsonStr
 * @returns {boolean} success
 */
export function parseAndFillJson(jsonStr) {
  try {
    // Handle cases where user pastes the whole firebaseConfig assignment
    let cleaned = jsonStr.trim();
    // Strip "const firebaseConfig = " prefix if present
    cleaned = cleaned.replace(/^(const|let|var)\s+\w+\s*=\s*/, "");
    // Strip trailing semicolon
    cleaned = cleaned.replace(/;\s*$/, "");

    const obj = JSON.parse(cleaned);
    const fields = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
    for (const f of fields) {
      const el = document.getElementById(`fb-${f}`);
      if (el && obj[f]) el.value = obj[f];
    }
    return true;
  } catch {
    return false;
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
