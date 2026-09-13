// Post-recording score modal — 4 scoring categories, richer AI feedback, cute celebrations.

import {
  addSession, calculatePoints,
  hasPassedStoryBefore, getTodayAttempts,
  hasCompletedToday, getStudentStreak, getProgress,
} from "../lib/students.js";
import { isLoggedIn, generateViaApi } from '../lib/api.js';
import { STATIC_BADGES, getEarnedBadgeIds, getWeeklyTargets } from '../lib/badges.js';
import { isEnglish, passageText } from '../lib/english.js';


const BADGES = STATIC_BADGES;

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

// MOE English oral, Reading Aloud component. The examiner marks three things:
// pronunciation & articulation, fluency & rhythm (pace, phrasing, pausing at
// punctuation), and expression (stress, intonation, conveying meaning).
// The transcript is what speech recognition heard, so it evidences words
// read/skipped — not the child's accent. Say so, or the model invents
// pronunciation faults it cannot possibly have observed.
function englishReadAloudPrompt(storyTitle, storyText, transcript, accuracy, coverage, fluency) {
  return `A Singapore primary school student just read this English passage aloud for oral practice.

Passage: "${storyTitle}"
Passage text: ${storyText}
Speech recognition transcript: ${transcript || "(not captured)"}
Computed scores — Word accuracy: ${accuracy}/100, Coverage: ${coverage}/100, Fluency: ${fluency}/100

You are a warm, encouraging Singapore primary school English teacher marking the
Reading Aloud component of the MOE English oral examination. The three marking
criteria are:
1. Pronunciation and articulation — clear consonants and vowel sounds, word endings not dropped.
2. Fluency and rhythm — smooth pace, sensible phrasing, pausing at commas and full stops.
3. Expression — stress and intonation that convey the meaning and mood of the passage.

Judge only from the evidence you have: the transcript shows which words were read,
misread or skipped. You CANNOT hear accent or tone, so never claim a specific sound
was mispronounced unless the transcript shows that word came out as a different word.
Write to the child, in simple encouraging English.

Return JSON only (no code fences):
{
  "highlight": "one specific thing they did well, 1 sentence",
  "feedback": "overall encouraging comment tied to the reading, 1-2 sentences",
  "accuracy_tip": "tip on pronunciation/articulation naming an actual word from the passage they misread, or empty string if accuracy >= 80",
  "coverage_tip": "tip if they skipped or rushed past parts of the passage, or empty string if coverage >= 80",
  "fluency_tip": "tip about pace, phrasing or pausing at punctuation, or empty string if fluency >= 75",
  "expression_score": a number 0-100 for expression and confidence, based on coverage and fluency
}`;
}

// ---- AI feedback (richer prompt) ----
async function getAiFeedback(storyTitle, storyText, transcript, scoreResult, fluency, english = false) {
  const { accuracy, coverage } = scoreResult;
  const prompt = english
    ? englishReadAloudPrompt(storyTitle, storyText, transcript, accuracy, coverage, fluency)
    : `A Singapore primary school student just read this Chinese story aloud.

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
    // Server-side only — the AI key is the server's and never reaches a browser.
    if (!isLoggedIn()) return null;
    const data = await generateViaApi({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      messages: [{ role: 'user', content: prompt }],
    });
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

  const isOral = story.type === 'picture' || story.type === 'video';
  const cat1Label = isOral ? '内容 Content'  : '准确性 Accuracy';
  const cat2Label = isOral ? '语言 Language' : '完整性 Coverage';
  const cat3Label = isOral ? '表达 Expression' : '流利度 Fluency';

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
        ${!isOral ? `<div class="score-cat-row">
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
  if (isOral) {
    const feedbackEl = overlay.querySelector('#score-feedback');
    if (feedbackEl) {
      feedbackEl.innerHTML = pictureFeedback
        ? `<p class="score-feedback-text">✨ ${pictureFeedback}</p>`
        : `<p class="score-feedback-text">${passed ? '好极了！继续加油！Keep it up!' : '再试一次，你一定能做到！Try again!'}</p>`;
    }
  } else if (!isOral) {
    const storyText = isEnglish(story)
      ? passageText(story)
      : story.tokens.filter(t => t.pinyin).map(t => t.char).join('');
    getAiFeedback(story.title, storyText, transcript, scoreResult ?? { accuracy: score, coverage: score, overall: score }, fluency, isEnglish(story))
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
