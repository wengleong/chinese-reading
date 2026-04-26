export function renderStoryPicker({ root, stories, activeId, onPick }) {
  root.innerHTML = "";
  const heading = document.createElement("h2");
  heading.textContent = "故事 Stories";
  root.appendChild(heading);

  const byLevel = stories.reduce((acc, s) => {
    (acc[s.level] = acc[s.level] || []).push(s);
    return acc;
  }, {});

  const levelOrder = ["P3", "P4", "P5", "P6"];
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
}
