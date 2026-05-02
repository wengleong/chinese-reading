// Post-recording score modal — 4 scoring categories, richer AI feedback, cute celebrations.

import {
  addSession, calculatePoints,
  hasPassedStoryBefore, getTodayAttempts,
  hasCompletedToday, getStudentStreak, getProgress,
} from "../lib/students.js";
import { isLoggedIn, generateViaApi } from '../lib/api.js';

const API_KEY_STORAGE = "anthropicApiKey";

const BADGES = [
  { id: 'first_pass',  icon: '🌟', label: 'First Pass',          mascot: '🐣', color: '#f59f00', check: (p)    => p.sessions.filter(s => s.passed).length >= 1 },
  { id: 'stories_5',  icon: '📚', label: '5 Stories',            mascot: '🦉', color: '#1971c2', check: (p)    => new Set(p.sessions.filter(s => s.passed).map(s => s.storyId)).size >= 5 },
  { id: 'perfect',    icon: '💯', label: 'Perfect Score',        mascot: '🌈', color: '#ae3ec9', check: (p)    => p.sessions.some(s => s.score >= 100) },
  { id: 'streak_7',   icon: '🔥', label: '7-Day Streak',         mascot: '🐯', color: '#e8590c', check: (p, k) => k >= 7 },
  { id: 'streak_30',  icon: '🏆', label: '30-Day Streak',        mascot: '🦁', color: '#e8590c', check: (p, k) => k >= 30 },
  { id: 'pts_100',    icon: '💎', label: '100 Points',            mascot: '🐬', color: '#1971c2', check: (p)    => p.totalPoints >= 100 },
  { id: 'pts_500',    icon: '👑', label: '500 Points',            mascot: '🦋', color: '#ae3ec9', check: (p)    => p.totalPoints >= 500 },
  { id: 'pts_1000',   icon: '🎯', label: '1000 Points',           mascot: '🐉', color: '#e03131', check: (p)    => p.totalPoints >= 1000 },
  { id: 'challenge_1', icon: '🗡️', label: '初试挑战 First Challenge', mascot: '🐺', color: '#9c36b5', check: (p) => p.sessions.some(s => s.passed && (s.storyTags || []).includes('challenge')) },
  { id: 'challenge_5', icon: '⚔️', label: '挑战达人 5 Challenges',    mascot: '🦊', color: '#6741d9', check: (p) => new Set(p.sessions.filter(s => s.passed && (s.storyTags || []).includes('challenge')).map(s => s.storyId)).size >= 5 },
  { id: 'exam_1',      icon: '🏅', label: '初上考场 Exam Debut',       mascot: '🦅', color: '#2f9e44', check: (p) => p.sessions.some(s => s.passed && (s.storyTags || []).includes('past-years')) },
  { id: 'exam_3',      icon: '🎖️', label: '考试达人 Exam Pro',          mascot: '🦉', color: '#0ca678', check: (p) => new Set(p.sessions.filter(s => s.passed && (s.storyTags || []).includes('past-years')).map(s => s.storyId)).size >= 3 },
  { id: 'picture_1',   icon: '📷', label: '看图说话 Picture Pro',        mascot: '🦜', color: '#1971c2', check: (p) => p.sessions.some(s => s.passed && s.storyType === 'picture') },
  { id: 'pb',          icon: '🌈', label: '新纪录 Personal Best',        mascot: '🐦', color: '#f59f00', check: (p) => p.sessions.some(s => s.isPersonalBest) },
  { id: 'p3_master',   icon: '📕', label: 'P3 Master',                  mascot: '🐨', color: '#2f9e44', check: (p) => ['p3-xiaomao-diaoyu','p3-huanjing','p3-jieyue','p3-shequ','p3-yundong','p3-challenge-keji','p3-challenge-zhuren'].every(id => p.sessions.some(s => s.passed && s.storyId === id)) },
  { id: 'p6_master',   icon: '📙', label: 'P6 Master',                  mascot: '🦁', color: '#e03131', check: (p) => ['p6-kexue','p6-minzu','p6-shengming','p6-zeren','p6-zixiang-maodun','p6-challenge-shuzi','p6-challenge-xinjiapo'].every(id => p.sessions.some(s => s.passed && s.storyId === id)) },
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

function animateBar(el, pct, delay = 0) {
  setTimeout(() => {
    el.style.width = `${pct}%`;
  }, delay);
}

// ---- Cute confetti ----
function spawnConfetti(container, score) {
  const GREAT  = ['🌸', '🎀', '⭐', '✨', '🌟', '💫', '🎊', '🎉', '🍀', '🦋'];
  const PASS   = ['🎉', '⭐', '✨', '🌟', '💫', '🎊'];
  const glyphs = score >= 80 ? GREAT : PASS;
  const count  = score >= 90 ? 36 : score >= 80 ? 28 : 18;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-particle';
    p.textContent = glyphs[i % glyphs.length];
    const angle = (i / count) * 360 + (Math.random() * 20 - 10);
    const dist  = 100 + Math.random() * 160;
    const size  = 20 + Math.floor(Math.random() * 14);
    p.style.cssText = [
      `--dx:${Math.round(Math.cos(angle * Math.PI / 180) * dist)}px`,
      `--dy:${Math.round(Math.sin(angle * Math.PI / 180) * dist - 100)}px`,
      `font-size:${size}px`,
      `animation-delay:${(i * 0.025).toFixed(2)}s`,
      `animation-duration:${(1.2 + Math.random() * 0.6).toFixed(2)}s`,
    ].join(';');
    container.appendChild(p);
  }
}

