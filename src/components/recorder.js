// Camera + mic recorder using MediaRecorder. Saves to IndexedDB via storage.js.

import { saveRecording } from "../lib/storage.js";

function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const t of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported &&
      MediaRecorder.isTypeSupported(t)
    ) {
      return t;
    }
  }
  return "";
}

export function renderRecorder({ root, getCurrentStory, onSaved, onActiveChange }) {
  root.innerHTML = "";
  const card = document.createElement("div");
  card.className = "recorder";

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;

  const stack = document.createElement("div");
  stack.className = "controls-stack";

  const startBtn = document.createElement("button");
  startBtn.className = "primary";
  startBtn.textContent = "🎬 开始录像 Start";

  const stopBtn = document.createElement("button");
  stopBtn.className = "danger";
  stopBtn.textContent = "■ 停止 Stop";
  stopBtn.disabled = true;

  const indicator = document.createElement("div");
  indicator.className = "recording-indicator";
  indicator.style.visibility = "hidden";
  indicator.innerHTML = '<span class="dot"></span><span>录制中 REC</span>';

  const note = document.createElement("p");
  note.className = "privacy-note";
  note.textContent =
    "Recordings stay on this device only. Ask a parent or teacher to review before sharing.";

  stack.appendChild(startBtn);
  stack.appendChild(stopBtn);
  stack.appendChild(indicator);
  stack.appendChild(note);

  card.appendChild(video);
  card.appendChild(stack);
  root.appendChild(card);

  let stream = null;
  let recorder = null;
  let chunks = [];
  let startedAt = 0;
  let mimeType = "";

  async function start() {
    const story = getCurrentStory && getCurrentStory();
    if (!story) {
      alert("请先选择一个故事 (Pick a story first).");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("This browser does not support media recording.");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 480 },
      });
    } catch (err) {
      alert("Could not access camera/mic: " + err.message);
      return;
    }
    video.srcObject = stream;

    mimeType = pickMimeType();
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      alert("MediaRecorder failed to start: " + err.message);
      stopStream();
      return;
    }
    chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      const durationMs = Date.now() - startedAt;
      try {
        await saveRecording({
          storyId: story.id,
          storyTitle: story.title,
          blob,
          mimeType: blob.type,
          durationMs,
        });
        onSaved && onSaved();
      } catch (err) {
        alert("Failed to save recording: " + err.message);
      }
      stopStream();
      indicator.style.visibility = "hidden";
      startBtn.disabled = false;
      stopBtn.disabled = true;
      onActiveChange && onActiveChange(false);
    };

    recorder.start();
    startedAt = Date.now();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    indicator.style.visibility = "visible";
    onActiveChange && onActiveChange(true);
  }

  function stop() {
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function stopStream() {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    stream = null;
    video.srcObject = null;
  }

  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
}
