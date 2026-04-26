// Loads the story library index and individual story files from /stories.
// Generated stories are stored in localStorage and loaded transparently.

const BASE = "./stories";
const GENERATED_KEY = "chineseReaderGenerated";

export async function loadIndex() {
  const res = await fetch(`${BASE}/index.json`);
  if (!res.ok) throw new Error(`Failed to load story index (${res.status})`);
  return res.json();
}

export async function loadStory(id) {
  // Check generated stories first
  const local = loadGeneratedStories().find((s) => s.id === id);
  if (local) return local;

  const res = await fetch(`${BASE}/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load story ${id} (${res.status})`);
  return res.json();
}

export function loadGeneratedStories() {
  try {
    return JSON.parse(localStorage.getItem(GENERATED_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveGeneratedStory(story) {
  const existing = loadGeneratedStories();
  existing.unshift(story); // newest first
  localStorage.setItem(GENERATED_KEY, JSON.stringify(existing));
}

export function deleteGeneratedStory(id) {
  const existing = loadGeneratedStories();
  localStorage.setItem(
    GENERATED_KEY,
    JSON.stringify(existing.filter((s) => s.id !== id))
  );
}
