// Audio recorder with SpeechRecognition for scoring.
// No camera/canvas — the story reader is the teleprompter.

import { saveRecording } from '../lib/storage.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

export const speechSupported = !!SR;

// Errors that mean recognition will never produce a transcript for this take.
// 'no-speech' is benign — Chrome fires it after a silence and we simply restart.
const FATAL_SR_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network']);

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

  // Status line — surfaces recognition/scoring problems instead of failing silently.
  const status = document.createElement('p');
  status.className = 'recorder-status';
  status.hidden = true;

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
  card.appendChild(status);
  card.appendChild(stickyBar);
  root.appendChild(card);

  function setStatus(text, kind = 'error') {
    status.textContent = text || '';
    status.hidden = !text;
    status.className = `recorder-status${text ? ' is-' + kind : ''}`;
  }

  let mediaRecorder = null, chunks = [], startedAt = 0, mimeType = '';
  let recognition = null, transcript = '', interimTranscript = '', speechError = null, wantRecognition = false;
  let sawAnyResult = false;
  // Speech quality signals for richer scoring
  let confidenceSum = 0, confidenceCount = 0, lastResultMs = 0, timingGaps = [];

  async function start() {
    const story = getCurrentStory?.();
    if (!story) { alert('请先选择一个故事 (Pick a story first).'); return; }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // err.name is the diagnosis (NotAllowedError = permission, NotFoundError =
      // no device, NotReadableError = another app holds the mic); err.message
      // alone is browser-specific prose that says nothing actionable.
      alert(`Could not access microphone (${err.name}): ${err.message}`);
      return;
    }

    mimeType = pickMimeType();
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    transcript = '';
    interimTranscript = '';
    sawAnyResult = false;
    speechError = null;
    confidenceSum = 0; confidenceCount = 0; lastResultMs = 0; timingGaps = [];
    if (SR) {
      // Chrome ends a recognition session after a few seconds of silence even
      // with continuous=true. Restart it while the take is still running,
      // otherwise everything the student says after their first pause is lost.
      let restarts = 0;
      try {
        recognition = new SR();
        wantRecognition = true;
        // An English passage transcribed as zh-CN comes back as garbage, which
        // would then score 0 — the language must follow the story.
        recognition.lang = story.lang === 'en' ? 'en-SG' : 'zh-CN';
        recognition.continuous = true;
        // Interim results are enabled so we can fall back to them at stop time.
        // Android Chrome sometimes never finalises a take that stayed below the
        // recogniser's confidence threshold — the student would otherwise get
        // "we did not hear anything" even though the mic captured audio.
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;
        recognition.onresult = (e) => {
          const now = Date.now();
          sawAnyResult = true;
          let interimBuf = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            // Pick the alternative with highest confidence.
            let bestText = res[0].transcript;
            let bestConf = res[0].confidence || 0;
            for (let j = 1; j < res.length; j++) {
              if ((res[j].confidence || 0) > bestConf) {
                bestConf = res[j].confidence;
                bestText = res[j].transcript;
              }
            }
            if (res.isFinal) {
              transcript += bestText;
              if (bestConf > 0) { confidenceSum += bestConf; confidenceCount++; }
              if (lastResultMs > 0) timingGaps.push(now - lastResultMs);
              lastResultMs = now;
            } else {
              interimBuf += bestText;
            }
          }
          // Chrome resends the growing prefix each interim event, so replace
          // rather than append.
          if (interimBuf) interimTranscript = interimBuf;
        };
        recognition.onerror = (e) => {
          const code = e?.error || 'unknown';
          if (FATAL_SR_ERRORS.has(code)) {
            speechError = code;
            wantRecognition = false;   // no point restarting — it will fail again
          }
        };
        recognition.addEventListener('end', () => {
          // Silence timeout mid-take: restart so the rest of the answer is heard.
          if (!wantRecognition || restarts >= 20) return;
          restarts += 1;
          try { recognition.start(); } catch { /* already restarting */ }
        });
        recognition.start();
      } catch {
        recognition = null;
        wantRecognition = false;
        speechError = 'start-failed';
      }
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
          wantRecognition = false;   // stop the silence-timeout auto-restart
          // 2s covers slow iOS devices; onend fires sooner on desktop.
          const timeout = setTimeout(resolve, 2000);
          // Use addEventListener to avoid clobbering any internal browser handler.
          r.addEventListener('end', () => { clearTimeout(timeout); resolve(); }, { once: true });
          try { r.stop(); } catch {
            // stop() throws if recognition already ended (e.g. silence timeout).
            // Wait briefly for any pending onresult events before giving up.
            clearTimeout(timeout);
            setTimeout(resolve, 300);
          }
        });
      }
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
      // Fall back to the last interim result if the recogniser never finalised —
      // otherwise a genuine read is thrown away as "no audio heard".
      let finalTranscript = transcript;
      if (!finalTranscript.trim() && interimTranscript.trim()) {
        finalTranscript = interimTranscript;
      }
      // Distinguish "recogniser returned nothing at all" from other failure
      // modes so the UI steers the reader towards the actual fix.
      if (!finalTranscript.trim() && !sawAnyResult && !speechError) {
        speechError = 'no-transcript';
      }
      const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
      onComplete?.({
        transcript: finalTranscript, story, sessionId, avgConfidence, timingGaps, durationMs,
        speechSupported, speechError,
      });
    };

    setStatus('');
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
    setStatus,
  };
}
