import { loadIndex, loadStory } from "./lib/stories.js";
import { createPlayer, isSupported as ttsSupported } from "./lib/speech.js";
import { renderStoryPicker } from "./components/storyPicker.js";
import { renderStoryReader } from "./components/storyReader.js";
import { renderPinyinToggle } from "./components/pinyinToggle.js";
import { renderPlaybackControls } from "./components/playbackControls.js";
import { renderRecorder } from "./components/recorder.js";
import { renderRecordingsList } from "./components/recordingsList.js";
import { renderDailyTimer } from "./components/dailyTimer.js";

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  const btn = document.getElementById("install-btn");
  if (btn) btn.hidden = false;
});

document.addEventListener("click", async (e) => {
  if (e.target && e.target.id === "install-btn" && deferredInstall) {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    e.target.hidden = true;
  }
});

const els = {
  picker: document.getElementById("story-picker"),
  reader: document.getElementById("story-reader"),
  pinyinToggle: document.getElementById("pinyin-toggle"),
  highlightToggle: document.getElementById("highlight-toggle"),
  playback: document.getElementById("playback-controls"),
  recorder: document.getElementById("recorder"),
  recordings: document.getElementById("recordings-list"),
  timer: document.getElementById("daily-timer"),
};

let stories = [];
let activeStory = null;
let readerCtl = null;
let player = null;
let rate = 0.9;
let highlightEnabled = true;

const timerCtl = renderDailyTimer({ root: els.timer });

renderPinyinToggle({ root: els.pinyinToggle, readerRoot: els.reader });

// Highlight toggle
(function renderHighlightToggle() {
  const label = document.createElement("label");
  label.className = "toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = true;
  const span = document.createElement("span");
  span.textContent = "高亮 Highlight";
  label.appendChild(input);
  label.appendChild(span);
  els.highlightToggle.appendChild(label);
  input.addEventListener("change", () => {
    highlightEnabled = input.checked;
    if (!highlightEnabled && readerCtl) readerCtl.clearActive();
  });
})();

renderPlaybackControls({
  root: els.playback,
  onPlay: () => {
    if (!player) return;
    timerCtl.setActive(true);
    player.play();
  },
  onPause: () => {
    if (!player) return;
    player.pause();
    timerCtl.setActive(false);
  },
  onRestart: () => {
    if (!player) return;
    player.restart();
    if (readerCtl) readerCtl.clearActive();
  },
  onRateChange: (v) => {
    rate = v;
    if (player) player.setRate(v);
  },
});

renderRecorder({
  root: els.recorder,
  getCurrentStory: () => activeStory,
  onSaved: () => renderRecordingsList({ root: els.recordings }),
  onActiveChange: (active) => timerCtl.setActive(active),
});

renderRecordingsList({ root: els.recordings });

(async function init() {
  try {
    stories = await loadIndex();
  } catch (err) {
    els.picker.innerHTML = `<p class="privacy-note">Failed to load stories: ${err.message}</p>`;
    return;
  }
  renderStoryPicker({
    root: els.picker,
    stories,
    activeId: null,
    onPick: pickStory,
  });

  if (!ttsSupported()) {
    const warn = document.createElement("p");
    warn.className = "privacy-note";
    warn.textContent =
      "This browser does not support text-to-speech. Reading will still work; voice playback will not.";
    els.reader.parentElement.insertBefore(warn, els.reader);
  }
})();

async function pickStory(id) {
  if (player) player.pause();
  try {
    activeStory = await loadStory(id);
  } catch (err) {
    els.reader.innerHTML = `<p class="privacy-note">Could not load story: ${err.message}</p>`;
    return;
  }
  readerCtl = renderStoryReader({ root: els.reader, story: activeStory });
  player = createPlayer({
    tokens: activeStory.tokens,
    onTokenStart: (i) => {
      if (highlightEnabled) readerCtl.setActiveIndex(i);
    },
    onEnd: () => {
      readerCtl.clearActive();
      timerCtl.setActive(false);
    },
  });
  player.setRate(rate);
  renderStoryPicker({
    root: els.picker,
    stories,
    activeId: id,
    onPick: pickStory,
  });
}
