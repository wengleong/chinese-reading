// Token-by-token Chinese TTS engine.
//
// SpeechSynthesisUtterance.onboundary is unreliable for zh-CN, so we drive
// playback one token at a time and emit a callback before each utterance so
// the UI can highlight the matching character.

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

export function createPlayer({ tokens, onTokenStart, onEnd }) {
  let index = 0;
  let playing = false;
  let rate = 0.9;
  let cancelled = false;

  // Tokens with no pinyin (punctuation) shouldn't be spoken but still get a
  // brief highlight so the reader follows the text naturally.
  function speakNext() {
    if (cancelled || !playing) return;
    if (index >= tokens.length) {
      playing = false;
      onEnd && onEnd();
      return;
    }
    const i = index;
    const token = tokens[i];
    onTokenStart && onTokenStart(i, token);

    if (!token.pinyin) {
      index = i + 1;
      // Skip silently after a tiny pause so the highlight reads as a beat.
      setTimeout(speakNext, 120);
      return;
    }

    const u = new SpeechSynthesisUtterance(token.char);
    u.lang = "zh-CN";
    u.rate = rate;
    const voice = pickChineseVoice();
    if (voice) u.voice = voice;
    u.onend = () => {
      if (cancelled) return;
      index = i + 1;
      speakNext();
    };
    u.onerror = () => {
      if (cancelled) return;
      index = i + 1;
      speakNext();
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
      if (index >= tokens.length) index = 0;
      speakNext();
    },
    pause() {
      playing = false;
      cancelled = true;
      if (synth) synth.cancel();
    },
    restart() {
      this.pause();
      index = 0;
    },
    setRate(value) {
      rate = value;
    },
    isPlaying() {
      return playing;
    },
  };
}
