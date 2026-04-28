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
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// Families
export const createFamily = ()     => req('POST', '/api/families');
export const joinFamily   = (code) => req('POST', '/api/families/join', { code });
export const saveApiKey   = (key)  => req('PUT',  '/api/families/apikey', { key });
export const getApiKey    = ()     => req('GET',  '/api/families/apikey');

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
