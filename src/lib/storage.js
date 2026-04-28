// IndexedDB helpers for storing audio recordings on-device.

import { pushRecording } from './cloud.js';

const DB_NAME = "chinese-reader";
const DB_VERSION = 1;
const STORE = "recordings";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by_date", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function saveRecording({ storyId, storyTitle, blob, mimeType, durationMs, studentId, sessionId }) {
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const record = {
      storyId,
      storyTitle,
      blob,
      mimeType,
      durationMs,
      sessionId: sessionId ?? null,
      createdAt: Date.now(),
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (studentId && blob) {
    pushRecording({ blob, mimeType, studentId, sessionId, durationMs }).catch(() => {});
  }
  return result;
}

export async function listRecordings() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readonly");
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      all.sort((a, b) => b.createdAt - a.createdAt);
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecording(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
