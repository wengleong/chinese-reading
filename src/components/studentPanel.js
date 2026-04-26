// Student selector panel — shows enrolled students, active state, streak, points.

import {
  getStudents, createStudent, deleteStudent,
  getActiveStudentId, setActiveStudentId,
  getProgress, getStudentStreak, hasCompletedToday,
} from "../lib/students.js";

const LEVELS = ["P1", "P2", "P3", "P4", "P5", "P6"];

export function renderStudentPanel({ root, onStudentChange }) {
  function refresh() {
    root.innerHTML = "";
    const students = getStudents();
    const activeId = getActiveStudentId();

    const wrap = document.createElement("div");
    wrap.className = "student-panel";

    if (students.length === 0) {
      const hint = document.createElement("span");
      hint.className = "student-panel-hint";
      hint.textContent = "👋 Add a student to track daily reading progress:";
      wrap.appendChild(hint);
    }

    for (const student of students) {
      const card = document.createElement("button");
      card.className = "student-card" + (student.id === activeId ? " active" : "");

      const todayDone = hasCompletedToday(student.id);
      const streak = getStudentStreak(student.id);
      const pts = (getProgress(student.id).totalPoints || 0).toLocaleString();

      card.innerHTML = `
        <div class="student-avatar" style="background:${student.color}">${student.name[0].toUpperCase()}</div>
        <div class="student-info">
          <span class="student-name">${student.name}</span>
          <span class="student-meta">${student.level}${todayDone ? " ✅" : " ⭕"}${streak > 0 ? ` 🔥${streak}` : ""} 💎${pts}</span>
        </div>`;

      card.addEventListener("click", () => {
        setActiveStudentId(student.id);
        onStudentChange && onStudentChange(student);
        refresh();
      });

      wrap.appendChild(card);
    }

    // Add student button
    const addBtn = document.createElement("button");
    addBtn.className = "student-add-btn";
    addBtn.textContent = "+ Add Student";
    addBtn.addEventListener("click", () => openAddModal(refresh, onStudentChange));
    wrap.appendChild(addBtn);

    root.appendChild(wrap);
  }

  refresh();

  return { refresh };
}

function openAddModal(onDone, onStudentChange) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <h2 class="modal-title">Add Student</h2>
      <label class="modal-label">
        Name
        <input class="modal-input" id="add-name" type="text" placeholder="Student name" maxlength="30" />
      </label>
      <label class="modal-label">
        Level
        <select class="modal-select" id="add-level">
          ${LEVELS.map(l => `<option value="${l}"${l === "P3" ? " selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
      <div class="modal-error" id="add-error" hidden></div>
      <div class="modal-actions">
        <button class="secondary" id="add-cancel">Cancel</button>
        <button class="primary" id="add-submit">Add Student</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const nameEl = overlay.querySelector("#add-name");
  const levelEl = overlay.querySelector("#add-level");
  const errorEl = overlay.querySelector("#add-error");

  setTimeout(() => nameEl.focus(), 50);

  function close() {
    document.removeEventListener("keydown", handleEsc);
    overlay.remove();
  }
  function handleEsc(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", handleEsc);

  overlay.querySelector("#add-cancel").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  nameEl.addEventListener("keydown", e => {
    if (e.key === "Enter") overlay.querySelector("#add-submit").click();
  });

  overlay.querySelector("#add-submit").addEventListener("click", () => {
    const name = nameEl.value.trim();
    if (!name) {
      errorEl.textContent = "Please enter a name.";
      errorEl.hidden = false;
      return;
    }
    const student = createStudent(name, levelEl.value);
    setActiveStudentId(student.id);
    onStudentChange && onStudentChange(student);
    onDone();
    close();
  });
}
