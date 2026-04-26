// Story generator — calls Claude API to produce a tokenised Chinese story
// aligned with Singapore MOE PSLE Chinese curriculum standards.

const API_KEY_STORAGE = "anthropicApiKey";
const LEVELS = ["P1", "P2", "P3", "P4", "P5", "P6"];

function saveApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key);
}

function loadApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

const CHAR_RANGES = {
  P1: "40–60",
  P2: "60–90",
  P3: "90–130",
  P4: "120–170",
  P5: "160–220",
  P6: "200–280",
};

async function callClaudeAPI(apiKey, level, theme) {
  const themeHint = theme.trim()
    ? `Theme / topic: ${theme.trim()}`
    : "Choose an engaging, educational theme suitable for Singapore children (e.g. family, school life, friendship, community, nature, festivals).";

  const charCount = CHAR_RANGES[level] || "100–160";
  const levelNum = level.slice(1); // "3" from "P3"

  const prompt = `Generate a short Chinese reading story for Singapore Primary ${levelNum} (${level}) students following MOE PSLE Chinese curriculum standards.

${themeHint}

Story length: approximately ${charCount} Chinese characters (not counting punctuation).

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "id": "gen-${level.toLowerCase()}-[3-4 syllable pinyin title slug]",
  "title": "[Chinese title, 2–6 characters]",
  "level": "${level}",
  "estMinutes": 3,
  "tags": ["tag1", "tag2"],
  "tokens": [
    {"char": "每", "pinyin": "měi"},
    {"char": "天", "pinyin": "tiān"},
    {"char": "，", "pinyin": ""},
    {"char": "小", "pinyin": "xiǎo"}
  ]
}

CRITICAL RULES — follow exactly:
1. Each token is exactly ONE Chinese character OR one punctuation mark.
2. Pinyin MUST use Unicode tone diacritics (not numbers):
   Tone 1: ā ē ī ō ū ǖ   Tone 2: á é í ó ú ǘ
   Tone 3: ǎ ě ǐ ǒ ǔ ǚ   Tone 4: à è ì ò ù ǜ
   Neutral tone: a e i o u (no diacritic)
3. Punctuation tokens (。！？，：；""''—…《》) have empty pinyin: "".
4. Structural particles must use their neutral/weak tone:
   的 → "de"  地 → "de"  得 → "de"  了 → "le"  着 → "zhe"  过 → "guo"
   吗 → "ma"  呢 → "ne"  吧 → "ba"  嘛 → "ma"
5. Measure words and directional complements use correct tone for context.
6. Story must be age-appropriate, positive values, and aligned with Singapore PSLE Chinese themes and vocabulary for ${level}.
7. End the story with 。`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  let text = data.content[0].text.trim();

  // Strip markdown code fences if Claude added them despite instructions
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let story;
  try {
    story = JSON.parse(text);
  } catch {
    throw new Error("Could not parse the generated story. Please try again.");
  }

  if (!story.tokens || !Array.isArray(story.tokens) || !story.title) {
    throw new Error("Invalid story format returned. Please try again.");
  }

  // Make ID unique with timestamp
  story.id = `${story.id}-${Date.now()}`;
  story.generated = true;
  return story;
}

export function openStoryGenerator({ onGenerated }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const savedKey = loadApiKey();

  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Generate Story">
      <h2 class="modal-title">✨ 生成故事 Generate Story</h2>
      <p class="modal-subtitle">Stories are aligned with Singapore MOE PSLE Chinese curriculum standards.</p>

      <label class="modal-label">
        年级 Level
        <select class="modal-select" id="gen-level">
          ${LEVELS.map((l) => `<option value="${l}"${l === "P4" ? " selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>

      <label class="modal-label">
        主题 Theme <span class="modal-hint">(optional)</span>
        <input class="modal-input" id="gen-theme" type="text"
          placeholder="e.g. 动物, 友谊, 节日, 环境保护" />
      </label>

      <label class="modal-label">
        Anthropic API Key
        <input class="modal-input" id="gen-apikey" type="password"
          placeholder="sk-ant-…" value="${savedKey}" autocomplete="off" />
        <span class="modal-hint">Saved locally in your browser. Only sent to api.anthropic.com.</span>
      </label>

      <div class="modal-error" id="gen-error" hidden></div>

      <div class="modal-actions">
        <button class="secondary" id="gen-cancel">取消 Cancel</button>
        <button class="primary" id="gen-submit">✨ 生成 Generate</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const levelEl = overlay.querySelector("#gen-level");
  const themeEl = overlay.querySelector("#gen-theme");
  const apikeyEl = overlay.querySelector("#gen-apikey");
  const errorEl = overlay.querySelector("#gen-error");
  const submitBtn = overlay.querySelector("#gen-submit");
  const cancelBtn = overlay.querySelector("#gen-cancel");

  // Focus first input
  setTimeout(() => levelEl.focus(), 50);

  function close() {
    document.removeEventListener("keydown", handleEsc);
    overlay.remove();
  }

  function handleEsc(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", handleEsc);

  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  submitBtn.addEventListener("click", async () => {
    const apiKey = apikeyEl.value.trim();
    if (!apiKey) {
      errorEl.textContent = "Please enter your Anthropic API key.";
      errorEl.hidden = false;
      apikeyEl.focus();
      return;
    }

    saveApiKey(apiKey);
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ Generating…";

    try {
      const story = await callClaudeAPI(apiKey, levelEl.value, themeEl.value);
      onGenerated(story);
      close();
    } catch (err) {
      errorEl.textContent = `Error: ${err.message}`;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "✨ 生成 Generate";
    }
  });
}
