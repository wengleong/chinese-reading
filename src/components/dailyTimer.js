import {
  getTodaySeconds,
  addSeconds,
  getStreak,
  getDailyGoalSec,
} from "../lib/progress.js";

export function renderDailyTimer({ root }) {
  let active = false;
  let lastTick = 0;

  const ring = document.createElement("div");
  ring.className = "timer-ring";
  const ringText = document.createElement("span");
  ring.appendChild(ringText);

  const label = document.createElement("div");

  const streakBadge = document.createElement("span");
  streakBadge.className = "streak-badge";

  root.innerHTML = "";
  root.appendChild(ring);
  root.appendChild(label);
  root.appendChild(streakBadge);

  function update() {
    const goal = getDailyGoalSec();
    const today = getTodaySeconds();
    const pct = Math.min(100, (today / goal) * 100);
    const remainingSec = Math.max(0, goal - today);
    const m = Math.floor(remainingSec / 60);
    const s = remainingSec % 60;
    ring.style.setProperty("--pct", String(pct));
    ring.classList.toggle("done", today >= goal);
    ringText.textContent =
      today >= goal ? "✓" : `${m}:${String(s).padStart(2, "0")}`;
    label.textContent =
      today >= goal
        ? "今天完成了 🎉 (Done today!)"
        : `今日 Today ${Math.floor(today / 60)} / ${goal / 60} min`;
    const streak = getStreak();
    streakBadge.textContent = streak > 0 ? `🔥 ${streak} day streak` : "";
    streakBadge.style.display = streak > 0 ? "inline-block" : "none";
  }

  update();

  // Tick every second; only count time while active === true.
  setInterval(() => {
    if (!active) return;
    const now = Date.now();
    if (lastTick === 0) {
      lastTick = now;
      return;
    }
    const delta = Math.round((now - lastTick) / 1000);
    if (delta > 0) {
      addSeconds(delta);
      lastTick = now;
      update();
    }
  }, 1000);

  return {
    setActive(value) {
      active = !!value;
      lastTick = active ? Date.now() : 0;
    },
    refresh: update,
  };
}
