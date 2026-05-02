// Student dashboard modal — full history, activity grid, and delete.

import {
  getProgress, getStudentStreak, getBestStreak,
  getActivityDays, deleteStudent, setActiveStudentId, getActiveStudentId,
} from "../lib/students.js";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const BADGES = [
  { id: 'first_pass',  icon: '🌟', label: 'First Pass',          check: (p)    => p.sessions.filter(s => s.passed).length >= 1 },
  { id: 'stories_5',  icon: '📚', label: '5 Stories',            check: (p)    => new Set(p.sessions.filter(s => s.passed).map(s => s.storyId)).size >= 5 },
  { id: 'perfect',    icon: '💯', label: 'Perfect Score',        check: (p)    => p.sessions.some(s => s.score >= 100) },
  { id: 'streak_7',   icon: '🔥', label: '7-Day Streak',         check: (p, k) => k >= 7 },
  { id: 'streak_30',  icon: '🏆', label: '30-Day Streak',        check: (p, k) => k >= 30 },
  { id: 'pts_100',    icon: '💎', label: '100 Points',            check: (p)    => p.totalPoints >= 100 },
  { id: 'pts_500',    icon: '👑', label: '500 Points',            check: (p)    => p.totalPoints >= 500 },
  { id: 'pts_1000',   icon: '🎯', label: '1000 Points',           check: (p)    => p.totalPoints >= 1000 },
  { id: 'challenge_1', icon: '🗡️', label: '初试挑战 First Challenge', check: (p) => p.sessions.some(s => s.passed && (s.storyTags || []).includes('challenge')) },
  { id: 'challenge_5', icon: '⚔️', label: '挑战达人 5 Challenges',    check: (p) => new Set(p.sessions.filter(s => s.passed && (s.storyTags || []).includes('challenge')).map(s => s.storyId)).size >= 5 },
  { id: 'exam_1',      icon: '🏅', label: '初上考场 Exam Debut',       check: (p) => p.sessions.some(s => s.passed && (s.storyTags || []).includes('past-years')) },
  { id: 'exam_3',      icon: '🎖️', label: '考试达人 Exam Pro',          check: (p) => new Set(p.sessions.filter(s => s.passed && (s.storyTags || []).includes('past-years')).map(s => s.storyId)).size >= 3 },
  { id: 'picture_1',   icon: '📷', label: '看图说话 Picture Pro',        check: (p) => p.sessions.some(s => s.passed && s.storyType === 'picture') },
  { id: 'pb',          icon: '🌈', label: '新纪录 Personal Best',        check: (p) => p.sessions.some(s => s.isPersonalBest) },
  { id: 'p3_master',   icon: '📕', label: 'P3 Master',                  check: (p) => ['p3-xiaomao-diaoyu','p3-huanjing','p3-jieyue','p3-shequ','p3-yundong','p3-challenge-keji','p3-challenge-zhuren'].every(id => p.sessions.some(s => s.passed && s.storyId === id)) },
  { id: 'p6_master',   icon: '📙', label: 'P6 Master',                  check: (p) => ['p6-kexue','p6-minzu','p6-shengming','p6-zeren','p6-zixiang-maodun','p6-challenge-shuzi','p6-challenge-xinjiapo'].every(id => p.sessions.some(s => s.passed && s.storyId === id)) },
];

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
  const streak = getStudentStreak(student.id);
  const bestStreak = getBestStreak(student.id);
  const passSessions = sessions.filter(s => s.passed);
  const avgScore = passSessions.length
    ? Math.round(passSessions.reduce((s, x) => s + x.score, 0) / passSessions.length)
    : 0;

  const joinedMonth = new Date(student.createdAt);
  const joinedStr = `${MONTH_SHORT[joinedMonth.getMonth()]} ${joinedMonth.getFullYear()}`;

  const totalPtsNum = progress.totalPoints || 0;
  const MILESTONE = 500;
  const milestoneProgress = Math.min((totalPtsNum % MILESTONE) / MILESTONE * 100, 100);
  const earnedIds = new Set(BADGES.filter(b => b.check(progress, streak)).map(b => b.id));

  overlay.innerHTML = `
    <div class="modal-card dash-card-v2" role="dialog" aria-modal="true">
      <div class="dash-hdr">
        <div class="student-avatar" style="background:${student.color};width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:white;flex-shrink:0">${student.name[0].toUpperCase()}</div>
        <div style="flex:1">
          <div class="dash-name">${student.name}</div>
          <div class="dash-sub">${student.level} · Since ${joinedStr}</div>
        </div>
        <button class="dash-close" id="dash-close" aria-label="Close">✕</button>
      </div>

      <div class="dash-pts-hero">
        <div class="dash-pts-num">${totalPtsNum.toLocaleString()} 💎</div>
        <div class="dash-pts-lbl">Total Points</div>
        <div class="dash-bar-wrap"><div class="dash-bar" style="width:${milestoneProgress}%"></div></div>
        <div class="dash-bar-lbl">${totalPtsNum % MILESTONE} / ${MILESTONE} to next milestone</div>
      </div>

      <div class="dash-stat-cards">
        <div class="dash-sc"><span class="dash-sc-v">🔥 ${streak}</span><span class="dash-sc-l">Streak</span></div>
        <div class="dash-sc"><span class="dash-sc-v">🏆 ${bestStreak}</span><span class="dash-sc-l">Best</span></div>
        <div class="dash-sc"><span class="dash-sc-v">📖 ${sessions.length}</span><span class="dash-sc-l">Sessions</span></div>
        <div class="dash-sc"><span class="dash-sc-v">⭐ ${avgScore}</span><span class="dash-sc-l">Avg</span></div>
      </div>

      <div class="dash-section-title" style="padding:0 16px 8px">Badges</div>
      <div class="dash-badge-wall">
        ${BADGES.map(b => `
          <div class="dash-badge ${earnedIds.has(b.id) ? 'earned' : 'locked'}" title="${b.label}">
            <span style="font-size:26px">${b.icon}</span>
            <span class="dash-badge-lbl">${b.label}</span>
          </div>`).join('')}
      </div>

      <div class="dash-section-title" style="padding:0 16px 8px">Last 30 Days</div>
      <div class="dash-activity-grid" id="dash-grid"></div>
      <div class="dash-legend">
        <span class="dash-legend-dot" style="background:var(--good)"></span> Passed
        <span class="dash-legend-dot" style="background:#ffb300;margin-left:8px"></span> Attempted
        <span class="dash-legend-dot" style="background:var(--danger);opacity:.35;margin-left:8px"></span> Missed
        <span class="dash-legend-dot" style="background:var(--border);margin-left:8px"></span> No reading
      </div>

      <div class="dash-history-wrap">
        <div class="dash-section-title" style="padding:8px 16px">Reading History</div>
        <div class="dash-history" id="dash-history"></div>
      </div>
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
