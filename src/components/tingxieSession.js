// src/components/tingxieSession.js
import { createCharCanvas } from './tingxieCanvas.js';
import {
  gradeCharacter, gradeBatch, saveSession, computeWordQueue, todaySG, canvasToBase64, countMasteredWords,
} from '../lib/tingxie.js';
import { addTingxieSession, getProgress } from '../lib/students.js';
import { STATIC_BADGES, getEarnedBadgeIds } from '../lib/badges.js';

// opts: { root, exam, sessions, mode, student, onDone }
export function renderTingxieSession({ root, exam, sessions, mode, student, onDone }) {
  if (!navigator.maxTouchPoints) {
    root.innerHTML = `<div class="tx-error-fullpage">听写练习需要触屏设备 — Please use a phone or tablet.</div>`;
    return;
  }

  const wordQueue = mode === 'mock'
    ? shuffleArr(exam.words.slice())
    : computeWordQueue(exam.words, sessions);

  const mockCollected = []; // { word, items: [{hanzi, imageB64}] }
  let practiceResults = []; // { hanzi, correct, imageB64, tip }
  let practicePoints = 0;

  showWord(0);

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function showWord(idx) {
    if (idx >= wordQueue.length) {
      return mode === 'mock' ? finalizeMock() : finalizePractice();
    }

    const word = wordQueue[idx];
    const chars = [...word.hanzi];

    root.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'tx-session';

    // Progress
    const prog = document.createElement('div');
    prog.className = 'tx-progress';
    prog.innerHTML = `<span>Word ${idx + 1} of ${wordQueue.length}</span>
      <div class="tx-progress-dots">${wordQueue.map((_, i) =>
        `<span class="tx-dot ${i < idx ? 'done' : i === idx ? 'active' : ''}"></span>`
      ).join('')}</div>`;
    el.appendChild(prog);

    // Word presentation
    const pres = document.createElement('div');
    pres.className = 'tx-word-presentation';

    if (mode === 'practice') {
      pres.innerHTML = `<div class="tx-word-display">
        <div class="tx-hanzi-large">${word.hanzi}</div>
        <div class="tx-pinyin-large">${word.pinyin || ''}</div>
      </div>`;
      if (word.type === 'moxie') {
        // Flash then hide after max(3s, charCount x 1.5s)
        const flashMs = Math.max(3000, chars.length * 1500);
        setTimeout(() => {
          const disp = el.querySelector('.tx-word-display');
          if (disp) disp.style.opacity = '0';
        }, flashMs);
      }
    } else {
      // Mock mode: never show the word text
      if (word.type === 'moxie') {
        // Brief flash then hide
        pres.innerHTML = `<div class="tx-word-display tx-mock-flash">
          <div class="tx-hanzi-large">${word.hanzi}</div>
        </div>
        <div class="tx-mode-label">默写 — Write from memory</div>`;
        const flashMs = Math.max(2000, chars.length * 1000);
        setTimeout(() => {
          const disp = el.querySelector('.tx-mock-flash');
          if (disp) disp.style.display = 'none';
        }, flashMs);
      } else {
        pres.innerHTML = `<div class="tx-mode-label tx-mock-label">听写 — Listen carefully</div>`;
      }
    }
    el.appendChild(pres);

    // TTS replay for tingxie
    if (word.type !== 'moxie') {
      playTTS(word.hanzi);
      const replay = document.createElement('button');
      replay.className = 'tx-replay-btn';
      replay.textContent = '🔊 Replay';
      replay.onclick = () => playTTS(word.hanzi);
      el.appendChild(replay);
    }

    // Canvas area
    const canvasArea = document.createElement('div');
    canvasArea.className = 'tx-canvas-area';
    const charCanvases = chars.map(() => createCharCanvas());
    charCanvases.forEach(cc => canvasArea.appendChild(cc.el));
    el.appendChild(canvasArea);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'tx-session-controls';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'tx-clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.onclick = () => charCanvases.forEach(cc => cc.clear());

    const submitBtn = document.createElement('button');
    submitBtn.className = 'tx-submit-btn';
    submitBtn.textContent = 'Submit';
    submitBtn.onclick = async () => {
      if (charCanvases.every(cc => cc.isEmpty())) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Grading...';
      if (mode === 'practice') {
        await gradePracticeWord(el, word, chars, charCanvases, idx);
      } else {
        mockCollected.push({ word, items: chars.map((ch, i) => ({ hanzi: ch, imageB64: charCanvases[i].getBase64() })) });
        showWord(idx + 1);
      }
    };
    controls.appendChild(clearBtn);
    controls.appendChild(submitBtn);
    el.appendChild(controls);

    if (mode === 'mock') {
      const warn = document.createElement('p');
      warn.className = 'tx-nav-warning';
      warn.textContent = 'If you leave now your mock exam will not be saved.';
      el.appendChild(warn);
    }

    root.appendChild(el);
  }

  async function gradePracticeWord(el, word, chars, charCanvases, idx) {
    const wordResults = [];
    let allCorrect = true;

    for (let i = 0; i < chars.length; i++) {
      const imageB64 = charCanvases[i].getBase64();
      const result = await gradeCharacter({ studentId: student.id, hanzi: chars[i], imageB64 });
      wordResults.push({ hanzi: chars[i], correct: result.correct, imageB64, tip: result.tip });
      if (!result.correct) allCorrect = false;
      charCanvases[i].el.classList.add(result.correct ? 'tx-canvas-correct' : 'tx-canvas-wrong');
    }

    practiceResults.push(...wordResults);
    if (allCorrect) practicePoints += 3;

    const banner = document.createElement('div');
    banner.className = allCorrect ? 'tx-result-correct' : 'tx-result-wrong';

    if (allCorrect) {
      banner.innerHTML = `<span>Correct! +3 💎</span>`;
      el.appendChild(banner);
      setTimeout(() => showWord(idx + 1), 1200);
    } else {
      const firstWrong = wordResults.find(r => !r.correct);
      banner.innerHTML = `<span>Try again</span>
        ${firstWrong?.tip ? `<div class="tx-tip">💡 ${firstWrong.tip}</div>` : ''}`;
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tx-retry-btn';
      retryBtn.textContent = 'Try Again';
      retryBtn.onclick = () => showWord(idx);
      banner.appendChild(retryBtn);
      el.appendChild(banner);
    }
  }

  async function finalizeMock() {
    root.innerHTML = `<div class="tx-grading-msg">Grading your exam...</div>`;

    const allItems = mockCollected.flatMap(m => m.items);
    const batchResults = await gradeBatch(student.id, allItems);

    let bIdx = 0;
    const wordResults = mockCollected.map(m => {
      const charResults = m.items.map(() => batchResults[bIdx++]);
      return {
        hanzi: m.word.hanzi,
        correct: charResults.every(r => r.correct),
        charResults,
        imageB64: m.items[0]?.imageB64,
      };
    });

    const correctCount = wordResults.filter(r => r.correct).length;
    const total = wordResults.length;
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = score >= 80;

    // Compute points
    let points = 0;
    if (passed) points += 80;
    if (score >= 90 && score < 100) points += 40;
    if (score === 100) points += 80;

    // Personal best check
    const prevProgress = getProgress(student.id);
    const examStoryId = `tingxie-${exam.id}`;
    const prevBest = Math.max(0, ...prevProgress.sessions
      .filter(s => s.storyId === examStoryId && s.passed)
      .map(s => s.score));
    if (passed && score > prevBest) points += 25;
    const prevBadgeIds = getEarnedBadgeIds(prevProgress, 0);

    // Save to cloud
    await saveSession({
      examId: exam.id, studentId: student.id,
      date: todaySG(), mode: 'mock',
      results: wordResults.map(r => ({ hanzi: r.hanzi, correct: r.correct, attempts: 1, imageB64: r.imageB64 })),
      score,
    });

    // Bridge to localStorage gamification
    const masteredWordCount = countMasteredWords(sessions);
    const scheduleCompleted = isScheduleCompleted(exam.schedule, sessions, todaySG());
    addTingxieSession(student.id, exam.id, {
      passed, score, pointsEarned: points, date: todaySG(), mode: 'mock',
      masteredWordCount, scheduleCompleted,
    });
    checkAndShowBadges(prevBadgeIds);

    showMockResults({ wordResults, score, passed, correctCount, total, points });
  }

  async function finalizePractice() {
    const score = practiceResults.length > 0
      ? Math.round(practiceResults.filter(r => r.correct).length / practiceResults.length * 100)
      : 100;
    const totalPts = 20 + practicePoints + (score === 100 ? 30 : 0);

    await saveSession({
      examId: exam.id, studentId: student.id,
      date: todaySG(), mode: 'practice',
      results: practiceResults.map(r => ({ hanzi: r.hanzi, correct: r.correct, attempts: 1, imageB64: r.imageB64 })),
      score,
    });

    const prevProgressForBadges = getProgress(student.id);
    const prevBadgeIds = getEarnedBadgeIds(prevProgressForBadges, 0);
    const masteredWordCount = countMasteredWords(sessions);
    const scheduleCompleted = isScheduleCompleted(exam.schedule, sessions, todaySG());
    addTingxieSession(student.id, exam.id, {
      passed: true, score, pointsEarned: totalPts, date: todaySG(), mode: 'practice',
      masteredWordCount, scheduleCompleted,
    });
    checkAndShowBadges(prevBadgeIds);

    root.innerHTML = `<div class="tx-results tx-practice-done">
      <div class="tx-results-header tx-passed">
        <div class="tx-score-big">Session Complete! 🎉</div>
        <div class="tx-points-earned">+${totalPts} 💎</div>
      </div>
      <button class="tx-primary-btn" id="tx-practice-done">Done</button>
    </div>`;
    root.querySelector('#tx-practice-done').onclick = onDone;
  }

  function showMockResults({ wordResults, score, passed, correctCount, total, points }) {
    root.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'tx-results';
    el.innerHTML = `
      <div class="tx-results-header ${passed ? 'tx-passed' : 'tx-failed'}">
        <div class="tx-score-big">${correctCount} / ${total}</div>
        <div class="tx-score-pct">${score}% — ${passed ? '通过 Passed! 🎉' : '未通过 — Keep practising!'}</div>
        <div class="tx-score-bar"><div class="tx-score-fill" style="width:${score}%"></div></div>
        <div class="tx-points-earned">+${points} 💎</div>
      </div>
      <ul class="tx-results-list">
        ${wordResults.map(r => `
          <li class="tx-result-row ${r.correct ? 'correct' : 'wrong'}">
            <span>${r.correct ? '✓' : '✗'}</span>
            <span class="tx-result-hanzi">${r.hanzi}</span>
          </li>`).join('')}
      </ul>`;

    const doneBtn = document.createElement('button');
    doneBtn.className = 'tx-primary-btn';
    doneBtn.textContent = 'Done';
    doneBtn.onclick = onDone;
    el.appendChild(doneBtn);
    root.appendChild(el);

    if (passed) spawnTingxieConfetti(el.querySelector('.tx-results-header'), score);
  }

  // Returns true if all scheduled dates up to today have a corresponding session.
  function isScheduleCompleted(schedule, completedSessions, todayDate) {
    if (!schedule?.length) return false;
    const sessionDates = new Set(completedSessions.map(s => s.date));
    sessionDates.add(todayDate); // today's session was just saved
    const dueDates = schedule.filter(e => e.date <= todayDate).map(e => e.date);
    return dueDates.length > 0 && dueDates.every(d => sessionDates.has(d));
  }

  function checkAndShowBadges(prevIds) {
    const progress = getProgress(student.id);
    const streak = 0;
    const nowIds = getEarnedBadgeIds(progress, streak);
    const newBadges = STATIC_BADGES.filter(b => nowIds.has(b.id) && !prevIds.has(b.id));
    if (newBadges.length) showBadgeCelebration(newBadges);
  }

  function playTTS(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'zh-CN'; utt.rate = 0.85;
    window.speechSynthesis.speak(utt);
  }

  // Inline confetti (replicates scoreModal.js pattern)
  function spawnTingxieConfetti(container, score) {
    const glyphs = score >= 90 ? ['🎉','⭐','✨','🌟','💫','🎊','🍀','🦋'] : ['🎉','⭐','✨','🌟'];
    const count  = score >= 90 ? 28 : 18;
    const stage = document.createElement('div');
    stage.className = 'confetti-stage';
    container.appendChild(stage);
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-particle';
      p.textContent = glyphs[i % glyphs.length];
      const angle = (i / count) * 360;
      const dist = 80 + Math.random() * 120;
      p.style.cssText = [
        `--dx:${Math.round(Math.cos(angle * Math.PI / 180) * dist)}px`,
        `--dy:${Math.round(Math.sin(angle * Math.PI / 180) * dist - 80)}px`,
        `font-size:${18 + Math.floor(Math.random() * 10)}px`,
        `animation-delay:${(i * 0.03).toFixed(2)}s`,
        `animation-duration:${(1.0 + Math.random() * 0.6).toFixed(2)}s`,
      ].join(';');
      stage.appendChild(p);
    }
  }

  // Inline badge celebration (replicates scoreModal.js pattern)
  function showBadgeCelebration(badges) {
    if (!badges.length) return;
    let idx = 0;
    function showOne(badge) {
      const el = document.createElement('div');
      el.className = 'badge-celebration-overlay';
      el.innerHTML = `<div class="badge-cel-card">
        <div class="badge-cel-sparkles" aria-hidden="true"></div>
        <div class="badge-cel-mascot">${badge.mascot}</div>
        <div class="badge-cel-icon" style="background:${badge.color}20;border-color:${badge.color}">${badge.icon}</div>
        <div class="badge-cel-title">Achievement Unlocked!</div>
        <div class="badge-cel-name" style="color:${badge.color}">${badge.label}</div>
        <button class="badge-cel-btn primary" style="background:${badge.color}">Awesome! 🎉</button>
      </div>`;
      document.body.appendChild(el);
      const dismiss = () => {
        el.classList.add('badge-cel-out');
        setTimeout(() => { el.remove(); idx++; if (idx < badges.length) showOne(badges[idx]); }, 400);
      };
      el.querySelector('.badge-cel-btn').addEventListener('click', dismiss);
      setTimeout(dismiss, 4000);
    }
    setTimeout(() => showOne(badges[0]), 800);
  }
}
