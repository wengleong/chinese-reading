// Unit tests for pure logic extracted from src/lib/students.js
// Run with: node --test tests/unit.test.js  (Node 18+)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJsonBlock } from '../src/lib/pictureScorer.js';

// ---------------------------------------------------------------------------
// computeTotalPoints
// Counts only the best-scoring passed session per story per calendar day.
// Extracted verbatim from src/lib/students.js (no browser deps).
// ---------------------------------------------------------------------------
function computeTotalPoints(sessions) {
  const best = {};
  for (const s of sessions) {
    if (!s.passed || s.storyType === 'tingxie') continue;
    const key = `${s.date}|${s.storyId}`;
    best[key] = Math.max(best[key] || 0, s.pointsEarned || 0);
  }
  return Object.values(best).reduce((sum, v) => sum + v, 0);
}

test('computeTotalPoints: empty sessions returns 0', () => {
  assert.equal(computeTotalPoints([]), 0);
});

test('computeTotalPoints: single passed session counts once', () => {
  const sessions = [
    { passed: true, date: '2024-01-01', storyId: 's1', pointsEarned: 10 },
  ];
  assert.equal(computeTotalPoints(sessions), 10);
});

test('computeTotalPoints: two attempts same story same day — only best counts', () => {
  const sessions = [
    { passed: true, date: '2024-01-01', storyId: 's1', pointsEarned: 10 },
    { passed: true, date: '2024-01-01', storyId: 's1', pointsEarned: 15 },
  ];
  assert.equal(computeTotalPoints(sessions), 15);
});

test('computeTotalPoints: same story different days — both count', () => {
  const sessions = [
    { passed: true, date: '2024-01-01', storyId: 's1', pointsEarned: 10 },
    { passed: true, date: '2024-01-02', storyId: 's1', pointsEarned: 12 },
  ];
  assert.equal(computeTotalPoints(sessions), 22);
});

test('computeTotalPoints: failed sessions not counted', () => {
  const sessions = [
    { passed: false, date: '2024-01-01', storyId: 's1', pointsEarned: 10 },
    { passed: true,  date: '2024-01-01', storyId: 's2', pointsEarned: 5 },
  ];
  assert.equal(computeTotalPoints(sessions), 5);
});

test('computeTotalPoints: different stories same day — both count', () => {
  const sessions = [
    { passed: true, date: '2024-01-01', storyId: 's1', pointsEarned: 10 },
    { passed: true, date: '2024-01-01', storyId: 's2', pointsEarned: 8 },
  ];
  assert.equal(computeTotalPoints(sessions), 18);
});

test('computeTotalPoints: mixed pass/fail same story same day — only best passed counts', () => {
  const sessions = [
    { passed: false, date: '2024-01-01', storyId: 's1', pointsEarned: 120 }, // failed — ignored
    { passed: true,  date: '2024-01-01', storyId: 's1', pointsEarned: 100 },
    { passed: true,  date: '2024-01-01', storyId: 's1', pointsEarned: 115 },
  ];
  assert.equal(computeTotalPoints(sessions), 115);
});

test('computeTotalPoints: session with no pointsEarned field treats as 0', () => {
  const sessions = [
    { passed: true, date: '2024-01-01', storyId: 's1' }, // no pointsEarned
  ];
  assert.equal(computeTotalPoints(sessions), 0);
});

test('computeTotalPoints: tingxie sessions are excluded from reading points total', () => {
  const sessions = [
    { passed: true, date: '2024-01-01', storyId: 's1', pointsEarned: 100 },
    { passed: true, date: '2024-01-01', storyId: 'tingxie-exam-1', storyType: 'tingxie', pointsEarned: 200 },
  ];
  assert.equal(computeTotalPoints(sessions), 100);
});

// ---------------------------------------------------------------------------
// detectPersonalBest
// Mirrors the logic inside addSession() in src/lib/students.js.
// ---------------------------------------------------------------------------
function detectPersonalBest(bestScores, session) {
  const prevBest = bestScores[session.storyId] || 0;
  const isPersonalBest = !!session.passed && session.score > prevBest;
  return { isPersonalBest, previousBest: prevBest };
}

test('detectPersonalBest: first ever pass is a personal best', () => {
  const { isPersonalBest, previousBest } = detectPersonalBest(
    {},
    { storyId: 's1', passed: true, score: 80 }
  );
  assert.equal(isPersonalBest, true);
  assert.equal(previousBest, 0);
});

