// src/components/tingxieUpload.js
import { extractPaper, createExam } from '../lib/tingxie.js';

export function showTingxieUpload({ studentId, onDone, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'tx-overlay';

  function renderUpload() {
    overlay.innerHTML = `
      <div class="tx-modal">
        <div class="tx-modal-header">
          <button class="tx-back-btn" id="tx-cancel">✕</button>
          <h2>Upload Exam Paper</h2>
        </div>
        <div class="tx-upload-body">
          <p class="tx-hint">Take a photo or upload a PDF — AI extracts the word list.</p>
          <div class="tx-upload-options">
            <label class="tx-upload-btn">
              📷<span>Take Photo</span>
              <input type="file" accept="image/*" capture="environment" hidden id="tx-cam">
            </label>
            <label class="tx-upload-btn">
              📄<span>Choose File</span>
              <input type="file" accept="image/*,application/pdf" hidden id="tx-file">
            </label>
          </div>
          <div id="tx-status"></div>
          <div class="tx-divider">or</div>
          <button class="tx-secondary-btn" id="tx-manual">Enter words manually</button>
        </div>
      </div>`;

    overlay.querySelector('#tx-cancel').onclick = () => { overlay.remove(); onCancel?.(); };
    overlay.querySelector('#tx-manual').onclick = () => renderConfirm(null);

    async function handleFile(file) {
      const status = overlay.querySelector('#tx-status');
      status.textContent = 'Extracting word list…'; status.className = 'tx-upload-status loading';
      try {
        const result = await extractPaper(file);
        if (result.error === 'extraction_failed') {
          status.innerHTML = `<span class="tx-error">We couldn't read the paper clearly — please try a clearer photo or enter words manually.</span>`;
          return;
        }
        renderConfirm(result);
      } catch (e) { status.innerHTML = `<span class="tx-error">${e.message}</span>`; }
    }

    overlay.querySelector('#tx-cam').onchange = e => e.target.files[0] && handleFile(e.target.files[0]);
    overlay.querySelector('#tx-file').onchange = e => e.target.files[0] && handleFile(e.target.files[0]);
  }

  function renderConfirm(extracted) {
    let words = (extracted?.words || []).slice();
    overlay.innerHTML = `
      <div class="tx-modal tx-confirm">
        <div class="tx-modal-header">
          <button class="tx-back-btn" id="tx-back">‹ Back</button>
          <h2>Confirm Word List</h2>
        </div>
        <div class="tx-confirm-body">
          ${extracted?.warning ? `<div class="tx-warning">⚠️ ${extracted.warning}</div>` : ''}
          <label class="tx-field-label">Exam title
            <input class="tx-input" id="tx-title" value="${extracted?.title || ''}" placeholder="e.g. 词语单元一">
          </label>
          <label class="tx-field-label">Exam date
            <input class="tx-input" id="tx-date" type="date" value="${extracted?.examDate || ''}">
          </label>
          <div class="tx-words-header">
            <span id="tx-word-count">Words (${words.length})</span>
            <button class="tx-add-word-btn" id="tx-add-word">+ Add word</button>
          </div>
          <ul class="tx-word-list" id="tx-word-list"></ul>
          <div class="tx-confirm-actions">
            <div id="tx-err" class="tx-error" hidden></div>
            <button class="tx-primary-btn" id="tx-save">Save &amp; Create Schedule →</button>
          </div>
        </div>
      </div>`;

    overlay.querySelector('#tx-back').onclick = renderUpload;

    const wordList = overlay.querySelector('#tx-word-list');
    const wordCount = overlay.querySelector('#tx-word-count');

    function renderWords() {
      wordCount.textContent = `Words (${words.length})`;
      wordList.innerHTML = words.map((w, i) => `
        <li class="tx-word-row" data-idx="${i}">
          <span class="tx-word-hanzi">${w.hanzi}</span>
          <span class="tx-word-pinyin">${w.pinyin || ''}</span>
          <select class="tx-word-type" data-idx="${i}">
            <option value="tingxie" ${w.type === 'tingxie' ? 'selected' : ''}>听写</option>
            <option value="moxie"   ${w.type === 'moxie'   ? 'selected' : ''}>默写</option>
          </select>
          <button class="tx-word-delete" data-idx="${i}" aria-label="Delete">✕</button>
        </li>`).join('');

      wordList.querySelectorAll('.tx-word-delete').forEach(btn => {
        btn.onclick = () => { words.splice(+btn.dataset.idx, 1); renderWords(); };
      });
      wordList.querySelectorAll('.tx-word-type').forEach(sel => {
        sel.onchange = () => { words[+sel.dataset.idx].type = sel.value; };
      });
    }
    renderWords();

    overlay.querySelector('#tx-add-word').onclick = () => {
      const hanzi = prompt('Enter Chinese characters:');
      if (!hanzi?.trim()) return;
      words.push({ hanzi: hanzi.trim(), pinyin: '', type: 'tingxie' });
      renderWords();
    };

    overlay.querySelector('#tx-save').onclick = async () => {
      const title = overlay.querySelector('#tx-title').value.trim();
      const date  = overlay.querySelector('#tx-date').value;
      const errEl = overlay.querySelector('#tx-err');
      if (!title) { errEl.textContent = 'Please enter an exam title.'; errEl.hidden = false; return; }
      if (!date)  { errEl.textContent = 'Please select the exam date.'; errEl.hidden = false; return; }
      if (!words.length) { errEl.textContent = 'Add at least one word.'; errEl.hidden = false; return; }
      errEl.hidden = true;
      try {
        const exam = await createExam({ studentId, title, examDate: date, words });
        overlay.remove();
        onDone(exam);
      } catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
    };
  }

  renderUpload();
  document.body.appendChild(overlay);
}
