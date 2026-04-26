// Sentence-level Chinese TTS engine with per-character highlight timing.
//
// Tokens are grouped into sentence segments (breaking at 。！？) and each
// segment is spoken as a single utterance for natural, flowing speech.
// Per-character highlighting is driven by a timer using an estimated pace,
// since SpeechSynthesisUtterance.onboundary is unreliable for zh-CN.

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

function pickChineseVoice() {
  if (!synth) return null;
  const voices = synth.getVoices();
  return (
    voices.find((v) => v.lang === "zh-CN") ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("zh")) ||
    null
  );
}

// Voices may load asynchronously; resolve once at least one is available.
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
    const text = seg.map(({ token }) => token.char).join("");

    // At rate=1.0, zh-CN TTS is roughly 4 chars/sec → 250ms/char.
    const msPerChar = 250 / rate;

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = rate;
    const voice = pickChineseVoice();
    if (voice) u.voice = voice;

    let charIdx = 0;

    function advanceHighlight() {
      if (cancelled || charIdx >= seg.length) return;
      const { token, globalIdx } = seg[charIdx];
      onTokenStart && onTokenStart(globalIdx, token);
      charIdx++;
      if (charIdx < seg.length) {
        highlightTimer = setTimeout(advanceHighlight, msPerChar);
      }
    }

    u.onstart = () => {
      if (cancelled) return;
      charIdx = 0;
      advanceHighlight();
    };

    u.onend = () => {
      clearHighlightTimer();
      if (cancelled) return;
      segIndex++;
      speakSegment();
    };

    u.onerror = () => {
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
      // Resume from where we paused. If finished, restart.
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
