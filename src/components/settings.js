// Settings modal — configure Anthropic API key and other preferences.

import { isLoggedIn, saveApiKey as apiSaveKey } from '../lib/api.js';

const API_KEY_STORAGE = "anthropicApiKey";

export function renderSettingsButton({ root }) {
  const btn = document.createElement("button");
  btn.className = "secondary settings-btn";
  btn.title = "Settings";
  btn.innerHTML = "⚙️";
  btn.addEventListener("click", openSettingsModal);
  root.appendChild(btn);
}

function openSettingsModal() {
  const existing = localStorage.getItem(API_KEY_STORAGE) || "";
  const hasKey = existing.length > 0;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <h2 class="modal-title">⚙️ Settings</h2>

      <div class="settings-section">
        <div class="settings-section-title">Anthropic API Key</div>
        <p class="modal-hint">Used for AI reading feedback and story generation. Saved to your family account — available on all devices.</p>
        <div class="settings-key-row">
          <input class="modal-input settings-key-input" id="settings-key"
            type="password" placeholder="sk-ant-…"
            value="${existing}" autocomplete="off" />
          <button class="secondary settings-show-btn" id="settings-show" title="Show/hide key">👁</button>
        </div>
        <div class="settings-key-status" id="settings-status">
          ${hasKey ? `<span style="color:var(--good)">✓ API key configured</span>` : `<span style="color:var(--muted)">No key set — AI feedback and story generation will be unavailable</span>`}
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">About</div>
        <p class="modal-hint">
          每日华文阅读 · Daily Chinese Reading<br>
          Aligned with Singapore MOE PSLE Chinese curriculum (P1–P6).<br>
          Data stored locally on this device only.
        </p>
      </div>

      <div class="modal-error" id="settings-error" hidden></div>

      <div class="modal-actions">
        <button class="secondary" id="settings-clear">Clear Key</button>
        <button class="secondary" id="settings-cancel">Cancel</button>
        <button class="primary" id="settings-save">Save</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const keyEl = overlay.querySelector("#settings-key");
  const statusEl = overlay.querySelector("#settings-status");
  const showBtn = overlay.querySelector("#settings-show");
  const errorEl = overlay.querySelector("#settings-error");

  showBtn.addEventListener("click", () => {
    keyEl.type = keyEl.type === "password" ? "text" : "password";
  });

  keyEl.addEventListener("input", () => {
    const v = keyEl.value.trim();
    statusEl.innerHTML = v
      ? `<span style="color:var(--accent)">Key entered — click Save to apply</span>`
      : `<span style="color:var(--muted)">No key set</span>`;
    errorEl.hidden = true;
  });

  function close() {
    document.removeEventListener("keydown", handleEsc);
    overlay.remove();
  }
  function handleEsc(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", handleEsc);

  overlay.querySelector("#settings-cancel").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  overlay.querySelector("#settings-clear").addEventListener("click", () => {
    localStorage.removeItem(API_KEY_STORAGE);
    keyEl.value = "";
    statusEl.innerHTML = `<span style="color:var(--muted)">Key cleared</span>`;
  });

  overlay.querySelector("#settings-save").addEventListener("click", () => {
    const key = keyEl.value.trim();
    if (key && !key.startsWith("sk-ant-")) {
      errorEl.textContent = "That doesn't look like an Anthropic API key (should start with sk-ant-).";
      errorEl.hidden = false;
      return;
    }
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key);
      if (isLoggedIn()) {
        apiSaveKey(key).catch(() => {});
        statusEl.innerHTML = `<span style="color:var(--good)">✓ Saved to family account</span>`;
      } else {
        statusEl.innerHTML = `<span style="color:var(--good)">✓ Saved locally</span>`;
      }
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
    errorEl.hidden = true;
    setTimeout(close, 600);
  });

  setTimeout(() => keyEl.focus(), 50);
}
