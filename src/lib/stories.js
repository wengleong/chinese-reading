// Loads the story library index and individual story files from /stories.

const BASE = "./stories";

export async function loadIndex() {
  const res = await fetch(`${BASE}/index.json`);
  if (!res.ok) throw new Error(`Failed to load story index (${res.status})`);
  return res.json();
}

export async function loadStory(id) {
  const res = await fetch(`${BASE}/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load story ${id} (${res.status})`);
  return res.json();
}
