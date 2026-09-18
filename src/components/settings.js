// Settings modal — app info and family account status.
// There is no API key here: every AI feature runs on the server's own
// ANTHROPIC_API_KEY, so nothing to configure and no key in the browser.

import { isLoggedIn, getTranscriptionConsent, setTranscriptionConsent } from '../lib/api.js';

export function renderSettingsButton({ root }) {
  const btn = document.createElement("button");
  btn.className = "secondary settings-btn";
  btn.title = "Settings";
  btn.innerHTML = "⚙️";
  btn.addEventListener("click", openSettingsModal);
  root.appendChild(btn);
}

function openSettingsModal() {
  const loggedIn = isLoggedIn();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <h2 class="modal-title">⚙️ Settings</h2>

      <div class="settings-section">
        <div class="settings-section-title">AI Features</div>
        <p class="modal-hint">
          Oral scoring, reading feedback, story generation and 听写 grading run on
          the app's own AI service — there is no API key to set up.
        </p>
        <div class="settings-key-status" id="settings-status">
          ${loggedIn
            ? `<span style="color:var(--good)">✓ Signed in to a family account — AI features are available</span>`
            : `<span style="color:var(--muted)">Not signed in — join or create a family account to use AI features</span>`}
        </div>
      </div>

      ${loggedIn ? `
      <div class="settings-section">
        <div class="settings-section-title">Voice transcription assistance</div>
        <p class="modal-hint">
          On some devices your browser cannot transcribe speech on its own
          (Linux Chrome, some non-Google Android tablets, Firefox). If you
          consent, your child's read-aloud audio will be sent to
          <b>OpenAI's transcription service (US-based)</b> as a fallback so
          the read-aloud can still be scored. The audio is not stored on our
          server. The transcription vendor holds it only for their standard
          abuse-monitoring window. You can withdraw consent at any time.
        </p>
        <label class="toggle" style="display:flex; align-items:flex-start; gap:8px; margin-top:8px">
          <input type="checkbox" id="settings-transcription-consent" disabled />
          <span>I consent to server-side transcription as described above.</span>
        </label>
        <div class="settings-key-status" id="settings-transcription-status" style="margin-top:6px"></div>
      </div>` : ''}

      <div class="settings-section">
        <div class="settings-section-title">About</div>
        <p class="modal-hint">
          每日华文阅读 · Daily Chinese Reading<br>
          Aligned with Singapore MOE PSLE Chinese curriculum (P1–P6).<br>
          Progress is stored on this device and synced to your family account.
        </p>
      </div>

      <div class="modal-actions">
        <button class="primary" id="settings-close">Close</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  function close() {
    document.removeEventListener("keydown", handleEsc);
    overlay.remove();
  }
  function handleEsc(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", handleEsc);

  overlay.querySelector("#settings-close").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  if (loggedIn) {
    const checkbox = overlay.querySelector('#settings-transcription-consent');
    const status = overlay.querySelector('#settings-transcription-status');
    // Toggle is disabled until we know the current server-side state, so a
    // stale-looking checkbox never lets a parent think they have consented
    // when they have not.
    getTranscriptionConsent()
      .then(({ consent }) => {
        checkbox.checked = !!consent;
        checkbox.disabled = false;
        status.textContent = consent
          ? '✓ Consent on file for this family.'
          : 'Not consented — server transcription will not be used for this family.';
      })
      .catch(err => {
        status.textContent = 'Could not load consent state: ' + err.message;
      });

    checkbox.addEventListener('change', () => {
      const want = checkbox.checked;
      checkbox.disabled = true;
      status.textContent = want ? 'Saving consent…' : 'Withdrawing consent…';
      setTranscriptionConsent(want)
        .then(({ consent }) => {
          checkbox.checked = !!consent;
          status.textContent = consent
            ? '✓ Consent on file for this family.'
            : 'Consent withdrawn.';
        })
        .catch(err => {
          checkbox.checked = !want;
          status.textContent = 'Save failed: ' + err.message;
        })
        .finally(() => { checkbox.disabled = false; });
    });
  }
}
