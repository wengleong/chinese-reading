// Audio recorder with SpeechRecognition for scoring.
// No camera/canvas — the story reader is the teleprompter.

import { saveRecording } from '../lib/storage.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

function pickMimeType() {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
}

export function renderRecorder({ root, toolbarRoot, getCurrentStory, getActiveStudent, onSaved, onActiveChange, onComplete, onStart }) {
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'recorder-audio';

  const indicator = document.createElement('div');
  indicator.className = 'recording-indicator';
  indicator.style.visibility = 'hidden';
  indicator.innerHTML = '<span class="dot"></span><span>录制中 REC</span>';

  const timer = document.createElement('span');
  timer.className = 'recording-timer';
  timer.textContent = '0:00';

  const note = document.createElement('p');
  note.className = 'privacy-note';
  note.textContent = 'Audio stays on this device. Tap Record, read aloud, then tap Stop.';

  card.appendChild(indicator);
  card.appendChild(timer);
  card.appendChild(note);
  root.appendChild(card);

  // Sticky bar with Start / Stop buttons (mobile: fixed at bottom; desktop: inline)
  const stickyBar = document.createElement('div');
  stickyBar.className = 'recorder-sticky-bar';

  const startBtn = document.createElement('button');
  startBtn.className = 'primary recorder-start-btn';
  startBtn.textContent = '🎙️ 开始录音 Record';

  const stopBtn = document.createElement('button');
  stopBtn.className = 'danger recorder-stop-btn';
  stopBtn.textContent = '■ 停止 Stop & Score';
  stopBtn.disabled = true;

  stickyBar.appendChild(startBtn);
  stickyBar.appendChild(stopBtn);
  // On desktop the buttons live in the toolbar above the story; on mobile
  // the bar is position:fixed so DOM location doesn't matter visually.
  (toolbarRoot || root).appendChild(stickyBar);

  let mediaRecorder = null, chunks = [], startedAt = 0, mimeType = '';
  let recognition = null, transcript = '';
  let timerInterval = null;

  function updateTimer() {
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }

  async function start() {
    const story = getCurrentStory?.();
    if (!story) { alert('请先选择一个故事 (Pick a story first).'); return; }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      alert('Could not access microphone: ' + err.message);
      return;
    }

    mimeType = pickMimeType();
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    transcript = '';
    if (SR) {
      try {
        recognition = new SR();
        recognition.lang = 'zh-CN';
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) transcript += e.results[i][0].transcript;
          }
        };
        recognition.onerror = () => {};
        recognition.start();
      } catch { recognition = null; }
    }

    chunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      try { recognition?.stop(); } catch {}
      recognition = null;
      stream.getTracks().forEach(t => t.stop());
      clearInterval(timerInterval);

      const story = getCurrentStory?.();
      const student = getActiveStudent?.();
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      const durationMs = Date.now() - startedAt;
      const sessionId = `sess-${Date.now()}`;

      try {
        await saveRecording({
          storyId: story?.id, storyTitle: story?.title,
          blob, mimeType: blob.type, durationMs,
          studentId: student?.id ?? null, sessionId,
        });
        onSaved?.();
      } catch (err) { console.warn('Save failed:', err.message); }

      indicator.style.visibility = 'hidden';
      timer.textContent = '0:00';
      startBtn.disabled = false; stopBtn.disabled = true;
      stickyBar.classList.remove('is-recording');
      onActiveChange?.(false);
      onComplete?.({ transcript, story, sessionId });
    };

    mediaRecorder.start();
    startedAt = Date.now();
    startBtn.disabled = true; stopBtn.disabled = false;
    stickyBar.classList.add('is-recording');
    indicator.style.visibility = 'visible';
    timerInterval = setInterval(updateTimer, 500);
    onActiveChange?.(true);
    onStart?.();  // scroll story into view
  }

  function stop() {
    if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);

  root._cleanupStickyBar = () => stickyBar.remove();
}
