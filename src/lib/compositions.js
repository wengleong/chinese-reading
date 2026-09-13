// Composition prompt papers. The app only supplies the topic and the pictures —
// the child writes on paper, so nothing here uploads, stores or marks anything.

const BASE = "./compositions";

export async function loadCompositionIndex() {
  const res = await fetch(`${BASE}/index.json`);
  if (!res.ok) throw new Error(`Failed to load composition list (${res.status})`);
  return res.json();
}

export async function loadComposition(id) {
  const res = await fetch(`${BASE}/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load composition ${id} (${res.status})`);
  return res.json();
}

export function compositionImagePath(paper) {
  return `${BASE}/images/${paper.image}`;
}
