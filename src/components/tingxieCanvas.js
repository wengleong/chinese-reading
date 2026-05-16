// src/components/tingxieCanvas.js
import { canvasToBase64 } from '../lib/tingxie.js';

export function createCharCanvas() {
  const SIZE = 240;
  const wrapper = document.createElement('div');
  wrapper.className = 'tx-canvas-wrapper';

  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  canvas.className = 'tx-canvas';
  canvas.style.touchAction = 'none';

  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasStrokes = false;

  function drawGrid() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = '#e8e0d8'; ctx.lineWidth = 1;
    // Horizontal + vertical center
    ctx.beginPath(); ctx.moveTo(0, SIZE/2); ctx.lineTo(SIZE, SIZE/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(SIZE/2, 0); ctx.lineTo(SIZE/2, SIZE); ctx.stroke();
    // Diagonals
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(SIZE, SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(SIZE, 0); ctx.lineTo(0, SIZE); ctx.stroke();
    // Outer border
    ctx.strokeStyle = '#d0c8be'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE-2, SIZE-2);
    // Inner square
    const m = SIZE/4;
    ctx.strokeStyle = '#e8e0d8'; ctx.lineWidth = 1;
    ctx.strokeRect(m, m, SIZE - m*2, SIZE - m*2);
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (SIZE / rect.width),
      y: (touch.clientY - rect.top) * (SIZE / rect.height),
    };
  }

  function startDraw(e) {
    e.preventDefault(); drawing = true;
    const { x, y } = getPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 6;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }
  function draw(e) {
    if (!drawing) return; e.preventDefault();
    const { x, y } = getPos(e);
    ctx.lineTo(x, y); ctx.stroke(); hasStrokes = true;
  }
  function endDraw(e) { e.preventDefault(); drawing = false; }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', endDraw, { passive: false });

  drawGrid();
  wrapper.appendChild(canvas);

  return {
    el: wrapper,
    getBase64() { return canvasToBase64(canvas); },
    clear() { hasStrokes = false; drawGrid(); },
    isEmpty() { return !hasStrokes; },
  };
}