// ---- Badge achievement overlay (shown after score modal appears) ----
function showBadgeCelebration(badges) {
  if (!badges.length) return;
  let idx = 0;

  function showOne(badge) {
    const el = document.createElement('div');
    el.className = 'badge-celebration-overlay';
    el.innerHTML = `
      <div class="badge-cel-card">
        <div class="badge-cel-sparkles" aria-hidden="true"></div>
        <div class="badge-cel-mascot">${badge.mascot}</div>
        <div class="badge-cel-icon" style="background:${badge.color}20;border-color:${badge.color}">${badge.icon}</div>
        <div class="badge-cel-title">Achievement Unlocked!</div>
        <div class="badge-cel-name" style="color:${badge.color}">${badge.label}</div>
        <button class="badge-cel-btn primary" style="background:${badge.color}">Awesome! 🎉</button>
      </div>`;
    document.body.appendChild(el);

    // Spawn orbiting sparkles
    const sparkleStage = el.querySelector('.badge-cel-sparkles');
    const SPARKS = ['✨','⭐','🌟','💫','🎀','🌸'];
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('span');
      s.className = 'badge-sparkle';
      s.textContent = SPARKS[i % SPARKS.length];
      s.style.setProperty('--i', String(i));
      sparkleStage.appendChild(s);
    }

    // Auto-dismiss after 4s, or on button click
    const dismiss = () => {
      el.classList.add('badge-cel-out');
      setTimeout(() => { el.remove(); idx++; if (idx < badges.length) showOne(badges[idx]); }, 400);
    };
    el.querySelector('.badge-cel-btn').addEventListener('click', dismiss);
    setTimeout(dismiss, 4000);
  }

  // Slight delay so the score modal confetti finishes first
  setTimeout(() => showOne(badges[0]), 1800);
}

