import { openStoryGenerator } from "./storyGenerator.js";
import {
  loadGeneratedStories,
  saveGeneratedStory,
  deleteGeneratedStory,
} from "../lib/stories.js";
import { getPassedStoryIds } from "../lib/students.js";

const LEVEL_ORDER = ["P1", "P2", "P3", "P4", "P5", "P6"];

// Module-level so filters survive re-renders triggered by story selection
let activeLevel = null;
let activeType = null;

export function renderStoryPicker({ root, stories, activeId, activeStudentId, onPick }) {
  root.innerHTML = "";
  const passedIds = activeStudentId ? getPassedStoryIds(activeStudentId) : new Set();

  // Header
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
        renderStoryPicker({ root, stories, activeId: story.id, activeStudentId, onPick });
        onPick(story.id);
      },
    });
  });
  header.appendChild(heading);
  header.appendChild(genBtn);
  root.appendChild(header);

  // Type filter bar
  const typeBar = document.createElement("div");
  typeBar.className = "filter-bar";

  function makeTypeTab(label, value) {
    const btn = document.createElement("button");
    btn.className = "filter-tab" + (activeType === value ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      activeType = value;
      renderList();
      typeBar.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
    return btn;
  }

  typeBar.appendChild(makeTypeTab("全部 All", null));
  typeBar.appendChild(makeTypeTab("挑战 Challenge", "challenge"));
  typeBar.appendChild(makeTypeTab("考试 Exam", "past-years"));
  typeBar.appendChild(makeTypeTab("看图 Picture", "picture"));
  typeBar.appendChild(makeTypeTab("看视频 Video", "video"));
  root.appendChild(typeBar);

  // Level filter bar
  const levelBar = document.createElement("div");
  levelBar.className = "filter-bar";

  const levelsInData = LEVEL_ORDER.filter(l => stories.some(s => s.level === l));

  function makeLevelTab(label, value) {
    const btn = document.createElement("button");
    btn.className = "filter-tab" + (activeLevel === value ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      activeLevel = value;
      renderList();
      levelBar.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
    return btn;
  }

  levelBar.appendChild(makeLevelTab("All", null));
  for (const l of levelsInData) levelBar.appendChild(makeLevelTab(l, l));
  root.appendChild(levelBar);

  const listWrap = document.createElement("div");

  function applyFilters(list) {
    return list.filter(s => {
      if (activeLevel && s.level !== activeLevel) return false;
      if (activeType === "challenge") return (s.tags || []).includes("challenge");
      if (activeType === "past-years") return (s.tags || []).includes("past-years");
      if (activeType === "picture") return s.type === "picture";
      if (activeType === "video") return s.type === "video";
      // null = show all
      return true;
    });
  }

  function renderList() {
    listWrap.innerHTML = "";
    const filtered = applyFilters(stories);
    const byLevel = filtered.reduce((acc, s) => {
      (acc[s.level] = acc[s.level] || []).push(s);
      return acc;
    }, {});

    const levelsToShow = activeLevel ? [activeLevel] : levelsInData;
    for (const level of levelsToShow) {
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
        const tick = passedIds.has(story.id)
          ? '<span class="story-tick" aria-label="Completed">✅</span> '
          : '';
        const typeTag = story.type === "picture" ? ' 📷' : story.type === "video" ? ' 🎬' : '';
        const challengeTag = (story.tags || []).includes("challenge") ? ' 🗡️' : '';
        const examTag = (story.tags || []).includes("past-years") ? ' 📝' : '';
        btn.innerHTML = `${tick}${story.title}${typeTag}${challengeTag}${examTag}<span class="meta">${story.estMinutes} min</span>`;
        btn.addEventListener("click", () => onPick(story.id));
        group.appendChild(btn);
      }
      listWrap.appendChild(group);
    }

    // Generated stories (show when type filter is null or not restricting)
    if (!activeType || activeType === null) {
      const generated = loadGeneratedStories().filter(
        s => !activeLevel || s.level === activeLevel
      );
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
          btn.innerHTML = `${story.title}<span class="meta">${story.level} · ${(story.tags || []).join(", ") || "—"}</span>`;
          btn.addEventListener("click", () => onPick(story.id));
          const delBtn = document.createElement("button");
          delBtn.className = "delete-story-btn";
          delBtn.textContent = "×";
          delBtn.title = "Delete story";
          delBtn.addEventListener("click", () => {
            deleteGeneratedStory(story.id);
            renderStoryPicker({ root, stories, activeId, activeStudentId, onPick });
          });
          row.appendChild(btn);
          row.appendChild(delBtn);
          group.appendChild(row);
        }
        listWrap.appendChild(group);
      }
    }
  }

  renderList();
  root.appendChild(listWrap);
}
