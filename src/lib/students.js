// Student profiles, per-student progress, streak tracking, and gamification.
// All dates are in Singapore time (Asia/Singapore, UTC+8).

import { pushStudent, deleteStudentCloud, pushSession } from './cloud.js';

const STUDENTS_KEY = "cr-students";
const PROGRESS_PREFIX = "cr-progress-";
const ACTIVE_KEY = "cr-active-student";

export const AVATAR_COLORS = [
  "#e8590c", "#2f9e44", "#1971c2", "#ae3ec9",
  "#f59f00", "#d63939", "#0ca678", "#9c36b5",
];

// Always compute today's date in Singapore time regardless of device timezone.
export function todayIso() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Singapore" });
}

// ---- Student CRUD ----

export function getStudents() {
  try { return JSON.parse(localStorage.getItem(STUDENTS_KEY) || "[]"); }
  catch { return []; }
}

export function createStudent(name, level) {
  const students = getStudents();
  const color = AVATAR_COLORS[students.length % AVATAR_COLORS.length];
  const student = { id: `stu-${Date.now()}`, name: name.trim(), level, color, createdAt: Date.now() };
  students.push(student);
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
  pushStudent(student);
  return student;
}

export function deleteStudent(id) {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(getStudents().filter(s => s.id !== id)));
  localStorage.removeItem(PROGRESS_PREFIX + id);
  if (getActiveStudentId() === id) localStorage.removeItem(ACTIVE_KEY);
  deleteStudentCloud(id);
}

// ---- Active student ----

export function getActiveStudentId() {
  return localStorage.getItem(ACTIVE_KEY) || null;
}

export function setActiveStudentId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function getActiveStudent() {
  const id = getActiveStudentId();
  return id ? (getStudents().find(s => s.id === id) || null) : null;
}

// ---- Progress ----

// Returns total points counting only the best-scoring session per story per day.
// Excludes tingxie sessions — those are counted separately by computeTingxiePoints.
function computeTotalPoints(sessions) {
  const best = {};
  for (const s of sessions) {
    if (!s.passed || s.storyType === 'tingxie') continue;
    const key = `${s.date}|${s.storyId}`;
    best[key] = Math.max(best[key] || 0, s.pointsEarned || 0);
  }
  return Object.values(best).reduce((sum, v) => sum + v, 0);
}

export function computeTingxiePoints(sessions) {
  const best = {};
  for (const s of sessions) {
    if (!s.passed || s.storyType !== 'tingxie') continue;
    const key = `${s.date}|${s.storyId}`;
    best[key] = Math.max(best[key] || 0, s.pointsEarned || 0);
  }
  return Object.values(best).reduce((sum, v) => sum + v, 0);
}

export function getProgress(studentId) {
  try {
    const p = JSON.parse(
      localStorage.getItem(PROGRESS_PREFIX + studentId) ||
      '{"totalPoints":0,"sessions":[]}'
    );
    if (!p.bestScores) p.bestScores = {};
    return p;
  } catch {
    return { totalPoints: 0, sessions: [], bestScores: {} };
  }
}

function saveProgress(studentId, progress) {
  localStorage.setItem(PROGRESS_PREFIX + studentId, JSON.stringify(progress));
}

export function addTingxieSession(studentId, examId, { passed, score, pointsEarned, date, mode, masteredWordCount, scheduleCompleted }) {
  const progress = getProgress(studentId);
  const session = {
    storyId: `tingxie-${examId}`,
    storyType: 'tingxie',
    mode: mode || 'practice',
    passed: !!passed,
    score: score || 0,
    pointsEarned: pointsEarned || 0,
    date: date || todayIso(),
  };
  progress.sessions.unshift(session);
  progress.totalPoints = computeTotalPoints(progress.sessions);
  // masteredWordCount: take the highest observed across sessions (conservative cross-exam estimate)
  if (masteredWordCount !== undefined) {
    progress.masteredWordCount = Math.max(progress.masteredWordCount || 0, masteredWordCount);
  }
  // completedSchedules: track by exam ID to avoid double-counting retakes
  if (scheduleCompleted) {
    if (!progress.completedExamIds) progress.completedExamIds = [];
    if (!progress.completedExamIds.includes(examId)) {
      progress.completedExamIds.push(examId);
      progress.completedSchedules = progress.completedExamIds.length;
    }
  }
  saveProgress(studentId, progress);
}

export function addSession(studentId, session) {
  const progress = getProgress(studentId);

  // Personal best detection (only for passed sessions)
  const prevBest = progress.bestScores[session.storyId] || 0;
  const isPersonalBest = !!session.passed && session.score > prevBest;
  if (isPersonalBest) {
    progress.bestScores[session.storyId] = session.score;
  }

  progress.sessions.unshift({ ...session, isPersonalBest });
  progress.totalPoints = computeTotalPoints(progress.sessions);
  saveProgress(studentId, progress);
  pushSession({ ...session, isPersonalBest }, studentId);
  return { isPersonalBest, previousBest: prevBest };
}

