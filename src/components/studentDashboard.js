// Student dashboard modal — full history, activity grid, and delete.

import {
  getProgress, getStudentStreak, getBestStreak,
  getActivityDays, deleteStudent, setActiveStudentId, getActiveStudentId,
} from "../lib/students.js";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function sgTime(ts) {
  return new Date(ts).toLocaleTimeString("en-SG", {
    timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function fmtIsoDate(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

function scoreColor(score) {
  return score >= 80 ? "var(--good)" : score >= 60 ? "var(--accent)" : "var(--danger)";
}

export function openStudentDashboard({ student, onDeleted, onClose }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay dash-overlay";

  const progress = getProgress(student.id);
  const sessions = progress.sessions;
  const totalPts = (progress.totalPoints || 0).toLocaleString();
  const streak = getStudentStreak(student.id);
  const bestStreak = getBestStreak(student.id);
  const passSessions = sessions.filter(s => s.passed);
  const avgScore = passSessions.length
    ? Math.round(passSessions.reduce((s, x) => s + x.score, 0) / passSessions.length)
    : 0;
  const missedLast30 = getActivityDays(student.id, 30).filter(d => !d.isToday && !d.passed).length;

  const joinedMonth = new Date(student.createdAt);
  const joinedStr = `${MONTH_SHORT[joinedMonth.getMonth()]} ${joinedMonth.getFullYear()}`;

  overlay.innerHTML = `
    <div class="modal-card dash-card" role="dialog" aria-modal="true">
      <!-- Header -->
      <div class="dash-header">
        <div class="student-avatar dash-avatar" style="background:${student.color}">${student.name[0].toUpperCase()}</div>
        <div class="dash-header-info">
          <div class="dash-name">${student.name}</div>
          <div class="dash-sub">${student.level} · Member since ${joinedStr}</div>
        </div>
        <button class="dash-close" id="dash-close" aria-label="Close">✕</button>
      </div>

      <!-- Stats row -->
      <div class="dash-stats">
        <div class="dash-stat"><span class="dash-stat-val">🔥 ${streak}</span><span class="dash-stat-lbl">Streak</span></div>
        <div class="dash-stat"><span class="dash-stat-val">💎 ${totalPts}</span><span class="dash-stat-lbl">Points</span></div>
        <div class="dash-stat"><span class="dash-stat-val">📚 ${sessions.length}</span><span class="dash-stat-lbl">Sessions</span></div>
        <div class="dash-stat"><span class="dash-stat-val">⭐ ${avgScore}</span><span class="dash-stat-lbl">Avg score</span></div>
        <div class="dash-stat"><span class="dash-stat-val">🏆 ${bestStreak}</span><span class="dash-stat-lbl">Best streak</span></div>
        <div class="dash-stat"><span class="dash-stat-val" style="color:var(--danger)">❌ ${missedLast30}</span><span class="dash-stat-lbl">Missed (30d)</span></div>
      </div>

      <!-- Activity grid: last 30 days -->
      <div>
        <div class="dash-section-title">Last 30 Days</div>
        <div class="dash-activity-grid" id="dash-grid"></div>
        <div class="dash-legend">
          <span class="dash-legend-dot" style="background:var(--good)"></span> Passed
          <span class="dash-legend-dot" style="background:#ffb300; margin-left:8px"></span> Attempted
          <span class="dash-legend-dot" style="background:var(--danger); margin-left:8px"></span> Missed
          <span class="dash-legend-dot" style="background:var(--border); margin-left:8px"></span> No reading
        </div>
      </div>

      <!-- Reading history -->
      <div class="dash-history-wrap">
        <div class="dash-section-title">Reading History</div>
        <div class="dash-history" id="dash-history"></div>
      </div>

      <!-- Delete -->
      <div class="dash-footer">
        <button class="danger dash-delete-btn" id="dash-delete">🗑️ Delete Student</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Activity grid
  const grid = overlay.querySelector("#dash-grid");
  const activityDays = getActivityDays(student.id, 30);
  for (const day of activityDays) {
    const cell = document.createElement("div");
    cell.className = "dash-day-cell";
    const label = `${fmtIsoDate(day.iso)}${day.bestScore ? ` · ${day.bestScore}` : ""}`;
    cell.title = label;
    if (day.isToday && !day.passed) {
      cell.style.background = "var(--accent-soft)";
      cell.style.border = "2px solid var(--accent)";
    } else if (day.passed) {
      cell.style.background = "var(--good)";
    } else if (day.attempted) {
      cell.style.background = "#ffb300";
    } else if (!day.isToday) {
      cell.style.background = "var(--danger)";
      cell.style.opacity = "0.35";
    } else {
      cell.style.background = "var(--border)";
    }
    // Day number label
    const num = document.createElement("span");
    num.className = "dash-day-num";
    num.textContent = day.iso.split("-")[2].replace(/^0/, "");
    cell.appendChild(num);
    grid.appendChild(cell);
  }

  // Reading history
  const histEl = overlay.querySelector("#dash-history");
  if (!sessions.length) {
    histEl.innerHTML = `<p class="dash-empty">No reading sessions yet.</p>`;
  } else {
    for (const s of sessions.slice(0, 50)) {
      const row = document.createElement("div");
      row.className = "dash-history-row";
      const timeStr = s.completedAt ? sgTime(s.completedAt) : "";
      row.innerHTML = `
        <span class="dash-hist-date">${fmtIsoDate(s.date)} ${timeStr}</span>
        <span class="dash-hist-story">${s.storyTitle || s.storyId}</span>
        <span class="dash-hist-score" style="color:${scoreColor(s.score)}">${s.score}</span>
        <span class="dash-hist-pass">${s.passed ? "✓" : "✗"}</span>
        <span class="dash-hist-pts">${s.passed ? `+${s.pointsEarned}💎` : "—"}</span>`;
      histEl.appendChild(row);
    }
  }

  // Close
  function close() {
    document.removeEventListener("keydown", handleEsc);
    overlay.remove();
    onClose?.();
  }
  function handleEsc(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", handleEsc);
  overlay.querySelector("#dash-close").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  // Delete
  const deleteBtn = overlay.querySelector("#dash-delete");
  let confirmPending = false;
  deleteBtn.addEventListener("click", () => {
    if (!confirmPending) {
      confirmPending = true;
      deleteBtn.textContent = "⚠️ Tap again to confirm delete";
      deleteBtn.style.background = "#c00";
      setTimeout(() => { confirmPending = false; deleteBtn.textContent = "🗑️ Delete Student"; deleteBtn.style.background = ""; }, 3000);
      return;
    }
    if (getActiveStudentId() === student.id) setActiveStudentId(null);
    deleteStudent(student.id);
    close();
    onDeleted?.();
  });
}
