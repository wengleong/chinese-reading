// Daily reading progress + streak tracking via localStorage.

const KEY = "dailyProgress";
const DAILY_GOAL_SEC = 10 * 60;

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getDailyGoalSec() {
  return DAILY_GOAL_SEC;
}

export function getTodaySeconds() {
  const state = load();
  return state[todayIso()] || 0;
}

export function addSeconds(n) {
  const state = load();
  const t = todayIso();
  state[t] = (state[t] || 0) + n;
  save(state);
  return state[t];
}

// Streak = number of consecutive days up to today (inclusive) that hit goal.
export function getStreak() {
  const state = load();
  let streak = 0;
  const d = new Date();
  while (true) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    if ((state[key] || 0) >= DAILY_GOAL_SEC) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
