// English read-aloud support: word tokenising and word-level scoring.
//
// The Chinese path scores by comparing CJK characters (see scoreTranscript in
// students.js, which strips everything outside 一-鿿 — it returns 0 for
// English). English is scored on WORDS instead: speech recognition returns
// "the boy ran" with its own punctuation and casing, so both sides are
// normalised to bare lowercase words before comparison.

// Splits a passage into renderable tokens, keeping punctuation attached to the
// word it follows so "Hello," highlights as one unit while reading aloud.
// Paragraph breaks come through as { break: true }.
export function tokenizeEnglish(text) {
  const tokens = [];
  for (const [i, line] of String(text || '').split('\n').entries()) {
    if (i > 0) tokens.push({ break: true });
    for (const raw of line.split(/\s+/)) {
      if (!raw) continue;
      tokens.push({ text: raw, word: normalizeWord(raw) });
    }
  }
  return tokens;
}

// "Don't!" -> "dont". Apostrophes are dropped entirely, not just normalised:
// recognisers are inconsistent about them ("dont" vs "don't" vs "don’t") and
// this scores reading aloud, not spelling — the child said the word either way.
export function normalizeWord(raw) {
  return String(raw)
    .toLowerCase()
    .replace(/[‘’ʼ']/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function wordsOf(text) {
  return String(text || '')
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

// Word-level LCS, mirroring the Chinese scorer's F1 + coverage shape so a
// student's English score means the same thing as their Chinese one.
export function scoreEnglishTranscript(passage, transcript) {
  const target = wordsOf(passage);
  const spoken = wordsOf(transcript);
  if (!target.length || !spoken.length) return { accuracy: 0, coverage: 0, overall: 0 };

  const m = target.length, n = spoken.length;
  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      curr[j] = target[i - 1] === spoken[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  const lcs = prev[n];
  const coverageRaw = lcs / m;
  const precision = lcs / n;
  const f1 = coverageRaw + precision > 0 ? 2 * coverageRaw * precision / (coverageRaw + precision) : 0;
  const accuracy = Math.round(f1 * 100);
  const coverage = Math.round(coverageRaw * 100);
  return { accuracy, coverage, overall: Math.round(accuracy * 0.6 + coverage * 0.4) };
}

// Plain text of an English story, for TTS and scoring.
export function passageText(story) {
  if (typeof story?.text === 'string') return story.text;
  // Generated/legacy stories may still carry tokens.
  return (story?.tokens || []).map(t => t.text ?? t.char ?? '').join(' ');
}

export function isEnglish(story) {
  return story?.lang === 'en';
}