// ---- AI feedback (richer prompt) ----
async function getAiFeedback(storyTitle, storyText, transcript, scoreResult, fluency) {
  const { accuracy, coverage } = scoreResult;
  const prompt = `A Singapore primary school student just read this Chinese story aloud.

Story: "${storyTitle}"
Story text: ${storyText}
Speech recognition transcript: ${transcript || "(not captured)"}
Computed scores — Accuracy: ${accuracy}/100, Coverage: ${coverage}/100, Fluency: ${fluency}/100

You are a warm, encouraging Chinese reading teacher for young students.
Return JSON only (no code fences):
{
  "highlight": "one thing they did well, 1 sentence, in English",
  "feedback": "overall encouraging comment, 1-2 sentences, in English",
  "accuracy_tip": "specific tip to improve pronunciation/accuracy, or empty string if accuracy >= 80",
  "coverage_tip": "tip if they skipped parts of the story, or empty string if coverage >= 80",
  "fluency_tip": "tip about reading pace/flow, or empty string if fluency >= 75",
  "expression_score": a number 0-100 estimating reading expression and confidence based on coverage and fluency
}`;
  try {
    const body = { model: 'claude-haiku-4-5-20251001', max_tokens: 350, messages: [{ role: 'user', content: prompt }] };
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
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Singapore" });
}

// scoreResult = { accuracy, coverage, overall }
// fluency     = 0-100 from computeFluency()
export function openScoreModal({ student, story, scoreResult, fluency = 50, transcript, sessionId, onRetry, onDone, pictureFeedback = null }) {
  const score = scoreResult?.overall ?? scoreResult ?? 0; // backward-compat if bare number passed
  const accuracy  = scoreResult?.accuracy  ?? score;
  const coverage  = scoreResult?.coverage  ?? score;
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

  const { isPersonalBest } = addSession(student.id, {
    id: sessionId ?? `sess-${Date.now()}`,
    date: today, storyId: story.id, storyTitle: story.title,
    storyTags: story.tags || [],
    storyType: story.type || 'passage',
    score, passed, pointsEarned, transcript: transcript || '',
    completedAt: Date.now(),
  });

  const progressAfter = getProgress(student.id);
  const newBadges = BADGES.filter(b => !badgesBefore.has(b.id) && b.check(progressAfter, streakDays));

  const ringColor = score >= 80 ? 'var(--good)' : score >= 60 ? 'var(--accent)' : 'var(--danger)';
  const label = score >= 90 ? '优秀 Excellent! ⭐' : score >= 80 ? '很好 Great Job! 🎊' : score >= 60 ? '及格 Passed ✓' : '继续努力 Keep Trying! 💪';
  const C = (2 * Math.PI * 50).toFixed(1);

  // Category bar colour helper
  function barColor(v) { return v >= 80 ? 'var(--good)' : v >= 60 ? 'var(--accent)' : 'var(--danger)'; }

  const isPicture = story.type === 'picture';
  const cat1Label = isPicture ? '内容 Content'  : '准确性 Accuracy';
  const cat2Label = isPicture ? '语言 Language' : '完整性 Coverage';
  const cat3Label = isPicture ? '节奏 Pace'     : '流利度 Fluency';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="confetti-stage" id="score-confetti"></div>
    <div class="modal-card score-modal-v2" role="dialog" aria-modal="true">
      <button class="score-close-btn" id="score-close" aria-label="Close">✕</button>
      ${isPersonalBest ? `<div class="personal-best-banner" id="pb-banner">🏆 新纪录 Personal Best!</div>` : ''}
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

      <div class="score-categories">
        <div class="score-cat-row">
          <span class="score-cat-label">${cat1Label}</span>
          <div class="score-cat-bar-wrap"><div class="score-cat-bar" id="bar-acc" style="background:${barColor(accuracy)}"></div></div>
          <span class="score-cat-val">${accuracy}</span>
        </div>
        <div class="score-cat-row">
          <span class="score-cat-label">${cat2Label}</span>
          <div class="score-cat-bar-wrap"><div class="score-cat-bar" id="bar-cov" style="background:${barColor(coverage)}"></div></div>
          <span class="score-cat-val">${coverage}</span>
        </div>
        <div class="score-cat-row">
          <span class="score-cat-label">${cat3Label}</span>
          <div class="score-cat-bar-wrap"><div class="score-cat-bar" id="bar-flu" style="background:${barColor(fluency)}"></div></div>
          <span class="score-cat-val">${fluency}</span>
        </div>
        ${!isPicture ? `<div class="score-cat-row">
          <span class="score-cat-label">表达力 Expression</span>
          <div class="score-cat-bar-wrap"><div class="score-cat-bar" id="bar-exp" style="background:var(--muted)"></div></div>
          <span class="score-cat-val" id="exp-val">…</span>
        </div>` : ''}
      </div>

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
        </div>
      ` : `
        <div class="score-fail-block">
          <p>Score at least <strong>60</strong> to pass. You've got this! 💪</p>
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
      setTimeout(() => spawnConfetti(overlay.querySelector('#score-confetti'), score), 200);
    }
    // Animate category bars with stagger
    setTimeout(() => animateBar(overlay.querySelector('#bar-acc'), accuracy), 300);
    setTimeout(() => animateBar(overlay.querySelector('#bar-cov'), coverage), 450);
    setTimeout(() => animateBar(overlay.querySelector('#bar-flu'), fluency), 600);
  }));

  function close() { overlay.remove(); }
  overlay.querySelector('#score-retry').addEventListener('click', () => { close(); onRetry?.(); });
  overlay.querySelector('#score-done').addEventListener('click', () => { close(); onDone?.(); });
  overlay.querySelector('#score-close').addEventListener('click', () => { close(); onDone?.(); });

  if (newBadges.length) showBadgeCelebration(newBadges);

  // Fetch AI feedback — updates Expression bar + tips
  if (pictureFeedback) {
    const feedbackEl = overlay.querySelector('#score-feedback');
    if (feedbackEl) {
      feedbackEl.innerHTML = `<p class="score-feedback-text">✨ ${pictureFeedback}</p>`;
    }
  } else if (!isPicture) {
    const storyText = story.tokens.filter(t => t.pinyin).map(t => t.char).join('');
    getAiFeedback(story.title, storyText, transcript, scoreResult ?? { accuracy: score, coverage: score, overall: score }, fluency)
      .then(result => {
        if (!overlay.isConnected) return;
        const feedbackEl = overlay.querySelector('#score-feedback');
        const expVal = overlay.querySelector('#exp-val');
        const expBar = overlay.querySelector('#bar-exp');

        if (result) {
          const exp = Math.max(0, Math.min(100, result.expression_score ?? fluency));
          if (expVal) expVal.textContent = exp;
          if (expBar) {
            expBar.style.background = barColor(exp);
            animateBar(expBar, exp, 0);
          }
          const tips = [result.accuracy_tip, result.coverage_tip, result.fluency_tip].filter(Boolean);
          feedbackEl.innerHTML = `
            ${result.highlight ? `<p class="score-feedback-highlight">🌟 ${result.highlight}</p>` : ''}
            <p class="score-feedback-text">✨ ${result.feedback}</p>
            ${tips.map(t => `<p class="score-feedback-tip">💡 ${t}</p>`).join('')}`;
        } else {
          if (expVal) expVal.textContent = fluency;
          if (expBar) { expBar.style.background = barColor(fluency); animateBar(expBar, fluency, 0); }
          feedbackEl.innerHTML = `<p class="score-feedback-text">${passed
            ? '🎉 Great reading! Keep practising every day!'
            : '💪 Almost there — try again and you\'ll get it!'}</p>`;
        }
      });
  }
}
