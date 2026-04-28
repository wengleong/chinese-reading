// Post-recording score modal — shows AI score, points breakdown, and Claude feedback.

import {
  addSession, calculatePoints,
  hasPassedStoryBefore, getTodayAttempts,
  hasCompletedToday, getStudentStreak, getProgress,
} from "../lib/students.js";
import { isLoggedIn, generateViaApi } from '../lib/api.js';

const API_KEY_STORAGE = "anthropicApiKey";

const BADGES = [
  { id: 'first_pass',  icon: '🌟', label: 'First Pass',     check: (p)    => p.sessions.filter(s => s.passed).length >= 1 },
  { id: 'stories_5',  icon: '📚', label: '5 Stories',       check: (p)    => new Set(p.sessions.filter(s => s.passed).map(s => s.storyId)).size >= 5 },
  { id: 'perfect',    icon: '💯', label: 'Perfect Score',   check: (p)    => p.sessions.some(s => s.score >= 100) },
  { id: 'streak_7',   icon: '🔥', label: '7-Day Streak',    check: (p, k) => k >= 7 },
  { id: 'streak_30',  icon: '🏆', label: '30-Day Streak',   check: (p, k) => k >= 30 },
  { id: 'pts_100',    icon: '💎', label: '100 Points',       check: (p)    => p.totalPoints >= 100 },
  { id: 'pts_500',    icon: '👑', label: '500 Points',       check: (p)    => p.totalPoints >= 500 },
  { id: 'pts_1000',   icon: '🎯', label: '1000 Points',      check: (p)    => p.totalPoints >= 1000 },
];

function getEarnedBadgeIds(progress, streak) {
  return new Set(BADGES.filter(b => b.check(progress, streak)).map(b => b.id));
}

function animateCount(el, to, duration = 900) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function spawnConfetti(container) {
  const GLYPHS = ['🎉', '⭐', '✨', '🌟', '💫', '🎊', '🏅'];
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-particle';
    p.textContent = GLYPHS[i % GLYPHS.length];
    const angle = (i / 22) * 360;
    const dist = 120 + Math.random() * 120;
    p.style.cssText = `--dx:${Math.round(Math.cos(angle * Math.PI / 180) * dist)}px;--dy:${Math.round(Math.sin(angle * Math.PI / 180) * dist - 80)}px;animation-delay:${(i * 0.03).toFixed(2)}s`;
    container.appendChild(p);
  }
}

