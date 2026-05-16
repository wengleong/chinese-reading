// src/components/tingxieExamDetail.js
import { listSessions, daysUntil, getWeakWords, buildClientSchedule, todaySG } from '../lib/tingxie.js';
import { renderTingxieSession } from './tingxieSession.js';

export async function renderTingxieExamDetail({ root, student, exam, onBack }) {
  root.innerHTML = `<div class="tx-loading">Loading…</div>`;
  let sessions;
  try { sessions = await listSessions(exam.id); }
  catch (e) { root.innerHTML = `<div class="tx-error">${e.message}</div>`; return; }

  render(sessions);

  function render(sessions) {
    const today  = todaySG();
    const days   = daysUntil(exam.exam_date);
    const words  = exam.words || [];
    const weak   = getWeakWords(words, sessions);
    const schedule = exam.schedule || buildClientSchedule(exam.exam_date);

    root.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'tx-exam-detail';

    // Header
    const header = document.createElement('div');
    header.className = 'tx-detail-header';
    header.innerHTML = `
      <button class="tx-back-btn" id="tx-detail-back">‹ Back</button>
      <h2 class="tx-detail-title">${exam.title}</h2>
      <span class="tx-detail-tag">${days <= 0 ? 'Today!' : days + ' days left'}</span>`;
    el.appendChild(header);
    el.querySelector('#tx-detail-back').onclick = onBack;

    // Stats pills
    const stats = document.createElement('div');
    stats.className = 'tx-stats-row';
    stats.innerHTML = `
      <div class="tx-stat-pill"><div class="tx-stat-val">${exam.exam_date}</div><div class="tx-stat-label">Exam date</div></div>
      <div class="tx-stat-pill"><div class="tx-stat-val">${words.length}</div><div class="tx-stat-label">Words</div></div>
      <div class="tx-stat-pill"><div class="tx-stat-val">${Math.max(0, days)}</div><div class="tx-stat-label">Days left</div></div>`;
    el.appendChild(stats);

    // Revision strip — cap at 14; if schedule > 14 show first 7 + "..." + exam day cell
    const strip = document.createElement('div');
    strip.className = 'tx-strip-section';
    let stripEntries;
    if (schedule.length <= 14) {
      stripEntries = schedule;
    } else {
      const examDayCell = { date: exam.exam_date, mode: 'exam' };
      stripEntries = [...schedule.slice(0, 7), { date: '...', mode: 'ellipsis' }, examDayCell];
    }
    strip.innerHTML = `<div class="tx-section-title">REVISION SCHEDULE</div>
      <div class="tx-strip">${stripEntries.map(s => {
        if (s.mode === 'ellipsis') return `<div class="tx-strip-cell tx-strip-ellipsis">…</div>`;
        const sess = sessions.find(se => se.date === s.date);
        const isToday = s.date === today;
        let cls = 'tx-strip-cell';
        if (s.mode === 'exam') cls += ' tx-strip-exam';
        else if (isToday) cls += ' tx-strip-today';
        else if (sess) cls += ' tx-strip-done';
        else if (s.mode === 'mock') cls += ' tx-strip-mock';
        const label = s.mode === 'exam' ? '考试' : sess ? `✓<br>${sess.score}%` : isToday ? 'NOW' : s.mode === 'mock' ? 'Mock' : s.date.slice(5);
        return `<div class="${cls}">${label}</div>`;
      }).join('')}</div>`;
    el.appendChild(strip);

    // Weak words
    if (weak.length > 0) {
      const weakSec = document.createElement('div');
      weakSec.className = 'tx-weak-section';
      weakSec.innerHTML = `<div class="tx-section-title">WEAK WORDS (${weak.length})</div>
        <div class="tx-weak-chips">
          ${weak.slice(0, 6).map(w => `<span class="tx-weak-chip ${w.wrongCount >= 2 ? 'tx-weak-red' : 'tx-weak-orange'}">${w.hanzi}</span>`).join('')}
          ${weak.length > 6 ? `<span class="tx-weak-more">+${weak.length - 6} more</span>` : ''}
        </div>`;
      el.appendChild(weakSec);
    }

    // CTAs
    const ctas = document.createElement('div');
    ctas.className = 'tx-ctas';

    const practiceLabel = weak.length > 0
      ? `Practice Today's ${weak.length} Weak Words \u2192`
      : `Practice All ${words.length} Words \u2192`;

    const practiceBtn = document.createElement('button');
    practiceBtn.className = 'tx-primary-btn';
    practiceBtn.textContent = practiceLabel;
    practiceBtn.onclick = () => renderTingxieSession({ root, exam, sessions, mode: 'practice', student, onDone: onBack });

    const mockBtn = document.createElement('button');
    mockBtn.className = 'tx-secondary-btn';
    mockBtn.textContent = 'Take Full Mock Exam';
    mockBtn.onclick = () => renderTingxieSession({ root, exam, sessions, mode: 'mock', student, onDone: onBack });

    if (days <= 0) {
      // Exam day: show good luck + optional quick practice
      const luck = document.createElement('div');
      luck.className = 'tx-good-luck';
      luck.textContent = '好好加油！Good luck today!';
      ctas.appendChild(luck);
    }
    // Always show both CTAs (exam day too — student can do a final practice)
    ctas.appendChild(practiceBtn);
    ctas.appendChild(mockBtn);

    el.appendChild(ctas);
    root.appendChild(el);
  }
}
