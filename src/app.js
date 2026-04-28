import { loadIndex, loadStory } from "./lib/stories.js";
import { createPlayer, isSupported as ttsSupported } from "./lib/speech.js";
import { getActiveStudent, scoreTranscript } from "./lib/students.js";
import { renderStoryPicker } from "./components/storyPicker.js";
import { renderStoryReader } from "./components/storyReader.js";
import { renderPinyinToggle } from "./components/pinyinToggle.js";
import { renderPlaybackControls } from "./components/playbackControls.js";
import { renderRecorder } from "./components/recorder.js";
import { renderRecordingsList } from "./components/recordingsList.js";
import { renderDailyTimer } from "./components/dailyTimer.js";
import { renderStudentPanel } from "./components/studentPanel.js";
import { openScoreModal } from "./components/scoreModal.js";
import { renderSettingsButton } from "./components/settings.js";
import { isLoggedIn } from './lib/api.js';
import { syncDown } from './lib/cloud.js';
import { showFamilyOnboarding } from './components/familyOnboarding.js';

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
  if (e.target?.id === "install-btn" && deferredInstall) {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    e.target.hidden = true;
  }
});

const els = {
  studentPanel: document.getElementById("student-panel"),
  picker: document.getElementById("story-picker"),
  reader: document.getElementById("story-reader"),
  pinyinToggle: document.getElementById("pinyin-toggle"),
  highlightToggle: document.getElementById("highlight-toggle"),
  playback: document.getElementById("playback-controls"),
  recorder: document.getElementById("recorder"),
  recordings: document.getElementById("recordings-list"),
  timer: document.getElementById("daily-timer"),
  settingsBtn: document.getElementById("settings-btn"),
};

let stories = [];
let activeStory = null;
let readerCtl = null;
let player = null;
let rate = 0.9;
let highlightEnabled = true;

const timerCtl = renderDailyTimer({ root: els.timer });
renderSettingsButton({ root: els.settingsBtn });

// Student panel — refresh on student change to update stats display
let studentPanelCtl = renderStudentPanel({
  root: els.studentPanel,
  onStudentChange: () => studentPanelCtl?.refresh(),
});

renderPinyinToggle({ root: els.pinyinToggle, readerRoot: els.reader });

// Highlight toggle
(function () {
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
    if (!highlightEnabled) readerCtl?.clearActive();
  });
})();

renderPlaybackControls({
  root: els.playback,
  onPlay: () => { timerCtl.setActive(true); player?.play(); },
  onPause: () => { player?.pause(); timerCtl.setActive(false); },
  onRestart: () => { player?.restart(); readerCtl?.clearActive(); },
  onRateChange: (v) => { rate = v; player?.setRate(v); },
});

renderRecorder({
  root: els.recorder,
  getCurrentStory: () => activeStory,
  getActiveStudent: () => getActiveStudent(),
  onSaved: () => renderRecordingsList({ root: els.recordings }),
  onActiveChange: (active) => timerCtl.setActive(active),
  onStart: () => els.reader.scrollIntoView({ behavior: 'smooth', block: 'center' }),
  onComplete: ({ transcript, story, sessionId }) => {
    const student = getActiveStudent();
    if (!student || !story) return;
    const score = scoreTranscript(story.tokens, transcript);
    openScoreModal({
      student, story, score, transcript, sessionId,
      onRetry: () => {},
      onDone: () => studentPanelCtl?.refresh(),
    });
    studentPanelCtl?.refresh();
  },
});

renderRecordingsList({ root: els.recordings });

(async function init() {
  if (!isLoggedIn()) {
    await new Promise(resolve => {
      showFamilyOnboarding({
        onDone: async () => { await syncDown(); resolve(); },
        onSkip: resolve,
      });
    });
  } else {
    syncDown().catch(() => {});
  }

  try {
    stories = await loadIndex();
  } catch (err) {
    els.picker.innerHTML = `<p class="privacy-note">Failed to load stories: ${err.message}</p>`;
    return;
  }
  renderStoryPicker({ root: els.picker, stories, activeId: null, onPick: pickStory });

  if (!ttsSupported()) {
    const warn = document.createElement("p");
    warn.className = "privacy-note";
    warn.textContent = "This browser does not support text-to-speech. Reading will still work; voice playback will not.";
    els.reader.parentElement.insertBefore(warn, els.reader);
  }
})();

async function pickStory(id) {
  player?.pause();
  try {
    activeStory = await loadStory(id);
  } catch (err) {
    els.reader.innerHTML = `<p class="privacy-note">Could not load story: ${err.message}</p>`;
    return;
  }
  readerCtl = renderStoryReader({ root: els.reader, story: activeStory });
  player = createPlayer({
    tokens: activeStory.tokens,
    onTokenStart: (i) => { if (highlightEnabled) readerCtl.setActiveIndex(i); },
    onEnd: () => { readerCtl.clearActive(); timerCtl.setActive(false); },
  });
  player.setRate(rate);
  renderStoryPicker({ root: els.picker, stories, activeId: id, onPick: pickStory });
}