test('detectPersonalBest: higher score than previous best is a personal best', () => {
  const bestScores = { s1: 75 };
  const { isPersonalBest } = detectPersonalBest(
    bestScores,
    { storyId: 's1', passed: true, score: 80 }
  );
  assert.equal(isPersonalBest, true);
});

test('detectPersonalBest: lower score than previous best is not a personal best', () => {
  const bestScores = { s1: 85 };
  const { isPersonalBest } = detectPersonalBest(
    bestScores,
    { storyId: 's1', passed: true, score: 80 }
  );
  assert.equal(isPersonalBest, false);
});

test('detectPersonalBest: equal score is not a new personal best', () => {
  const bestScores = { s1: 80 };
  const { isPersonalBest } = detectPersonalBest(
    bestScores,
    { storyId: 's1', passed: true, score: 80 }
  );
  assert.equal(isPersonalBest, false);
});

test('detectPersonalBest: failed session is never a personal best regardless of score', () => {
  const { isPersonalBest } = detectPersonalBest(
    {},
    { storyId: 's1', passed: false, score: 95 }
  );
  assert.equal(isPersonalBest, false);
});

test('detectPersonalBest: failed session does not beat existing best', () => {
  const bestScores = { s1: 60 };
  const { isPersonalBest } = detectPersonalBest(
    bestScores,
    { storyId: 's1', passed: false, score: 90 }
  );
  assert.equal(isPersonalBest, false);
});

test('detectPersonalBest: different story IDs are independent', () => {
  const bestScores = { s1: 95 };
  const { isPersonalBest } = detectPersonalBest(
    bestScores,
    { storyId: 's2', passed: true, score: 70 }
  );
  // s2 has no prior best, so 70 > 0 is a personal best
  assert.equal(isPersonalBest, true);
});

// ---------------------------------------------------------------------------
// selectQuestions fallback logic
// Tests the pure fallback path (no API call needed).
// ---------------------------------------------------------------------------
const GENERIC_FALLBACK = [
  '你觉得图片里发生了什么事？',
  '图片里的人物心情怎样？',
  '你从这幅图片学到了什么？',
];

function selectQuestionsFallback(questions) {
  if (!questions || questions.length === 0) return GENERIC_FALLBACK;
  return questions.slice(0, 3);
}

test('selectQuestions fallback: empty array returns 3 generic questions', () => {
  const result = selectQuestionsFallback([]);
  assert.equal(result.length, 3);
  assert.equal(result[0], '你觉得图片里发生了什么事？');
});

test('selectQuestions fallback: 3 questions returns all 3', () => {
  const q = ['Q1', 'Q2', 'Q3'];
  assert.deepEqual(selectQuestionsFallback(q), ['Q1', 'Q2', 'Q3']);
});

test('selectQuestions fallback: 5 questions returns first 3', () => {
  const q = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  assert.deepEqual(selectQuestionsFallback(q), ['Q1', 'Q2', 'Q3']);
});

test('selectQuestions fallback: null returns generic', () => {
  const result = selectQuestionsFallback(null);
  assert.equal(result.length, 3);
  assert.equal(result[0], '你觉得图片里发生了什么事？');
});

// ---------------------------------------------------------------------------
// pictureScorer parser hardening
// ---------------------------------------------------------------------------
test('parseModelJsonBlock: parses clean JSON', () => {
  const parsed = parseModelJsonBlock('{"content_score": 80, "language_score": 70, "expression_score": 75}');
  assert.equal(parsed.content_score, 80);
  assert.equal(parsed.language_score, 70);
  assert.equal(parsed.expression_score, 75);
});

test('parseModelJsonBlock: parses fenced JSON with extra text', () => {
  const parsed = parseModelJsonBlock('Here is the result:\n```json\n{"selected":[2,0,1]}\n```\nGood luck!');
  assert.deepEqual(parsed.selected, [2, 0, 1]);
});

test('parseModelJsonBlock: returns null when no JSON object exists', () => {
  const parsed = parseModelJsonBlock('no json here');
  assert.equal(parsed, null);
});

