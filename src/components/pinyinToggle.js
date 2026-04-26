const KEY = "pinyinVisible";

export function readPinyinPref() {
  const v = localStorage.getItem(KEY);
  return v === null ? true : v === "true";
}

export function renderPinyinToggle({ root, readerRoot }) {
  const visible = readPinyinPref();
  applyClass(readerRoot, visible);

  root.innerHTML = "";
  const wrap = document.createElement("label");
  wrap.className = "toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = visible;
  const text = document.createElement("span");
  text.textContent = "显示拼音 Pinyin";
  wrap.appendChild(input);
  wrap.appendChild(text);
  root.appendChild(wrap);

  input.addEventListener("change", () => {
    localStorage.setItem(KEY, String(input.checked));
    applyClass(readerRoot, input.checked);
  });
}

function applyClass(readerRoot, visible) {
  readerRoot.classList.toggle("hide-pinyin", !visible);
}
