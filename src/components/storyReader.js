// Renders a story as <ruby> tokens and exposes a setActiveIndex(i) method
// so the speech engine can drive highlighting.

import { tokenizeEnglish, passageText, isEnglish } from "../lib/english.js";

export function renderStoryReader({ root, story }) {
  if (isEnglish(story)) return renderEnglishReader({ root, story });

  root.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "story-title";
  title.textContent = story.title;
  root.appendChild(title);

  const para = document.createElement("p");
  para.className = "story-paragraph";

  story.tokens.forEach((token, i) => {
    if (token.char === "\n") {
      para.appendChild(document.createElement("br"));
      return;
    }
    const ruby = document.createElement("ruby");
    ruby.dataset.index = String(i);
    ruby.appendChild(document.createTextNode(token.char));
    const rt = document.createElement("rt");
    rt.textContent = token.pinyin || "";
    ruby.appendChild(rt);
    para.appendChild(ruby);
  });

  root.appendChild(para);

  let activeEl = null;
  return {
    setActiveIndex(i) {
      if (activeEl) activeEl.classList.remove("active");
      const next = root.querySelector(`ruby[data-index="${i}"]`);
      if (next) {
        next.classList.add("active");
        // Keep the active token in view without yanking the page.
        next.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      activeEl = next;
    },
    clearActive() {
      if (activeEl) activeEl.classList.remove("active");
      activeEl = null;
    },
  };
}

// English passages are words, not characters — no ruby, no pinyin slot.
// Highlighting is by word index, matching createEnglishPlayer's token indices.
export function renderEnglishReader({ root, story }) {
  root.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "story-title";
  title.textContent = story.title;
  root.appendChild(title);

  const para = document.createElement("p");
  para.className = "story-paragraph story-paragraph-en";

  const tokens = tokenizeEnglish(passageText(story));
  tokens.forEach((token, i) => {
    if (token.break) {
      para.appendChild(document.createElement("br"));
      return;
    }
    const span = document.createElement("span");
    span.className = "en-word";
    span.dataset.index = String(i);
    span.textContent = token.text;
    para.appendChild(span);
    para.appendChild(document.createTextNode(" "));
  });

  root.appendChild(para);

  let activeEl = null;
  return {
    setActiveIndex(i) {
      if (activeEl) activeEl.classList.remove("active");
      const next = root.querySelector(`.en-word[data-index="${i}"]`);
      if (next) {
        next.classList.add("active");
        next.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      activeEl = next;
    },
    clearActive() {
      if (activeEl) activeEl.classList.remove("active");
      activeEl = null;
    },
  };
}