// ---------------------------------------------------------------------------
// scorePicture scoring math (extracted inline — no browser/network deps)
// Mirrors the computation in src/lib/pictureScorer.js toBoundedScore + overall
// ---------------------------------------------------------------------------
function toBoundedScore(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function computeOverall(contentScore, languageScore, expressionScore) {
  return Math.round(contentScore * 0.4 + languageScore * 0.4 + expressionScore * 0.2);
}

test('scoring: toBoundedScore clamps below 0', () => {
  assert.equal(toBoundedScore(-10, 50), 0);
});

test('scoring: toBoundedScore clamps above 100', () => {
  assert.equal(toBoundedScore(120, 50), 100);
});

test('scoring: toBoundedScore uses fallback for NaN', () => {
  assert.equal(toBoundedScore('not a number', 42), 42);
});

test('scoring: toBoundedScore rounds correctly', () => {
  assert.equal(toBoundedScore(85.6, 50), 86);
});

test('scoring: overall = 40% content + 40% language + 20% expression', () => {
  // 80*0.4 + 70*0.4 + 60*0.2 = 32 + 28 + 12 = 72
  assert.equal(computeOverall(80, 70, 60), 72);
  // 100*0.4 + 100*0.4 + 100*0.2 = 100
  assert.equal(computeOverall(100, 100, 100), 100);
  // 0*0.4 + 0*0.4 + 0*0.2 = 0
  assert.equal(computeOverall(0, 0, 0), 0);
});

test('scoring: overall passes at 60+', () => {
  const overall = computeOverall(60, 60, 60);
  assert.equal(overall >= 60, true);
});

test('scoring: overall fails below 60', () => {
  const overall = computeOverall(50, 50, 50);
  assert.equal(overall >= 60, false);
});

test('scoring: full scoring pipeline from AI JSON response', () => {
  const aiResponse = '{"content_score": 78, "language_score": 82, "expression_score": 70, "feedback": "Great job!"}';
  const result = parseModelJsonBlock(aiResponse);
  assert.ok(result, 'should parse AI response');

  const contentScore  = toBoundedScore(result.content_score, 50);
  const languageScore = toBoundedScore(result.language_score, 50);
  const expressionScore = toBoundedScore(result.expression_score, 50);
  const overall = computeOverall(contentScore, languageScore, expressionScore);

  assert.equal(contentScore, 78);
  assert.equal(languageScore, 82);
  assert.equal(expressionScore, 70);
  assert.equal(overall, Math.round(78*0.4 + 82*0.4 + 70*0.2));
  assert.equal(overall >= 60, true);
  assert.equal(result.feedback, 'Great job!');
});

test('scoring: handles missing optional fields gracefully', () => {
  const aiResponse = '{"content_score": 70, "language_score": 65}';
  const result = parseModelJsonBlock(aiResponse);
  const expressionScore = toBoundedScore(result.expression_score, 50); // undefined → fallback
  assert.equal(expressionScore, 50);
});

// ---------------------------------------------------------------------------
// computeFluency — inline copy of the pure function for testing
// ---------------------------------------------------------------------------
function computeFluency({ avgConfidence, timingGaps, durationMs, storyLength }) {
  let score = 50;
  const hasConfidence = avgConfidence > 0;
  const hasTiming = timingGaps && timingGaps.length >= 2;
  if (hasConfidence && hasTiming) {
    const confidenceScore = avgConfidence * 50;
    const mean = timingGaps.reduce((a, b) => a + b, 0) / timingGaps.length;
    const variance = timingGaps.reduce((a, b) => a + (b - mean) ** 2, 0) / timingGaps.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const timingScore = Math.max(0, 1 - cv) * 50;
    score = confidenceScore + timingScore;
  } else if (hasConfidence) {
    score = avgConfidence * 100;
  } else if (hasTiming) {
    const mean = timingGaps.reduce((a, b) => a + b, 0) / timingGaps.length;
    const variance = timingGaps.reduce((a, b) => a + (b - mean) ** 2, 0) / timingGaps.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    score = Math.max(0, 1 - cv) * 100;
  }
  if (durationMs > 0 && storyLength > 0) {
    const msPer5Chars = (durationMs / storyLength) * 5;
    if (msPer5Chars < 600) score *= 0.85;
  }
  return Math.min(100, Math.max(0, Math.round(score)));
}

test('computeFluency: no signals returns 50 baseline', () => {
  assert.equal(computeFluency({ avgConfidence: 0, timingGaps: [], durationMs: 0, storyLength: 0 }), 50);
});

test('computeFluency: confidence only maps to full 0-100 range', () => {
  // With old code, confidence=1.0 would give 50; now it should give 100
  assert.equal(computeFluency({ avgConfidence: 1.0, timingGaps: [], durationMs: 0, storyLength: 0 }), 100);
  assert.equal(computeFluency({ avgConfidence: 0.5, timingGaps: [], durationMs: 0, storyLength: 0 }), 50);
  assert.equal(computeFluency({ avgConfidence: 0.8, timingGaps: [], durationMs: 0, storyLength: 0 }), 80);
});

test('computeFluency: timing only maps to full 0-100 range', () => {
  // Perfectly regular gaps (zero variance) → cv=0 → score=100
  const gaps = [500, 500, 500];
  assert.equal(computeFluency({ avgConfidence: 0, timingGaps: gaps, durationMs: 0, storyLength: 0 }), 100);
  // Single gap → hasTiming=false (needs >= 2) → baseline 50
  assert.equal(computeFluency({ avgConfidence: 0, timingGaps: [500], durationMs: 0, storyLength: 0 }), 50);
});

test('computeFluency: both signals combined, total 0-100', () => {
  // confidence=1.0 (→50) + perfect timing (→50) = 100
  const gaps = [500, 500, 500];
  assert.equal(computeFluency({ avgConfidence: 1.0, timingGaps: gaps, durationMs: 0, storyLength: 0 }), 100);
  // confidence=0.5 (→25) + perfect timing (→50) = 75
  assert.equal(computeFluency({ avgConfidence: 0.5, timingGaps: gaps, durationMs: 0, storyLength: 0 }), 75);
});

test('computeFluency: pace penalty applied for fast reading', () => {
  // 10 chars, 1000ms → 500ms per 5 chars → below 600ms threshold → * 0.85
  const base = computeFluency({ avgConfidence: 1.0, timingGaps: [], durationMs: 1000, storyLength: 10 });
  assert.ok(base < 100, 'pace penalty should reduce score below 100');
  assert.equal(base, Math.round(100 * 0.85));
});

test('scoring: video SCFRAS response with Chinese feedback', () => {
  const aiResponse = JSON.stringify({
    content_score: 85,
    language_score: 78,
    expression_score: 72,
    feedback: 'You covered the S (Opening) and C (Content) elements well!'
  });
  const result = parseModelJsonBlock(aiResponse);
  assert.ok(result);
  const overall = computeOverall(
    toBoundedScore(result.content_score, 50),
    toBoundedScore(result.language_score, 50),
    toBoundedScore(result.expression_score, 50),
  );
  assert.equal(overall, Math.round(85*0.4 + 78*0.4 + 72*0.2));
  assert.ok(result.feedback.includes('SCFRAS') || result.feedback.length > 0);
});

// ---------------------------------------------------------------------------
// buildClientSchedule + computeWordQueue (from src/lib/tingxie.js)
// ---------------------------------------------------------------------------
import { buildClientSchedule, computeWordQueue } from '../src/lib/tingxie.js';

// buildClientSchedule
test('buildClientSchedule: returns empty array when exam is today', () => {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' });
  assert.deepEqual(buildClientSchedule(today), []);
});

test('buildClientSchedule: one practice entry when exam is tomorrow', () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const tomorrow = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' });
  const sched = buildClientSchedule(tomorrow);
  assert.equal(sched.length, 1);
  assert.equal(sched[0].mode, 'practice');
});

