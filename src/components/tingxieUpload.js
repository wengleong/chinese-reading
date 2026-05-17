// src/components/tingxieUpload.js
import { extractPaper, createExam, createUploadSession, pollUploadSession } from '../lib/tingxie.js';

export function showTingxieUpload({ studentId, onDone, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'tx-overlay';

  let pollInterval = null;

  function cleanup() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  function renderUpload() {
    cleanup();
    overlay.innerHTML = `
      <div class="tx-modal">
        <div class="tx-modal-header">
          <button class="tx-back-btn" id="tx-cancel">✕</button>
          <h2>Upload Exam Paper</h2>
        </div>
        <div class="tx-upload-body">
          <p class="tx-hint">Take photos or upload files — AI extracts the word list and splits multiple exams automatically.</p>
          <div class="tx-upload-options">
            <label class="tx-upload-btn">
              📷<span>Take Photo</span>
              <input type="file" accept="image/*" multiple hidden id="tx-cam">
            </label>
            <label class="tx-upload-btn">
              📄<span>Choose Files</span>
              <input type="file" accept="image/*,application/pdf" multiple hidden id="tx-file">
            </label>
            <button class="tx-upload-btn" id="tx-qr">
              <span style="font-size:1.4rem">📱</span><span>Use Phone Camera</span>
            </button>
          </div>
          <div id="tx-status"></div>
          <div class="tx-divider">or</div>
          <button class="tx-secondary-btn" id="tx-manual">Enter words manually</button>
        </div>
      </div>`;

    overlay.querySelector('#tx-cancel').onclick = () => { cleanup(); overlay.remove(); onCancel?.(); };
    overlay.querySelector('#tx-manual').onclick = () => renderConfirmMulti([]);
    overlay.querySelector('#tx-cam').onchange = e => e.target.files.length && handleFiles([...e.target.files]);
    overlay.querySelector('#tx-file').onchange = e => e.target.files.length && handleFiles([...e.target.files]);
    overlay.querySelector('#tx-qr').onclick = renderQr;
  }

  async function handleFiles(files) {
    // Full-screen processing state — consistent with QR flow
    overlay.innerHTML = `
      <div class="tx-modal">
        <div class="tx-modal-header">
          <div></div>
          <h2>Extracting Word List</h2>
        </div>
        <div class="tx-upload-body" style="align-items:center;text-align:center">
          <div style="font-size:3rem;margin:16px 0">⏳</div>
          <p style="font-weight:600;color:#e8590c;font-size:1rem">${files.length} file${files.length > 1 ? 's' : ''} uploaded — AI is extracting the word list…</p>
          <p class="tx-hint" style="margin-top:8px">This usually takes 10–20 seconds.</p>
        </div>
      </div>`;
    try {
      const result = await extractPaper(files);
      if (result.error === 'extraction_failed') {
        overlay.innerHTML = `
          <div class="tx-modal">
            <div class="tx-modal-header">
              <button class="tx-back-btn" id="tx-back">‹ Back</button>
              <h2>Upload Exam Paper</h2>
            </div>
            <div class="tx-upload-body" style="align-items:center;text-align:center">
              <div style="font-size:2.5rem;margin:12px 0">❌</div>
              <p class="tx-error" style="text-align:center">Couldn't read the paper clearly — try a clearer photo or enter words manually.</p>
            </div>
          </div>`;
        overlay.querySelector('#tx-back').onclick = renderUpload;
        return;
      }
      renderConfirmMulti(result.exams || []);
    } catch (e) {
      overlay.innerHTML = `
        <div class="tx-modal">
          <div class="tx-modal-header">
            <button class="tx-back-btn" id="tx-back">‹ Back</button>
            <h2>Upload Exam Paper</h2>
          </div>
          <div class="tx-upload-body" style="align-items:center;text-align:center">
            <div style="font-size:2.5rem;margin:12px 0">❌</div>
            <p class="tx-error" style="text-align:center">${e.message}</p>
          </div>
        </div>`;
      overlay.querySelector('#tx-back').onclick = renderUpload;
    }
  }

  async function renderQr() {
    overlay.innerHTML = `
      <div class="tx-modal">
        <div class="tx-modal-header">
          <button class="tx-back-btn" id="tx-back">‹ Back</button>
          <h2>Use Phone Camera</h2>
        </div>
        <div class="tx-upload-body" style="align-items:center;text-align:center">
          <p class="tx-hint">Scan this QR code with your phone, then take photos of the exam paper(s).</p>
          <div id="tx-qr-box" style="margin:16px auto;max-width:220px"></div>
          <p id="tx-qr-status" class="tx-hint" style="color:#6b6b6b">📱 Waiting for phone upload…</p>
        </div>
      </div>`;
    overlay.querySelector('#tx-back').onclick = renderUpload;

    let session;
    try {
      session = await createUploadSession();
    } catch (e) {
      overlay.querySelector('#tx-qr-status').textContent = 'Failed to create session: ' + e.message;
      return;
    }

    const qrBox = overlay.querySelector('#tx-qr-box');
    qrBox.innerHTML = session.qrSvg;
    qrBox.querySelector('svg').style.width = '100%';
    qrBox.querySelector('svg').style.height = 'auto';

    pollInterval = setInterval(async () => {
      try {
        const res = await pollUploadSession(session.token);
        if (res.status !== 'ready') return;
        cleanup();

        const n = res.files.length;
        // Replace QR + status with a full processing state
        overlay.querySelector('#tx-qr-box').innerHTML = `<div style="font-size:3rem;margin:12px 0">⏳</div>`;
        const statusEl = overlay.querySelector('#tx-qr-status');
        statusEl.style.color = '#e8590c';
        statusEl.style.fontWeight = '600';
        statusEl.style.fontSize = '1rem';
        statusEl.textContent = `${n} photo${n > 1 ? 's' : ''} received — extracting word list…`;

        // Convert base64 files to File objects for extraction
        const files = res.files.map((f, i) => {
          const bytes = atob(f.data);
          const arr = new Uint8Array(bytes.length);
          for (let j = 0; j < bytes.length; j++) arr[j] = bytes.charCodeAt(j);
          return new File([arr], `photo-${i + 1}.jpg`, { type: f.mimeType });
        });

        const result = await extractPaper(files);
        if (result.error === 'extraction_failed') {
          overlay.querySelector('#tx-qr-box').innerHTML = `<div style="font-size:2.5rem;margin:12px 0">❌</div>`;
          statusEl.style.color = '#c92a2a';
          statusEl.style.fontWeight = 'normal';
          statusEl.textContent = "Couldn't read the paper — try again or enter manually.";
          return;
        }
        renderConfirmMulti(result.exams || []);
      } catch (e) {
        // Silently ignore poll errors (network blip)
      }
    }, 2500);
  }

  // Multi-exam confirm: step through exams one by one
  function renderConfirmMulti(exams) {
    cleanup();
    if (!exams.length) {
      // No exams extracted — go straight to manual entry
      renderConfirmOne(null, 0, 1, []);
      return;
    }
    renderConfirmOne(exams[0], 0, exams.length, exams);
  }

  function renderConfirmOne(extracted, index, total, allExams) {
    const isLast = index === total - 1;
    const isOnly = total === 1;
    let words = (extracted?.words || []).slice();

    overlay.innerHTML = `
      <div class="tx-modal tx-confirm">
        <div class="tx-modal-header">
          <button class="tx-back-btn" id="tx-back">‹ Back</button>
          <h2>${total > 1 ? `Exam ${index + 1} of ${total}` : 'Confirm Word List'}</h2>
        </div>
        <div class="tx-confirm-body">
          ${extracted?.warning ? `<div class="tx-warning" id="tx-warning">⚠️</div>` : ''}
          <label class="tx-field-label">Exam title <span class="tx-required">*</span>
            <input class="tx-input" id="tx-title" placeholder="e.g. 词语单元一">
          </label>
          <label class="tx-field-label">Exam date <span class="tx-required">*</span>
            <input class="tx-input" id="tx-date" type="date">
          </label>
          <div class="tx-words-header">
            <span id="tx-word-count">Words (${words.length})</span>
            <button class="tx-add-word-btn" id="tx-add-word">+ Add word</button>
          </div>
          <ul class="tx-word-list" id="tx-word-list"></ul>
          <div class="tx-confirm-actions">
            <div id="tx-err" class="tx-error" hidden></div>
            <button class="tx-primary-btn" id="tx-save">
              ${isOnly ? 'Save &amp; Create Schedule →' : isLast ? 'Save All →' : `Save &amp; Next Exam →`}
            </button>
          </div>
        </div>
      </div>`;

    // Snapshot current form state back into allExams before navigating away
    function snapshotCurrent() {
      const title = overlay.querySelector('#tx-title').value.trim();
      const examDate = overlay.querySelector('#tx-date').value;
      allExams[index] = { ...(allExams[index] || {}), title, examDate, words: words.slice() };
    }

    overlay.querySelector('#tx-back').onclick = () => {
      snapshotCurrent();
      if (index === 0) renderUpload();
      else renderConfirmOne(allExams[index - 1], index - 1, total, allExams);
    };

    // Set text content via DOM to avoid XSS from AI-extracted strings
    if (extracted?.warning) overlay.querySelector('#tx-warning').append(' ' + extracted.warning);
    if (extracted?.title) overlay.querySelector('#tx-title').value = extracted.title;
    if (extracted?.examDate) overlay.querySelector('#tx-date').value = extracted.examDate;

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
        snapshotCurrent();
        const exam = await createExam({ studentId, title, examDate: date, words });
        if (isLast || isOnly) {
          overlay.remove();
          onDone(exam);
        } else {
          renderConfirmOne(allExams[index + 1], index + 1, total, allExams);
        }
      } catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
    };
  }

  renderUpload();
  document.body.appendChild(overlay);
}
