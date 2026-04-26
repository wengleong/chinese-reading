// Student profiles, per-student progress, streak tracking, and gamification.
// All dates are in Singapore time (Asia/Singapore, UTC+8).

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
  return student;
}

export function deleteStudent(id) {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(getStudents().filter(s => s.id !== id)));
  localStorage.removeItem(PROGRESS_PREFIX + id);
  if (getActiveStudentId() === id) localStorage.removeItem(ACTIVE_KEY);
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

export function getProgress(studentId) {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_PREFIX + studentId) || '{"totalPoints":0,"sessions":[]}');
  } catch { return { totalPoints: 0, sessions: [] }; }
}

function saveProgress(studentId, progress) {
  localStorage.setItem(PROGRESS_PREFIX + studentId, JSON.stringify(progress));
}

export function addSession(studentId, session) {
  const progress = getProgress(studentId);
  progress.sessions.unshift(session);
  progress.totalPoints = (progress.totalPoints || 0) + (session.pointsEarned || 0);
  saveProgress(studentId, progress);
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

// ---- Transcript scoring (LCS-based F1) ----

export function scoreTranscript(storyTokens, transcript) {
  const storyText = storyTokens.filter(t => t.pinyin).map(t => t.char).join("");
  const spoken = (transcript || "").replace(/[^\u4e00-\u9fff]/g, "");
  if (!spoken || !storyText.length) return 0;
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
  const coverage = lcs / m;
  const precision = lcs / n;
  const f1 = coverage + precision > 0 ? 2 * coverage * precision / (coverage + precision) : 0;
  return Math.round(f1 * 100);
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