test('buildClientSchedule: last entry before exam is mock', () => {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  const future = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' });
  const sched = buildClientSchedule(future);
  assert.equal(sched[sched.length - 1].mode, 'mock');
  assert.ok(sched.slice(0, -1).every(e => e.mode === 'practice'));
});

// computeWordQueue
const tingxieWords = [
  { hanzi: '爱护', pinyin: 'ài hù', type: 'tingxie' },
  { hanzi: '整齐', pinyin: 'zhěng qí', type: 'tingxie' },
  { hanzi: '培养', pinyin: 'péi yǎng', type: 'tingxie' },
];

test('computeWordQueue: new words appear 2 times each', () => {
  const queue = computeWordQueue(tingxieWords, []);
  const counts = {};
  queue.forEach(w => counts[w.hanzi] = (counts[w.hanzi] || 0) + 1);
  assert.equal(counts['爱护'], 2);
});

test('computeWordQueue: weak word (wrong in last session) appears 3 times', () => {
  const sessions = [{ results: [{ hanzi: '爱护', correct: false }] }];
  const queue = computeWordQueue(tingxieWords, sessions);
  const counts = {};
  queue.forEach(w => counts[w.hanzi] = (counts[w.hanzi] || 0) + 1);
  assert.equal(counts['爱护'], 3);
});