async function getAiFeedback(storyTitle, storyText, transcript, score) {
  const prompt = `A Singapore primary school student just read this Chinese story aloud.

Story: ${storyTitle}
Story text: ${storyText}
Speech recognition transcript: ${transcript || "(not captured — microphone may not be supported)"}
Computed accuracy: ${score}/100

Write a SHORT, warm assessment for a young student. Return JSON only — no code fences:
{"feedback": "1-2 encouraging sentences in English", "tip": "one short, specific improvement tip or empty string if score >= 85"}`;
  try {
    const body = { model: 'claude-haiku-4-5-20251001', max_tokens: 220, messages: [{ role: 'user', content: prompt }] };
    let data;
    if (isLoggedIn()) {
      data = await generateViaApi(body);
    } else {
      const apiKey = localStorage.getItem(API_KEY_STORAGE);
      if (!apiKey) return null;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return null;
      data = await r.json();
    }
    let text = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(text);
  } catch { return null; }
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function openScoreModal({ student, story, score, transcript, sessionId, onRetry, onDone }) {
  const passed = score >= 60;
  const today = todayIso();

  const todayAttempts = getTodayAttempts(student.id, story.id);
  const wasFailedBefore = todayAttempts.some(s => !s.passed);
  const isRepeat = hasPassedStoryBefore(student.id, story.id);
  const alreadyCompletedToday = hasCompletedToday(student.id);
  const currentStreak = getStudentStreak(student.id);
  const streakDays = passed && !alreadyCompletedToday ? currentStreak + 1 : currentStreak;
  const { total: pointsEarned, breakdown } = calculatePoints({ score, isRepeat, wasFailedBefore, streakDays });

  const progressBefore = getProgress(student.id);
  const badgesBefore = getEarnedBadgeIds(progressBefore, currentStreak);

  addSession(student.id, {
    id: sessionId ?? `sess-${Date.now()}`,
    date: today, storyId: story.id, storyTitle: story.title,
    score, passed, pointsEarned, transcript: transcript || '',
    completedAt: Date.now(),
  });

  const progressAfter = getProgress(student.id);
  const newBadges = BADGES.filter(b => !badgesBefore.has(b.id) && b.check(progressAfter, streakDays));

  const ringColor = score >= 80 ? 'var(--good)' : score >= 60 ? 'var(--accent)' : 'var(--danger)';
  const label = score >= 90 ? '优秀 Excellent! ⭐' : score >= 80 ? '很好 Great Job! 🎊' : score >= 60 ? '及格 Passed ✓' : '继续努力 Keep Trying! 💪';
  const C = (2 * Math.PI * 50).toFixed(1);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="confetti-stage" id="score-confetti"></div>
    <div class="modal-card score-modal-v2" role="dialog" aria-modal="true">
      <div class="score-hero">
        <svg class="score-ring-svg" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="score-ring-track" cx="60" cy="60" r="50"/>
          <circle class="score-ring-arc" id="score-arc" cx="60" cy="60" r="50"
            style="stroke:${ringColor};stroke-dasharray:${C};stroke-dashoffset:${C}"/>
        </svg>
        <div class="score-hero-center">
          <span class="score-big-num" id="score-num">0</span>
          <span class="score-pct">/100</span>
        </div>
      </div>
      <div class="score-label" style="color:${ringColor}">${label}</div>
      <div class="score-byline">${story.title} · ${student.name}</div>
      ${passed ? `
        <div class="score-pass-block">
          <div class="score-pts-big">+<span id="score-pts">0</span> 💎</div>
          <div class="score-breakdown">
            ${breakdown.map((b, i) => `
              <div class="score-bd-row" style="animation-delay:${(1.1 + i * 0.12).toFixed(2)}s">
                <span>${b.label}</span><span class="score-bd-pts">+${b.pts}</span>
              </div>`).join('')}
          </div>
          ${streakDays > 0 ? `<div class="score-streak"><span class="streak-flame">🔥</span>${streakDays}-day streak!</div>` : ''}
          ${newBadges.length ? `
            <div class="score-badge-block">
              <div class="score-badge-title">🏅 Badge Unlocked!</div>
              ${newBadges.map(b => `<div class="score-badge-row"><span>${b.icon}</span><span>${b.label}</span></div>`).join('')}
            </div>` : ''}
        </div>
      ` : `
        <div class="score-fail-block">
          <p>Score at least <strong>60</strong> to complete today's reading.</p>
          <p>Pass next time for a <strong>+25 perseverance bonus! 💪</strong></p>
        </div>
      `}
      <div class="score-feedback" id="score-feedback"><span class="score-feedback-loading">✨ Getting feedback…</span></div>
      <div class="modal-actions">
        <button class="secondary" id="score-retry">🔄 Try Again</button>
        <button class="primary" id="score-done">Done ✓</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const arc = overlay.querySelector('#score-arc');
    if (arc) arc.style.strokeDashoffset = (parseFloat(C) * (1 - score / 100)).toFixed(1);
    animateCount(overlay.querySelector('#score-num'), score);
    if (passed) {
      setTimeout(() => animateCount(overlay.querySelector('#score-pts'), pointsEarned), 800);
      setTimeout(() => spawnConfetti(overlay.querySelector('#score-confetti')), 200);
    }
  }));

  function close() { overlay.remove(); }
  overlay.querySelector('#score-retry').addEventListener('click', () => { close(); onRetry?.(); });
  overlay.querySelector('#score-done').addEventListener('click', () => { close(); onDone?.(); });

  const storyText = story.tokens.filter(t => t.pinyin).map(t => t.char).join('');
  getAiFeedback(story.title, storyText, transcript, score).then(result => {
    if (!overlay.isConnected) return;
    const el = overlay.querySelector('#score-feedback');
    el.innerHTML = result
      ? `<p class="score-feedback-text">✨ ${result.feedback}</p>${result.tip ? `<p class="score-feedback-tip">💡 ${result.tip}</p>` : ''}`
      : `<p class="score-feedback-text">${passed ? '🎉 Great job! Keep reading every day!' : '💪 Don\'t give up — practice makes perfect!'}</p>`;
  });
}
