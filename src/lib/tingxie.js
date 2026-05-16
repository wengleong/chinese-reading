// src/lib/tingxie.js
import { getToken } from './api.js';

const BASE = '/api/tingxie';

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

// ---- API client ----

export async function listExams(studentId) {
  const res = await fetch(`${BASE}/exams?studentId=${encodeURIComponent(studentId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to load exams');
  return res.json();
}

export async function createExam({ studentId, title, examDate, words }) {
  const res = await fetch(`${BASE}/exams`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ studentId, title, examDate, words }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to create exam');
  return res.json();
}

export async function updateExam(examId, patch) {
  const res = await fetch(`${BASE}/exams/${examId}`, {
    method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to update exam');
  return res.json();
}

export async function deleteExam(examId) {
  const res = await fetch(`${BASE}/exams/${examId}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete exam');
  return res.json();
}

export async function listSessions(examId) {
  const res = await fetch(`${BASE}/sessions?examId=${encodeURIComponent(examId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to load sessions');
  return res.json();
}

export async function saveSession({ examId, studentId, date, mode, results, score }) {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ examId, studentId, date, mode, results, score }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to save session');
  return res.json();
}

export async function extractPaper(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/extract`, {
    method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
  });
  return res.json();
}

export async function gradeCharacter({ studentId, hanzi, imageB64 }) {
  const res = await fetch(`${BASE}/grade`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ studentId, hanzi, imageB64 }),
  });
  if (!res.ok) throw new Error('Grading failed');
  return res.json();
}

export async function gradeBatch(studentId, items) {
  const res = await fetch(`${BASE}/grade-batch`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ studentId, items }),
  });
  if (!res.ok) throw new Error('Batch grading failed');
  return res.json();
}

// ---- Schedule logic (mirrors backend, for display) ----

export function todaySG() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' });
}

export function buildClientSchedule(examDateStr) {
  const todayStr = todaySG();
  const today = new Date(todayStr + 'T00:00:00');
  const exam  = new Date(examDateStr + 'T00:00:00');
  const diffDays = Math.round((exam - today) / 86400000);

  if (diffDays <= 0) return [];
  if (diffDays === 1) return [{ date: todayStr, mode: 'practice' }];

  const schedule = [];
  for (let i = 0; i < diffDays - 1; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    schedule.push({ date: d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' }), mode: 'practice' });
  }
  const dayBefore = new Date(exam);
  dayBefore.setDate(dayBefore.getDate() - 1);
  schedule.push({ date: dayBefore.toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' }), mode: 'mock' });
  return schedule;
}

export function daysUntil(dateStr) {
  const today = new Date(todaySG() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

// ---- Word selection (spaced repetition) ----
// Mastery counted per SESSION (not per result row within a session).
// A session contributes 1 correct-session-count per word if ANY result for that word is correct.
export function computeWordQueue(words, sessions) {
  const sessionCorrectCount = {};
  const lastSessionWrong = new Set();

  if (sessions.length > 0) {
    const last = sessions[sessions.length - 1];
    for (const r of (last.results || [])) {
      if (!r.correct) lastSessionWrong.add(r.hanzi);
    }
  }

  for (const sess of sessions) {
    const correctInThisSession = new Set();
    for (const r of (sess.results || [])) {
      if (r.correct) correctInThisSession.add(r.hanzi);
    }
    for (const hanzi of correctInThisSession) {
      sessionCorrectCount[hanzi] = (sessionCorrectCount[hanzi] || 0) + 1;
    }
  }

  const queue = [];
  for (const word of words) {
    const reps = lastSessionWrong.has(word.hanzi) ? 3
      : (sessionCorrectCount[word.hanzi] || 0) >= 3 ? 1
      : 2;
    for (let i = 0; i < reps; i++) queue.push({ ...word });
  }

  // Fisher-Yates shuffle
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

export function getWeakWords(words, sessions) {
  const wrongCount = {};
  for (const sess of sessions) {
    for (const r of (sess.results || [])) {
      if (!r.correct) wrongCount[r.hanzi] = (wrongCount[r.hanzi] || 0) + 1;
    }
  }
  return words
    .filter(w => wrongCount[w.hanzi])
    .sort((a, b) => (wrongCount[b.hanzi] || 0) - (wrongCount[a.hanzi] || 0))
    .map(w => ({ ...w, wrongCount: wrongCount[w.hanzi] || 0 }));
}

// Count mastered words (correct in 3+ distinct sessions) across all words in all sessions
export function countMasteredWords(allSessionsAcrossExams) {
  const sessionCorrectCount = {};
  for (const sess of allSessionsAcrossExams) {
    const correctInThisSession = new Set();
    for (const r of (sess.results || [])) {
      if (r.correct) correctInThisSession.add(r.hanzi);
    }
    for (const hanzi of correctInThisSession) {
      sessionCorrectCount[hanzi] = (sessionCorrectCount[hanzi] || 0) + 1;
    }
  }
  return Object.values(sessionCorrectCount).filter(c => c >= 3).length;
}

// Canvas: 240x240 display, export at 80x80 PNG
export function canvasToBase64(canvas) {
  const off = document.createElement('canvas');
  off.width = 80; off.height = 80;
  off.getContext('2d').drawImage(canvas, 0, 0, 80, 80);
  return off.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}
