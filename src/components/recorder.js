// Camera + mic recorder with canvas compositing overlay.
// Draws camera feed + cute story overlay onto a canvas at 30fps.
// Records from canvas.captureStream() so the overlay is baked into the video.
// SpeechRecognition (zh-CN) auto-advances the story teleprompter as student reads.

import { saveRecording } from "../lib/storage.js";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

// roundRect polyfill for Safari < 15.4
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

function pickMimeType() {
  for (const t of ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

function buildSentences(tokens) {
  const END = new Set(["。", "！", "？"]);
  const segs = [];
  let cur = [];
  for (const t of tokens) {
    cur.push(t);
    if (END.has(t.char) || t.char === "\n") { segs.push(cur); cur = []; }
  }
  if (cur.length) segs.push(cur);
  return segs;
}

// ---- Celebration particle ----
class Star {
  constructor(W, H) {
    this.x = W / 2 + (Math.random() - 0.5) * 340;
    this.y = H / 2 + (Math.random() - 0.5) * 200;
    this.vx = (Math.random() - 0.5) * 9;
    this.vy = -Math.random() * 11 - 3;
    this.life = 1;
    this.decay = 0.022 + Math.random() * 0.016;
    this.glyph = ["⭐", "✨", "🌟", "💫", "🎉", "🎊"][Math.floor(Math.random() * 6)];
    this.size = 20 + Math.random() * 24;
  }
  tick() { this.x += this.vx; this.y += this.vy; this.vy += 0.45; this.life -= this.decay; }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.font = `${Math.round(this.size)}px serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(this.glyph, this.x, this.y);
    ctx.restore();
  }
}

// ---- Canvas overlay renderer ----
const CW = 640, CH = 480;
const FONT = `"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`;

class Overlay {
  constructor(story) {
    this.sentences = buildSentences(story.tokens);
    this.title = story.title;
    this.level = story.level || "";
    this.idx = 0;
    this.stars = [];
    this.pulse = 0; // scale pulse on sentence change
  }

  get total() { return this.sentences.length; }
  get currentText() { return (this.sentences[this.idx] || []).map(t => t.char).join(""); }

  advance() {
    if (this.idx < this.total - 1) {
      this.idx++;
      this.pulse = 1;
      for (let i = 0; i < 12; i++) this.stars.push(new Star(CW, CH));
      return true;
    }
    return false;
  }

  draw(ctx, videoEl) {
    // 1. Camera frame
    ctx.drawImage(videoEl, 0, 0, CW, CH);

    // 2. Soft vignette around edges
    const vig = ctx.createRadialGradient(CW / 2, CH * 0.5, CH * 0.22, CW / 2, CH * 0.5, CH * 0.78);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, CW, CH);

    // 3. Overlay elements
    this._topBar(ctx);
    this._progressDots(ctx);
    this._bottomBar(ctx);
    this._decorCorners(ctx);

    // 4. Particles
    this.stars = this.stars.filter(s => s.life > 0);
    for (const s of this.stars) { s.tick(); s.draw(ctx); }

    // 5. Decay pulse
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - 0.08);
  }

  _topBar(ctx) {
    const PAD = 10, HB = 50;
    const g = ctx.createLinearGradient(0, 0, CW, 0);
    g.addColorStop(0, "rgba(232,89,12,0.93)");
    g.addColorStop(1, "rgba(174,62,201,0.93)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(PAD, PAD, CW - PAD * 2, HB, 12); ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = `bold 20px ${FONT}`;
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText("📚 " + this.title, PAD + 12, PAD + HB / 2);

    if (this.level) {
      ctx.font = `bold 13px sans-serif`;
      const bw = ctx.measureText(this.level).width + 20;
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath(); ctx.roundRect(CW - PAD - bw - 4, PAD + 10, bw, 30, 8); ctx.fill();
      ctx.fillStyle = "white"; ctx.textAlign = "right";
      ctx.fillText(this.level, CW - PAD - 14, PAD + HB / 2);
    }
    ctx.textAlign = "left";
  }

  _progressDots(ctx) {
    const n = this.total;
    if (n <= 1) return;
    const R = 5, GAP = 16;
    const totalW = n * R * 2 + (n - 1) * (GAP - R * 2);
    let x = (CW - totalW) / 2 + R;
    const y = CH - 98;

    for (let i = 0; i < n; i++) {
      const isActive = i === this.idx;
      const r = isActive ? R + this.pulse * 3 : R;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#ffd700"
        : i < this.idx ? "rgba(47,158,68,0.9)"
        : "rgba(255,255,255,0.35)";
      ctx.fill();
      x += GAP;
    }
  }

  _bottomBar(ctx) {
    const PAD = 10, BAR_H = 84, y = CH - BAR_H - PAD;
    const scale = 1 + this.pulse * 0.025;

    ctx.save();
    ctx.translate(CW / 2, y + BAR_H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-CW / 2, -(y + BAR_H / 2));

    ctx.fillStyle = "rgba(0,0,0,0.74)";
    ctx.beginPath(); ctx.roundRect(PAD, y, CW - PAD * 2, BAR_H, 12); ctx.fill();

    const text = this.currentText;
    ctx.fillStyle = "rgba(255,210,120,0.9)";
    ctx.font = "12px sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(`${this.idx + 1} / ${this.total}`, CW - PAD - 12, y + 8);

    ctx.fillStyle = "white"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const maxW = CW - PAD * 2 - 24;
    ctx.font = `bold 23px ${FONT}`;
    if (ctx.measureText(text).width > maxW) {
      ctx.font = `bold 17px ${FONT}`;
      const mid = Math.ceil(text.length / 2);
      ctx.fillText(text.slice(0, mid), PAD + 12, y + BAR_H * 0.34);
      ctx.fillText(text.slice(mid), PAD + 12, y + BAR_H * 0.7);
    } else {
      ctx.fillText(text, PAD + 12, y + BAR_H / 2 + 4);
    }
    ctx.restore();
    ctx.textAlign = "left";
  }

  _decorCorners(ctx) {
    // Subtle corner emoji accents
    ctx.font = "22px serif";
    ctx.textBaseline = "top"; ctx.globalAlpha = 0.55;
    ctx.fillText("🌸", 12, 68);
    ctx.textBaseline = "bottom"; ctx.textAlign = "right";
    ctx.fillText("🌸", CW - 12, CH - 98);
    ctx.globalAlpha = 1; ctx.textAlign = "left";
  }
}

// ---- Recorder component ----
export function renderRecorder({ root, getCurrentStory, onSaved, onActiveChange, onComplete }) {
  root.innerHTML = "";
  const card = document.createElement("div");
  card.className = "recorder";

  // Canvas: shown to student, records composite
  const canvas = document.createElement("canvas");
  canvas.width = CW; canvas.height = CH;
  canvas.className = "recorder-canvas";

  // Hidden video drives canvas frames
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.autoplay = true;
  video.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";

  const stack = document.createElement("div");
  stack.className = "controls-stack";

  const startBtn = document.createElement("button");
  startBtn.className = "primary"; startBtn.textContent = "🎬 开始录像 Start";

  const stopBtn = document.createElement("button");
  stopBtn.className = "danger"; stopBtn.textContent = "■ 停止 Stop & Score"; stopBtn.disabled = true;

  const nextBtn = document.createElement("button");
  nextBtn.className = "secondary"; nextBtn.textContent = "→ 下一句 Next sentence";
  nextBtn.disabled = true; nextBtn.hidden = true;

  const indicator = document.createElement("div");
  indicator.className = "recording-indicator"; indicator.style.visibility = "hidden";
  indicator.innerHTML = '<span class="dot"></span><span>录制中 REC</span>';

  const note = document.createElement("p");
  note.className = "privacy-note";
  note.textContent = "Overlay is baked into your recording. Recordings stay on this device only.";

  stack.appendChild(startBtn); stack.appendChild(stopBtn);
  stack.appendChild(nextBtn); stack.appendChild(indicator); stack.appendChild(note);
  card.appendChild(canvas); card.appendChild(video); card.appendChild(stack);
  root.appendChild(card);

  const ctx = canvas.getContext("2d");
  let stream = null, recorder = null, chunks = [], startedAt = 0, mimeType = "";
  let recognition = null, transcript = "";
  let overlay = null, animId = null;

  // Draw loop: runs while camera is open
  function drawLoop() {
    if (video.readyState >= 2) {
      if (overlay) {
        overlay.draw(ctx, video);
      } else {
        ctx.drawImage(video, 0, 0, CW, CH);
      }
    }
    animId = requestAnimationFrame(drawLoop);
  }

  async function start() {
    const story = getCurrentStory?.();
    if (!story) { alert("请先选择一个故事 (Pick a story first)."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { alert("Camera not supported."); return; }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: CW, height: CH } });
    } catch (err) { alert("Could not access camera/mic: " + err.message); return; }

    video.srcObject = stream;
    overlay = new Overlay(story);

    if (animId) cancelAnimationFrame(animId);
    drawLoop();

    // Build recording stream: canvas + audio
    let recStream = stream; // fallback
    try {
      recStream = canvas.captureStream(30);
      const audio = stream.getAudioTracks()[0];
      if (audio) recStream.addTrack(audio);
    } catch { /* canvas.captureStream not supported — use raw stream */ }

    mimeType = pickMimeType();
    try {
      recorder = mimeType ? new MediaRecorder(recStream, { mimeType }) : new MediaRecorder(recStream);
    } catch { recorder = new MediaRecorder(stream); }

    // Speech recognition: transcript + auto-advance teleprompter
    transcript = "";
    if (SR) {
      try {
        recognition = new SR();
        recognition.lang = "zh-CN";
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              const t = e.results[i][0].transcript;
              transcript += t;
              if ((t.match(/[\u4e00-\u9fff]/g) || []).length >= 2) overlay?.advance();
            }
          }
        };
        recognition.onerror = () => {};
        recognition.start();
      } catch { recognition = null; }
    }

    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      try { recognition?.stop(); } catch {}
      recognition = null;
      const story = getCurrentStory?.();
      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      const durationMs = Date.now() - startedAt;
      try {
        await saveRecording({ storyId: story?.id, storyTitle: story?.title, blob, mimeType: blob.type, durationMs });
        onSaved?.();
      } catch (err) { console.warn("Save failed:", err.message); }

      stopStream();
      overlay = null;
      indicator.style.visibility = "hidden";
      startBtn.disabled = false; stopBtn.disabled = true;
      nextBtn.disabled = true; nextBtn.hidden = true;
      onActiveChange?.(false);
      onComplete?.({ transcript, story });
    };

    recorder.start();
    startedAt = Date.now();
    startBtn.disabled = true; stopBtn.disabled = false;
    nextBtn.disabled = false; nextBtn.hidden = false;
    indicator.style.visibility = "visible";
    onActiveChange?.(true);
  }

  function stop() {
    if (recorder?.state !== "inactive") recorder?.stop();
  }

  function stopStream() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    stream?.getTracks().forEach(t => t.stop());
    stream = null; video.srcObject = null;
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, CW, CH);
  }

  nextBtn.addEventListener("click", () => overlay?.advance());
  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
}
