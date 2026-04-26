export function renderPlaybackControls({ root, onPlay, onPause, onRestart, onRateChange }) {
  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "controls";

  const playBtn = document.createElement("button");
  playBtn.className = "primary";
  playBtn.textContent = "▶ 朗读 Read";

  const pauseBtn = document.createElement("button");
  pauseBtn.className = "secondary";
  pauseBtn.textContent = "⏸ 暂停 Pause";

  const restartBtn = document.createElement("button");
  restartBtn.className = "secondary";
  restartBtn.textContent = "⟲ 重读 Restart";

  const speedWrap = document.createElement("label");
  speedWrap.className = "speed-slider";
  const speedLabel = document.createElement("span");
  speedLabel.textContent = "速度";
  const speedInput = document.createElement("input");
  speedInput.type = "range";
  speedInput.min = "0.5";
  speedInput.max = "1.3";
  speedInput.step = "0.05";
  speedInput.value = "0.9";
  const speedValue = document.createElement("span");
  speedValue.textContent = "0.9x";
  speedWrap.appendChild(speedLabel);
  speedWrap.appendChild(speedInput);
  speedWrap.appendChild(speedValue);

  wrap.appendChild(playBtn);
  wrap.appendChild(pauseBtn);
  wrap.appendChild(restartBtn);
  wrap.appendChild(speedWrap);
  root.appendChild(wrap);

  playBtn.addEventListener("click", () => onPlay && onPlay());
  pauseBtn.addEventListener("click", () => onPause && onPause());
  restartBtn.addEventListener("click", () => onRestart && onRestart());
  speedInput.addEventListener("input", () => {
    const v = parseFloat(speedInput.value);
    speedValue.textContent = `${v.toFixed(2)}x`;
    onRateChange && onRateChange(v);
  });
}
