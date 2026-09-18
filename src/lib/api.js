// src/lib/api.js
// Thin fetch wrapper for the Chinese Reading API.
// Frontend and API are co-located on the same Railway service,
// so API_BASE is empty (same origin). Token stored as 'cr-token'.

const API_BASE = '';
const TOKEN_KEY = 'cr-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

async function req(method, path, body, isFormData = false) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Anthropic errors: { error: { type, message } }; our own errors: { error: string }
    const msg = (typeof err.error === 'object' ? err.error?.message : err.error)
      || `API error ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

// /health is unauthenticated and reports presence-only feature flags.
export const getHealth = () =>
  fetch(`${API_BASE}/health`).then(r => (r.ok ? r.json() : {})).catch(() => ({}));

// Families
export const createFamily = ()     => req('POST', '/api/families');
export const joinFamily   = (code) => req('POST', '/api/families/join', { code });
// No apikey calls: AI runs on the server's own key, so the browser never holds one.

// Per-family opt-in for server-side speech transcription.
// Data-flow: docs/pii-transcription-review.md.
export const getTranscriptionConsent = ()        => req('GET', '/api/families/transcription-consent');
export const setTranscriptionConsent = (consent) => req('PUT', '/api/families/transcription-consent', { consent });

// POST /api/transcribe — server-side speech-to-text fallback for browsers
// whose Web Speech API silently returns nothing. Server refuses unless the
// global ENABLE_SERVER_TRANSCRIBE flag AND the caller's per-family
// transcription_consent are BOTH true. Returns '' on any failure so callers
// can preserve their existing empty-transcript UI without a try/catch.
export async function transcribeViaApi({ blob, mimeType, lang }) {
  const form = new FormData();
  form.append('audio', blob, `take.${(mimeType || '').includes('mp4') ? 'mp4' : 'webm'}`);
  if (lang) form.append('lang', lang);
  const res = await req('POST', '/api/transcribe', form, true);
  return typeof res?.transcript === 'string' ? res.transcript : '';
}

// Students
export const listStudents  = ()         => req('GET',    '/api/students');
export const upsertStudent = (student)  => req('POST',   '/api/students', student);
export const removeStudent = (id)       => req('DELETE', `/api/students/${id}`);

// Sessions
export const listSessions = ()        => req('GET',  '/api/sessions');
export const saveSession  = (session) => req('POST', '/api/sessions', session);

// Recordings
export const listRecordings = () => req('GET', '/api/recordings');

export async function uploadRecording({ blob, mimeType, studentId, sessionId, durationMs }) {
  const form = new FormData();
  form.append('audio', blob, `recording.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
  form.append('studentId', studentId);
  if (sessionId) form.append('sessionId', sessionId);
  if (durationMs) form.append('durationMs', String(durationMs));
  return req('POST', '/api/recordings', form, true);
}

export async function fetchRecordingBlob(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/recordings/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Recording not found');
  return res.blob();
}

// Generate (Anthropic proxy)
export const generateViaApi = (body) => req('POST', '/api/generate', body);
