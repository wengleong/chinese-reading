// Sentence-level Chinese TTS engine with per-character highlight timing.
//
// Tokens are grouped into sentence segments (breaking at 。！？) and each
// segment is spoken as a single utterance for natural, flowing speech.
// Highlighting uses a hybrid strategy:
//   1. onboundary (Chrome/Firefox) snaps position to actual word boundaries.
//   2. A timer fills in char-by-char between boundaries.
//   3. Adaptive calibration measures actual ms/char from completed segments
//      and adjusts the timer so it stays locked to the voice over time.
// onstart fires ~80ms before audio on most engines, so we add a small delay.

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

function pickChineseVoice() {
  if (!synth) return null;
  const voices = synth.getVoices();
  // Prefer local (downloaded) voices — they handle tone sandhi better
  return (
    voices.find((v) => v.lang === "zh-CN" && v.localService) ||
    voices.find((v) => v.lang === "zh-CN") ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("zh")) ||
    null
  );
}

function whenVoicesReady() {
  return new Promise((resolve) => {
    if (!synth) return resolve();
    if (synth.getVoices().length > 0) return resolve();
    synth.addEventListener("voiceschanged", () => resolve(), { once: true });
  });
}

export function isSupported() {
  return !!synth && typeof SpeechSynthesisUtterance !== "undefined";
}

// Group tokens into sentence-level segments, breaking at sentence-ending
// punctuation so each utterance is a complete natural phrase.
function buildSegments(tokens) {
  const SENTENCE_END = new Set(["。", "！", "？"]);
  const segments = [];
  let current = [];

  tokens.forEach((token, globalIdx) => {
    current.push({ token, globalIdx });
    if (SENTENCE_END.has(token.char) || token.char === "\n") {
      segments.push(current);
      current = [];
    }
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

export function createPlayer({ tokens, onTokenStart, onEnd }) {
  const segments = buildSegments(tokens);
  let segIndex = 0;
  let playing = false;
  let rate = 0.9;
  let cancelled = false;
  let highlightTimer = null;

  // Adaptive calibration: actual ms-per-char (rate-normalised) measured from
  // completed segments. Starts conservative (slightly > 250ms) so highlights
  // don't race ahead of the audio on the first segment.
  let calibratedMsPerChar = 265;

  function clearHighlightTimer() {
    if (highlightTimer !== null) {
      clearTimeout(highlightTimer);
      highlightTimer = null;
    }
  }

  function speakSegment() {
    if (cancelled || !playing) return;
    if (segIndex >= segments.length) {
      playing = false;
      onEnd && onEnd();
      return;
    }

    const seg = segments[segIndex];

    // Build spoken text: Chinese chars + standard punctuation only.
    const KEEP = /[\u4e00-\u9fff。，！？：；]/;
    const text = seg.map(({ token }) => KEEP.test(token.char) ? token.char : "").join("");

    // Count speakable chars (non-punctuation) for calibration.
    const speakableCount = seg.filter(s => s.token.pinyin).length;

    // Precompute stripped-text position → segment token index for onboundary.
    const charPosToTokenIdx = new Map();
    let textPos = 0;
    for (let i = 0; i < seg.length; i++) {
      if (KEEP.test(seg[i].token.char)) { charPosToTokenIdx.set(textPos, i); textPos++; }
    }

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = rate;
    const voice = pickChineseVoice();
    if (voice) u.voice = voice;

    let charIdx = 0;
    let onStartFired = false;
    let startFallback = null;
    let highlightStartMs = 0;

    const SENT_END = new Set(['。', '！', '？']);
    const CLAUSE    = new Set(['，', '；', '：']);

    function advanceHighlight() {
      if (cancelled || charIdx >= seg.length) return;
      const { token, globalIdx } = seg[charIdx];
      onTokenStart && onTokenStart(globalIdx, token);
      charIdx++;
      if (charIdx < seg.length) {
        // Sentence-ending punctuation pauses longer than clause punctuation.
        let punctPause = 0;
        if (SENT_END.has(token.char))  punctPause = Math.round(400 / rate);
        else if (CLAUSE.has(token.char)) punctPause = Math.round(200 / rate);
        highlightTimer = setTimeout(advanceHighlight, (calibratedMsPerChar / rate) + punctPause);
      }
    }

    function beginHighlight() {
      charIdx = 0;
      highlightStartMs = Date.now();
      advanceHighlight();
    }

    // onboundary fires on Chrome/Firefox at word boundaries.
    // Use it to snap the highlight position and reset the timer.
    u.onboundary = (e) => {
      if (cancelled || e.name !== 'word') return;
      const mappedIdx = charPosToTokenIdx.get(e.charIndex);
      if (mappedIdx !== undefined && mappedIdx >= charIdx) {
        clearHighlightTimer();
        charIdx = mappedIdx;
        const { token, globalIdx } = seg[charIdx];
        onTokenStart && onTokenStart(globalIdx, token);
        charIdx++;
        if (charIdx < seg.length) {
          highlightTimer = setTimeout(advanceHighlight, calibratedMsPerChar / rate);
        }
      }
    };

    u.onstart = () => {
      onStartFired = true;
      if (startFallback) { clearTimeout(startFallback); startFallback = null; }
      if (cancelled) return;
      // Audio output lags ~80ms after onstart fires on most engines.
      setTimeout(beginHighlight, 80);
    };

    // Safari / mobile fallback — onstart fires late or not at all.
    startFallback = setTimeout(() => {
      if (!onStartFired && !cancelled && playing) beginHighlight();
    }, 320);

    u.onend = () => {
      if (startFallback) { clearTimeout(startFallback); startFallback = null; }
      clearHighlightTimer();
      if (cancelled) return;
      // Calibrate: update ms-per-char estimate from this segment's actual duration.
      if (speakableCount >= 3 && highlightStartMs > 0) {
        const actualMs = Date.now() - highlightStartMs;
        const measured = (actualMs / speakableCount) * rate; // rate-normalise
        // Exponential moving average — weight recent segments 60%.
        calibratedMsPerChar = calibratedMsPerChar * 0.4 + measured * 0.6;
      }
      segIndex++;
      speakSegment();
    };

    u.onerror = () => {
      if (startFallback) { clearTimeout(startFallback); startFallback = null; }
      clearHighlightTimer();
      if (cancelled) return;
      segIndex++;
      speakSegment();
    };

    synth.speak(u);
  }

  return {
    async play() {
      await whenVoicesReady();
      if (playing) return;
      playing = true;
      cancelled = false;
      if (segIndex >= segments.length) segIndex = 0;
      speakSegment();
    },
    pause() {
      playing = false;
      cancelled = true;
      clearHighlightTimer();
      if (synth) synth.cancel();
    },
    restart() {
      this.pause();
      segIndex = 0;
    },
    setRate(value) {
      rate = value;
    },
    isPlaying() {
      return playing;
    },
  };
}