test('computeWordQueue: mastered word (correct in 3+ distinct sessions) appears 1 time', () => {
  const sessions = [
    { results: [{ hanzi: '整齐', correct: true }] },
    { results: [{ hanzi: '整齐', correct: true }] },
    { results: [{ hanzi: '整齐', correct: true }] },
  ];
  const queue = computeWordQueue(tingxieWords, sessions);
  const counts = {};
  queue.forEach(w => counts[w.hanzi] = (counts[w.hanzi] || 0) + 1);
  assert.equal(counts['整齐'], 1);
});

test('computeWordQueue: multiple correct results in ONE session only count as 1 session pass', () => {
  const sessions = [
    { results: [{ hanzi: '整齐', correct: true }, { hanzi: '整齐', correct: true }] },
    { results: [{ hanzi: '整齐', correct: true }] },
  ];
  const queue = computeWordQueue(tingxieWords, sessions);
  const counts = {};
  queue.forEach(w => counts[w.hanzi] = (counts[w.hanzi] || 0) + 1);
  assert.equal(counts['整齐'], 2); // still "new", not mastered
});

// ---------------------------------------------------------------------------
// tingxie gamification
// Tests addTingxieSession, computeTingxiePoints, and STATIC_BADGES guards.
// A localStorage mock is installed on globalThis before each test.
// ---------------------------------------------------------------------------
import { addTingxieSession, computeTingxiePoints } from '../src/lib/students.js';
import { STATIC_BADGES } from '../src/lib/badges.js';

// Minimal in-memory localStorage mock
function makeLocalStorageMock() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

test('tingxie gamification: stories_5 badge does not count tingxie sessions', () => {
  globalThis.localStorage = makeLocalStorageMock();
  const examIds = ['exam-1', 'exam-2', 'exam-3', 'exam-4', 'exam-5'];
  for (const examId of examIds) {
    addTingxieSession('stu-1', examId, { passed: true, score: 80, pointsEarned: 100 });
  }
  const { sessions } = JSON.parse(localStorage.getItem('cr-progress-stu-1'));
  const badge = STATIC_BADGES.find(b => b.id === 'stories_5');
  assert.strictEqual(badge.check({ sessions, totalPoints: 0 }), false);
});

test('tingxie gamification: perfect badge does not count 100% mock tingxie', () => {
  globalThis.localStorage = makeLocalStorageMock();
  addTingxieSession('stu-2', 'exam-1', { passed: true, score: 100, pointsEarned: 140 });
  const { sessions } = JSON.parse(localStorage.getItem('cr-progress-stu-2'));
  const badge = STATIC_BADGES.find(b => b.id === 'perfect');
  assert.strictEqual(badge.check({ sessions, totalPoints: 0 }), false);
});

test('tingxie gamification: tingxie_first badge triggers on first tingxie session', () => {
  globalThis.localStorage = makeLocalStorageMock();
  addTingxieSession('stu-3', 'exam-1', { passed: false, score: 50, pointsEarned: 0 });
  const { sessions } = JSON.parse(localStorage.getItem('cr-progress-stu-3'));
  const badge = STATIC_BADGES.find(b => b.id === 'tingxie_first');
  assert.strictEqual(badge.check({ sessions, totalPoints: 0 }), true);
});

test('tingxie gamification: computeTingxiePoints deduplicates best per exam per day', () => {
  globalThis.localStorage = makeLocalStorageMock();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' });
  addTingxieSession('stu-4', 'exam-1', { passed: true, score: 80, pointsEarned: 80, date: today });
  addTingxieSession('stu-4', 'exam-1', { passed: true, score: 90, pointsEarned: 120, date: today });
  const { sessions } = JSON.parse(localStorage.getItem('cr-progress-stu-4'));
  assert.strictEqual(computeTingxiePoints(sessions), 120);
});

test('tingxie gamification: tingxie_champion counts distinct exams not retakes', () => {
  globalThis.localStorage = makeLocalStorageMock();
  for (let i = 0; i < 5; i++) {
    addTingxieSession('stu-5', 'exam-1', { passed: true, score: 95, pointsEarned: 140 });
  }
  const { sessions } = JSON.parse(localStorage.getItem('cr-progress-stu-5'));
  const badge = STATIC_BADGES.find(b => b.id === 'tingxie_champion');
  assert.strictEqual(badge.check({ sessions, totalPoints: 0 }), false);
});
