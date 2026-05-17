// src/components/familyOnboarding.js
import { createFamily, joinFamily, setToken } from '../lib/api.js';
import { syncDown } from '../lib/cloud.js';

export function showFamilyOnboarding({ onDone, onSkip }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay onboarding-overlay';
  overlay.innerHTML = `
    <div class="modal-card onboarding-card" role="dialog" aria-modal="true">
      <div class="onboarding-tabs">
        <button class="onboarding-tab active" id="tab-join">Have a Code</button>
        <button class="onboarding-tab" id="tab-create">New Family</button>
      </div>

      <div id="panel-join">
        <p class="modal-hint">Enter your family code to restore progress on this device.</p>
        <input class="modal-input onboarding-code-input" id="ob-code"
          type="text" placeholder="ANIMAL-1234"
          autocomplete="off" autocapitalize="characters" spellcheck="false" />
        <div class="modal-error" id="ob-join-err" hidden></div>
        <div class="modal-actions">
          <button class="secondary" id="ob-skip">Skip</button>
          <button class="primary" id="ob-join-btn">Join →</button>
        </div>
      </div>

      <div id="panel-create" hidden>
        <p class="modal-hint">We'll generate a unique code for your family. Write it down — you'll need it on other devices.</p>
        <div class="modal-error" id="ob-create-err" hidden></div>
        <div class="modal-actions">
          <button class="secondary" id="ob-back">← Back</button>
          <button class="primary" id="ob-create-btn">Create Family</button>
        </div>
      </div>

      <div id="panel-code" hidden>
        <p class="modal-hint" style="text-align:center">Your family code:</p>
        <div class="onboarding-code-display" id="ob-code-display"></div>
        <p class="modal-hint" style="text-align:center;color:var(--danger)">Write this down — you'll need it on other devices.</p>
        <button class="secondary" id="ob-copy" style="width:100%;margin-bottom:8px">Copy Code</button>
        <button class="primary" id="ob-done" style="width:100%">Done →</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const panels = { join: overlay.querySelector('#panel-join'), create: overlay.querySelector('#panel-create'), code: overlay.querySelector('#panel-code') };
  const tabs = { join: overlay.querySelector('#tab-join'), create: overlay.querySelector('#tab-create') };

  function show(name) {
    Object.entries(panels).forEach(([k, el]) => el.hidden = k !== name);
    tabs.join?.classList.toggle('active', name === 'join');
    tabs.create?.classList.toggle('active', name === 'create');
  }

  tabs.join.addEventListener('click', () => show('join'));
  tabs.create.addEventListener('click', () => show('create'));
  overlay.querySelector('#ob-back').addEventListener('click', () => show('join'));
  overlay.querySelector('#ob-skip').addEventListener('click', () => { overlay.remove(); onSkip?.(); });

  // Join flow
  const joinErr = overlay.querySelector('#ob-join-err');
  const joinBtn = overlay.querySelector('#ob-join-btn');
  joinBtn.addEventListener('click', async () => {
    const code = overlay.querySelector('#ob-code').value.trim();
    if (!code) { joinErr.textContent = 'Please enter your family code.'; joinErr.hidden = false; return; }
    joinBtn.disabled = true; joinBtn.textContent = '⏳ Joining…'; joinErr.hidden = true;
    try {
      const { token } = await joinFamily(code);
      setToken(token);
      await syncDown();
      overlay.remove();
      onDone?.();
    } catch (err) {
      joinErr.textContent = err.message.includes('Invalid') ? 'Code not found. Check spelling.' : err.message;
      joinErr.hidden = false;
      joinBtn.disabled = false; joinBtn.textContent = 'Join →';
    }
  });

  // Create flow
  const createErr = overlay.querySelector('#ob-create-err');
  const createBtn = overlay.querySelector('#ob-create-btn');
  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true; createBtn.textContent = '⏳ Creating…'; createErr.hidden = true;
    try {
      const { code, token } = await createFamily();
      setToken(token);
      overlay.querySelector('#ob-code-display').textContent = code;
      show('code');
    } catch (err) {
      createErr.textContent = err.message;
      createErr.hidden = false;
      createBtn.disabled = false; createBtn.textContent = '✨ Create Family';
    }
  });

  overlay.querySelector('#ob-copy').addEventListener('click', function () {
    navigator.clipboard?.writeText(overlay.querySelector('#ob-code-display').textContent).catch(() => {});
    this.textContent = '✓ Copied!';
  });

  overlay.querySelector('#ob-done').addEventListener('click', () => { overlay.remove(); onDone?.(); });

  setTimeout(() => overlay.querySelector('#ob-code')?.focus(), 50);
}
