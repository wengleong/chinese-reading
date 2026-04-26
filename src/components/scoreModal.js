// Post-recording score modal — shows AI score, points breakdown, and Claude feedback.

import {
  addSession, calculatePoints,
  hasPassedStoryBefore, getTodayAttempts,
  hasCompletedToday, getStudentStreak,
} from "../lib/students.js";

const API_KEY_STORAGE = "anthropicApiKey";

async function getAiFeedback(storyTitle, storyText, transcript, score) {
  const apiKey = localStorage.getItem(API_KEY_STORAGE);
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 220,
        messages: [{
          role: "user",
          content: `A Singapore primary school student just read this Chinese story aloud.

Story: ${storyTitle}
Story text: ${storyText}
Speech recognition transcript: ${transcript || "(not captured — microphone may not be supported)"}
Computed accuracy: ${score}/100

Write a SHORT, warm assessment for a young student. Return JSON only — no code fences:
{"feedback": "1-2 encouraging sentences in English", "tip": "one short, specific improvement tip or empty string if score >= 85"}`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let text = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(text);
  } catch { return null; }
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function openScoreModal({ student, story, score, transcript, onRetry, onDone }) {
  const passed = score >= 60;
  const today = todayIso();

  // Gamification context (before saving this session)
  const todayAttempts = getTodayAttempts(student.id, story.id);
  const wasFailedBefore = todayAttempts.some(s => !s.passed);
  const isRepeat = hasPassedStoryBefore(student.id, story.id);
  const alreadyCompletedToday = hasCompletedToday(student.id);

  // Streak: if passing for first time today, add 1 to current streak
  const currentStreak = getStudentStreak(student.id);
  const streakDays = passed && !alreadyCompletedToday ? currentStreak + 1 : currentStreak;

  const { total: pointsEarned, breakdown } = calculatePoints({
    score, isRepeat, wasFailedBefore, streakDays,
  });

  // Save session
  const session = {
    id: `sess-${Date.now()}`,
    date: today,
    storyId: story.id,
    storyTitle: story.title,
    score,
    passed,
    pointsEarned,
    transcript: transcript || "",
    completedAt: Date.now(),
  };
  addSession(student.id, session);

  // Score ring colour
  const ringColor = score >= 80 ? "var(--good)" : score >= 60 ? "var(--accent)" : "var(--danger)";
  const scoreLabel = score >= 90 ? "优秀 Excellent! ⭐" : score >= 80 ? "很好 Great!" : score >= 60 ? "及格 Passed ✓" : "继续努力 Keep trying!";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card score-modal" role="dialog" aria-modal="true">
      <div class="score-header">
        <div class="score-ring" style="--ring-color:${ringColor}; --ring-pct:${score}">
          <span class="score-number">${score}</span>
        </div>
        <div class="score-header-text">
          <div class="score-label" style="color:${ringColor}">${scoreLabel}</div>
          <div class="score-story-title">${story.title} · ${student.name}</div>
        </div>
      </div>

      ${passed ? `
        <div class="score-points-block">
          <div class="score-points-total">+${pointsEarned} 💎</div>
          <div class="score-breakdown">
            ${breakdown.map(b => `
              <div class="score-breakdown-row">
                <span>${b.label}</span><span class="score-breakdown-pts">+${b.pts}</span>
              </div>`).join("")}
          </div>
          ${streakDays > 0 ? `<div class="score-streak-msg">🔥 ${streakDays}-day streak!</div>` : ""}
        </div>
      ` : `
        <div class="score-fail-block">
          <p>Score at least <strong>60</strong> to complete today's reading.</p>
          <p>Try again — if you pass next time you'll earn a <strong>+25 perseverance bonus! 💪</strong></p>
        </div>
      `}

      <div class="score-feedback" id="score-feedback">
        <span class="score-feedback-loading">✨ Getting AI feedback…</span>
      </div>

      <div class="modal-actions">
        <button class="secondary" id="score-retry">🔄 Try Again</button>
        <button class="primary" id="score-done">Done ✓</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  function close() { overlay.remove(); }

  overlay.querySelector("#score-retry").addEventListener("click", () => { close(); onRetry && onRetry(); });
  overlay.querySelector("#score-done").addEventListener("click", () => { close(); onDone && onDone(); });

  // Fetch Claude feedback in background
  const storyText = story.tokens.filter(t => t.pinyin).map(t => t.char).join("");
  const feedbackEl = overlay.querySelector("#score-feedback");

  getAiFeedback(story.title, storyText, transcript, score).then(result => {
    if (!overlay.isConnected) return;
    if (result) {
      feedbackEl.innerHTML =
        `<p class="score-feedback-text">✨ ${result.feedback}</p>` +
        (result.tip ? `<p class="score-feedback-tip">💡 ${result.tip}</p>` : "");
    } else {
      feedbackEl.innerHTML = `<p class="score-feedback-text">${
        passed ? "🎉 Great job! Keep reading every day to build your streak!" : "💪 Don't give up — practice makes perfect!"
      }</p>`;
    }
  });
}
