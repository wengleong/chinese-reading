// Renders a story as <ruby> tokens and exposes a setActiveIndex(i) method
// so the speech engine can drive highlighting.

export function renderStoryReader({ root, story }) {
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
