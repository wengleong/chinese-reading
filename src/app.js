import { loadIndex, loadStory } from "./lib/stories.js";
import { createPlayer, isSupported as ttsSupported } from "./lib/speech.js";
import { renderStoryPicker } from "./components/storyPicker.js";
import { renderStoryReader } from "./components/storyReader.js";
import { renderPinyinToggle } from "./components/pinyinToggle.js";
import { renderPlaybackControls } from "./components/playbackControls.js";
import { renderRecorder } from "./components/recorder.js";
import { renderRecordingsList } from "./components/recordingsList.js";
import { renderDailyTimer } from "./components/dailyTimer.js";

const els = {
  picker: document.getElementById("story-picker"),
  reader: document.getElementById("story-reader"),
  pinyinToggle: document.getElementById("pinyin-toggle"),
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

const timerCtl = renderDailyTimer({ root: els.timer });

renderPinyinToggle({ root: els.pinyinToggle, readerRoot: els.reader });

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
    onTokenStart: (i) => readerCtl.setActiveIndex(i),
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
