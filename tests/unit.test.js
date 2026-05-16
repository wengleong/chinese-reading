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
    if (!s.passed) continue;
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
