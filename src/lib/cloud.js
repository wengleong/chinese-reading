// src/lib/cloud.js
// Write-through cloud sync. All functions are no-ops when not logged in.
// localStorage is the primary store; cloud is async best-effort.

import {
  isLoggedIn, listStudents, upsertStudent, removeStudent,
  listSessions, saveSession, uploadRecording as apiUpload,
  getApiKey,
} from './api.js';

// ---- Students ----

export async function pushStudent(student) {
  if (!isLoggedIn()) return;
  upsertStudent(student).catch(() => {});
}

export async function deleteStudentCloud(id) {
  if (!isLoggedIn()) return;
  removeStudent(id).catch(() => {});
}

// ---- Sessions ----

export async function pushSession(session, studentId) {
  if (!isLoggedIn()) return;
  saveSession({ ...session, studentId }).catch(() => {});
}

// ---- Recordings ----

export async function pushRecording({ blob, mimeType, studentId, sessionId, durationMs }) {
  if (!isLoggedIn()) return null;
  try {
    const { id } = await apiUpload({ blob, mimeType, studentId, sessionId, durationMs });
    return id;
  } catch { return null; }
}

// ---- API Key ----

export async function pullApiKey() {
  if (!isLoggedIn()) return null;
  try {
    const { key } = await getApiKey();
    if (key) localStorage.setItem('anthropicApiKey', key);
    return key;
  } catch { return null; }
}

// ---- Sync Up (push local data not yet in cloud — runs once per device after login) ----
// Handles the case where sessions were recorded before joining a family.
// Server uses ON CONFLICT DO NOTHING so re-pushing is safe.

const SYNC_UP_DONE_KEY = 'cr-synced-up';

async function syncUp() {
  if (!isLoggedIn()) return;
  if (localStorage.getItem(SYNC_UP_DONE_KEY)) return;
  // Mark done first so a JSON parse error doesn't loop on every login
  localStorage.setItem(SYNC_UP_DONE_KEY, '1');
  try {
    const students = JSON.parse(localStorage.getItem('cr-students') || '[]');
    const pushes = [];
    for (const student of students) {
      pushes.push(upsertStudent(student).catch(() => {}));
      const progress = JSON.parse(
        localStorage.getItem(`cr-progress-${student.id}`) || '{"sessions":[]}'
      );
      for (const session of (progress.sessions || [])) {
        pushes.push(saveSession({ ...session, studentId: student.id }).catch(() => {}));
      }
    }
    await Promise.allSettled(pushes);
  } catch {}
}

// ---- Sync Down (call on login) ----

export async function syncDown() {
  if (!isLoggedIn()) return;

  // Push any local data that was created before the user joined a family
  await syncUp();

  // Students
  try {
    const students = await listStudents();
    if (students.length) {
      const local = JSON.parse(localStorage.getItem('cr-students') || '[]');
      const localIds = new Set(local.map(s => s.id));
      const toAdd = students
        .filter(s => !localIds.has(s.id))
        .map(s => ({
          id: s.id, name: s.name, level: s.level, color: s.color,
          createdAt: new Date(s.created_at).getTime(),
        }));
      if (toAdd.length) {
        localStorage.setItem('cr-students', JSON.stringify([...local, ...toAdd]));
      }
    }
  } catch {}

  // Sessions
  try {
    const sessions = await listSessions();
    if (sessions.length) {
      const byStudent = {};
      for (const s of sessions) {
        (byStudent[s.student_id] = byStudent[s.student_id] || []).push(s);
      }
      for (const [studentId, rows] of Object.entries(byStudent)) {
        const key = `cr-progress-${studentId}`;
        const local = JSON.parse(localStorage.getItem(key) || '{"totalPoints":0,"sessions":[]}');
        const localIds = new Set(local.sessions.map(s => s.id));
        const toAdd = rows.filter(s => !localIds.has(s.id)).map(s => ({
          id: s.id, date: s.date, storyId: s.story_id, storyTitle: s.story_title,
          score: s.score, passed: s.passed, pointsEarned: s.points_earned,
          transcript: s.transcript ?? '', completedAt: s.completed_at,
        }));
        if (toAdd.length) {
          local.sessions = [...local.sessions, ...toAdd]
            .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
          const bestPerDay = {};
          for (const s of local.sessions) {
            if (!s.passed) continue;
            const k = `${s.date}|${s.storyId}`;
            bestPerDay[k] = Math.max(bestPerDay[k] || 0, s.pointsEarned ?? 0);
          }
          local.totalPoints = Object.values(bestPerDay).reduce((sum, v) => sum + v, 0);
          localStorage.setItem(key, JSON.stringify(local));
        }
      }
    }
  } catch {}

  // API key
  await pullApiKey();
}