// Consecutive days (up to and including today) where student passed ≥1 session.
export function getStudentStreak(studentId) {
  const sessions = getProgress(studentId).sessions;
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const iso = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Singapore" });
    if (sessions.some(s => s.date === iso && s.passed)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

export function hasCompletedToday(studentId) {
  const today = todayIso();
  return getProgress(studentId).sessions.some(s => s.date === today && s.passed);
}

export function getTodayAttempts(studentId, storyId) {
  const today = todayIso();
  return getProgress(studentId).sessions.filter(s => s.date === today && s.storyId === storyId);
}

export function hasPassedStoryBefore(studentId, storyId) {
  const today = todayIso();
  return getProgress(studentId).sessions.some(s => s.storyId === storyId && s.passed && s.date !== today);
}

// Returns a Set of storyIds the student has ever passed (any day).
export function getPassedStoryIds(studentId) {
  const sessions = getProgress(studentId).sessions;
  return new Set(sessions.filter(s => s.passed).map(s => s.storyId));
}

// ---- Dashboard analytics ----

// Best (longest) streak ever achieved.
export function getBestStreak(studentId) {
  const sessions = getProgress(studentId).sessions;
  const passDates = [...new Set(sessions.filter(s => s.passed).map(s => s.date))].sort();
  if (!passDates.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < passDates.length; i++) {
    const diff = (new Date(passDates[i]) - new Date(passDates[i - 1])) / 86400000;
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

// Per-day summary for the last N days (default 30), in SG time.
export function getActivityDays(studentId, n = 30) {
  const sessions = getProgress(studentId).sessions;
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const iso = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Singapore" });
    const isToday = i === 0;
    const daySess = sessions.filter(s => s.date === iso);
    const passed = daySess.some(s => s.passed);
    const attempted = daySess.length > 0;
    const bestScore = daySess.filter(s => s.passed).reduce((m, s) => Math.max(m, s.score), 0);
    days.push({ iso, isToday, passed, attempted, bestScore });
  }
  return days;
}

// ---- Transcript scoring (LCS-based) ----

// Returns { accuracy, coverage, overall } instead of a bare number.
// accuracy  = F1 of LCS match (how correct the characters were)
// coverage  = recall  — what fraction of the story was spoken
// overall   = weighted score used for pass/fail (60% accuracy + 40% coverage)
export function scoreTranscript(storyTokens, transcript) {
  const storyText = storyTokens.filter(t => t.pinyin).map(t => t.char).join("");
  const spoken = (transcript || "").replace(/[^\u4e00-\u9fff]/g, "");
  if (!spoken || !storyText.length) return { accuracy: 0, coverage: 0, overall: 0 };
  const m = storyText.length, n = spoken.length;
  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      curr[j] = storyText[i - 1] === spoken[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  const lcs = prev[n];
  const coverageRaw = lcs / m;
  const precision = lcs / n;
  const f1 = coverageRaw + precision > 0 ? 2 * coverageRaw * precision / (coverageRaw + precision) : 0;
  const accuracy = Math.round(f1 * 100);
  const coverage = Math.round(coverageRaw * 100);
  const overall = Math.round(accuracy * 0.6 + coverage * 0.4);
  return { accuracy, coverage, overall };
}

// Compute a fluency score (0-100) from speech recognition quality signals.
// avgConfidence: mean SpeechRecognition confidence (0-1, 0 = unavailable)
// timingGaps:    ms between consecutive recognition results (pacing proxy)
export function computeFluency({ avgConfidence, timingGaps, durationMs, storyLength }) {
  let score = 50; // baseline when no signal available

  const hasConfidence = avgConfidence > 0;
  const hasTiming = timingGaps && timingGaps.length >= 2;

  if (hasConfidence && hasTiming) {
    // Both signals available: each contributes 0–50, together 0–100
    const confidenceScore = avgConfidence * 50;
    const mean = timingGaps.reduce((a, b) => a + b, 0) / timingGaps.length;
    const variance = timingGaps.reduce((a, b) => a + (b - mean) ** 2, 0) / timingGaps.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const timingScore = Math.max(0, 1 - cv) * 50;
    score = confidenceScore + timingScore;
  } else if (hasConfidence) {
    // Confidence only (common on mobile) — map to full 0–100 range
    score = avgConfidence * 100;
  } else if (hasTiming) {
    // Timing only — map to full 0–100 range
    const mean = timingGaps.reduce((a, b) => a + b, 0) / timingGaps.length;
    const variance = timingGaps.reduce((a, b) => a + (b - mean) ** 2, 0) / timingGaps.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    score = Math.max(0, 1 - cv) * 100;
  }
  // else: no signals — score stays at 50 baseline

  // Pace check: if reading was very fast (< 1s per 5 chars) it may be rushed
  if (durationMs > 0 && storyLength > 0) {
    const msPer5Chars = (durationMs / storyLength) * 5;
    if (msPer5Chars < 600) score *= 0.85; // slight penalty for rushing
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

// ---- Points calculation ----

export function calculatePoints({ score, isRepeat, wasFailedBefore, streakDays }) {
  if (score < 60) return { total: 0, breakdown: [] };
  const breakdown = [];
  let total = 100;
  breakdown.push({ label: "完成阅读 Story completed", pts: 100 });
  if (score >= 90) { breakdown.push({ label: "优秀 Excellent (90+) ⭐", pts: 40 }); total += 40; }
  else if (score >= 80) { breakdown.push({ label: "很好 Great (80+)", pts: 20 }); total += 20; }
  else if (score >= 70) { breakdown.push({ label: "良好 Good (70+)", pts: 10 }); total += 10; }
  if (wasFailedBefore) { breakdown.push({ label: "坚持不懈 Perseverance! 💪", pts: 25 }); total += 25; }
  if (isRepeat) { breakdown.push({ label: "重复练习 Repeat practice 🔄", pts: 15 }); total += 15; }
  if (streakDays > 0) {
    const bonus = Math.min(50, streakDays * 5);
    breakdown.push({ label: `🔥 ${streakDays}-day streak bonus`, pts: bonus });
    total += bonus;
  }
  return { total, breakdown };
}
