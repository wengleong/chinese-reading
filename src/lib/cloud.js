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

// ---- Sync Down (call on login) ----

export async function syncDown() {
  if (!isLoggedIn()) return;

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
          local.totalPoints = local.sessions
            .filter(s => s.passed)
            .reduce((sum, s) => sum + (s.pointsEarned ?? 0), 0);
          localStorage.setItem(key, JSON.stringify(local));
        }
      }
    }
  } catch {}

  // API key
  await pullApiKey();
}
