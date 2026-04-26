import { openStoryGenerator } from "./storyGenerator.js";
import {
  loadGeneratedStories,
  saveGeneratedStory,
  deleteGeneratedStory,
} from "../lib/stories.js";

export function renderStoryPicker({ root, stories, activeId, onPick }) {
  root.innerHTML = "";

  // Header with Generate button
  const header = document.createElement("div");
  header.className = "picker-header";

  const heading = document.createElement("h2");
  heading.textContent = "故事 Stories";

  const genBtn = document.createElement("button");
  genBtn.className = "secondary generate-btn";
  genBtn.textContent = "✨ Generate";
  genBtn.addEventListener("click", () => {
    openStoryGenerator({
      onGenerated(story) {
        saveGeneratedStory(story);
        renderStoryPicker({ root, stories, activeId: story.id, onPick });
        onPick(story.id);
      },
    });
  });

  header.appendChild(heading);
  header.appendChild(genBtn);
  root.appendChild(header);

  // Built-in stories by level
  const byLevel = stories.reduce((acc, s) => {
    (acc[s.level] = acc[s.level] || []).push(s);
    return acc;
  }, {});

  const levelOrder = ["P1", "P2", "P3", "P4", "P5", "P6"];
  for (const level of levelOrder) {
    const list = byLevel[level];
    if (!list || list.length === 0) continue;
    const group = document.createElement("div");
    group.className = "level-group";
    const h3 = document.createElement("h3");
    h3.textContent = level;
    group.appendChild(h3);

    for (const story of list) {
      const btn = document.createElement("button");
      btn.className = "story-button";
      if (story.id === activeId) btn.classList.add("active");
      btn.innerHTML = `${story.title}<span class="meta">${story.estMinutes} min · ${
        (story.tags || []).join(", ") || "—"
      }</span>`;
      btn.addEventListener("click", () => onPick(story.id));
      group.appendChild(btn);
    }

    root.appendChild(group);
  }

  // Generated stories section
  const generated = loadGeneratedStories();
  if (generated.length > 0) {
    const group = document.createElement("div");
    group.className = "level-group";
    const h3 = document.createElement("h3");
    h3.textContent = "✨ Generated";
    group.appendChild(h3);

    for (const story of generated) {
      const row = document.createElement("div");
      row.className = "story-button-row";

      const btn = document.createElement("button");
      btn.className = "story-button";
      if (story.id === activeId) btn.classList.add("active");
      btn.innerHTML = `${story.title}<span class="meta">${story.level} · ${
        (story.tags || []).join(", ") || "—"
      }</span>`;
      btn.addEventListener("click", () => onPick(story.id));

      const delBtn = document.createElement("button");
      delBtn.className = "delete-story-btn";
      delBtn.textContent = "×";
      delBtn.title = "Delete story";
      delBtn.addEventListener("click", () => {
        deleteGeneratedStory(story.id);
        renderStoryPicker({ root, stories, activeId, onPick });
      });

      row.appendChild(btn);
      row.appendChild(delBtn);
      group.appendChild(row);
    }

    root.appendChild(group);
  }
}
