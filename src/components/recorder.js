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

export function renderRecorder({ root, getCurrentStory, getActiveStudent, onSaved, onActiveChange, onComplete, onStart }) {
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'recorder-audio';

  const indicator = document.createElement('div');
  indicator.className = 'recording-indicator';
  indicator.style.visibility = 'hidden';
  indicator.innerHTML = '<span class="dot"></span><span>录制中 REC</span>';

  const note = document.createElement('p');
  note.className = 'privacy-note';
  note.textContent = 'Tap Record, read aloud, then Stop to get your score.';

  // Sticky bar with Start / Stop buttons (mobile: fixed at bottom; desktop: inside card)
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

  card.appendChild(indicator);
  card.appendChild(note);
  card.appendChild(stickyBar);
  root.appendChild(card);

  let mediaRecorder = null, chunks = [], startedAt = 0, mimeType = '';
  let recognition = null, transcript = '';
  // Speech quality signals for richer scoring
  let confidenceSum = 0, confidenceCount = 0, lastResultMs = 0, timingGaps = [];

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
    confidenceSum = 0; confidenceCount = 0; lastResultMs = 0; timingGaps = [];
    if (SR) {
      try {
        recognition = new SR();
        recognition.lang = 'zh-CN';
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 3;
        recognition.onresult = (e) => {
          const now = Date.now();
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (!e.results[i].isFinal) continue;
            // Pick the alternative with highest confidence
            let bestText = e.results[i][0].transcript;
            let bestConf = e.results[i][0].confidence || 0;
            for (let j = 1; j < e.results[i].length; j++) {
              if ((e.results[i][j].confidence || 0) > bestConf) {
                bestConf = e.results[i][j].confidence;
                bestText = e.results[i][j].transcript;
              }
            }
            transcript += bestText;
            if (bestConf > 0) { confidenceSum += bestConf; confidenceCount++; }
            if (lastResultMs > 0) timingGaps.push(now - lastResultMs);
            lastResultMs = now;
          }
        };
        recognition.onerror = () => {};
        recognition.start();
      } catch { recognition = null; }
    }

    chunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      // Wait for recognition to deliver its final results before scoring.
      // On iOS/mobile the last onresult fires async after stop() — without
      // this wait the transcript is always empty and the score is always 0.
      if (recognition) {
        await new Promise(resolve => {
          const r = recognition;
          recognition = null;
          const timeout = setTimeout(resolve, 1500);
          r.onend = () => { clearTimeout(timeout); resolve(); };
          try { r.stop(); } catch { clearTimeout(timeout); resolve(); }
        });
      }
      recognition = null;
      stream.getTracks().forEach(t => t.stop());

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
      startBtn.disabled = false; stopBtn.disabled = true;
      stickyBar.classList.remove('is-recording');
      onActiveChange?.(false);
      const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
      onComplete?.({ transcript, story, sessionId, avgConfidence, timingGaps, durationMs });
    };

    mediaRecorder.start();
    startedAt = Date.now();
    startBtn.disabled = true; stopBtn.disabled = false;
    stickyBar.classList.add('is-recording');
    indicator.style.visibility = 'visible';
    onActiveChange?.(true);
    onStart?.();  // scroll story into view
  }

  function stop() {
    if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);

  root._cleanupStickyBar = () => stickyBar.remove();

  return {
    rearm() {
      indicator.style.visibility = 'hidden';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      stickyBar.classList.remove('is-recording');
    },
    setStopLabel(text) {
      stopBtn.textContent = text;
    },
  };
}
