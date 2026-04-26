// Sentence-level Chinese TTS engine with per-character highlight timing.
//
// Tokens are grouped into sentence segments (breaking at 。！？) and each
// segment is spoken as a single utterance for natural, flowing speech.
// Per-character highlighting is driven by a timer using an estimated pace,
// since SpeechSynthesisUtterance.onboundary is unreliable for zh-CN.
// onstart is also unreliable on Safari — we use a 300ms fallback timer.

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
    // Exotic chars (curly quotes ""'' 《》—…) are stripped to avoid TTS reading
    // them as symbol names. Standard punctuation (，。！？：；) creates natural pauses.
    const KEEP = /[\u4e00-\u9fff。，！？：；]/;
    const text = seg.map(({ token }) => KEEP.test(token.char) ? token.char : "").join("");

    // At rate=1.0, zh-CN TTS is roughly 4 chars/sec → 250ms/char.
    const msPerChar = 250 / rate;

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = rate;
    const voice = pickChineseVoice();
    if (voice) u.voice = voice;

    let charIdx = 0;
    let onStartFired = false;
    let startFallback = null;

    function advanceHighlight() {
      if (cancelled || charIdx >= seg.length) return;
      const { token, globalIdx } = seg[charIdx];
      onTokenStart && onTokenStart(globalIdx, token);
      charIdx++;
      if (charIdx < seg.length) {
        // After punctuation the TTS pauses naturally — add extra delay so the
        // highlight doesn't race ahead. Commas/colons ~300ms, keep proportional to rate.
        const punctPause = !token.pinyin ? Math.round(280 / rate) : 0;
        highlightTimer = setTimeout(advanceHighlight, msPerChar + punctPause);
      }
    }

    function beginHighlight() {
      charIdx = 0;
      advanceHighlight();
    }

    u.onstart = () => {
      onStartFired = true;
      if (startFallback) {
        clearTimeout(startFallback);
        startFallback = null;
      }
      if (cancelled) return;
      beginHighlight();
    };

    // Safari and some mobile browsers don't reliably fire onstart
    startFallback = setTimeout(() => {
      if (!onStartFired && !cancelled && playing) beginHighlight();
    }, 300);

    u.onend = () => {
      if (startFallback) { clearTimeout(startFallback); startFallback = null; }
      clearHighlightTimer();
      if (cancelled) return;
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
