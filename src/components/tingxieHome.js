// src/components/tingxieHome.js
import { listExams, daysUntil, todaySG } from '../lib/tingxie.js';
import { showTingxieUpload } from './tingxieUpload.js';
import { renderTingxieExamDetail } from './tingxieExamDetail.js';

export async function renderTingxieHome({ root, student }) {
  root.innerHTML = `<div class="tx-loading">Loading exams…</div>`;
  let exams;
  try { exams = await listExams(student.id); }
  catch (e) { root.innerHTML = `<div class="tx-error">${e.message}</div>`; return; }

  // Current calendar month state
  let calYear  = new Date().getFullYear();
  let calMonth = new Date().getMonth(); // 0-indexed

  render();

  function render() {
    root.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'tx-home';
    el.appendChild(buildCalendar());
    el.appendChild(buildUpcomingSection());
    root.appendChild(el);
  }

  function buildCalendar() {
    const cal = document.createElement('div');
    cal.className = 'tx-calendar';

    const todayStr = todaySG();
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay  = new Date(calYear, calMonth + 1, 0);
    const examDates = new Set(exams.map(e => e.exam_date));
    const scheduledDates = {};
    exams.forEach(exam => (exam.schedule || []).forEach(s => { scheduledDates[s.date] = s.mode; }));

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    cal.innerHTML = `
      <div class="tx-cal-header">
        <button class="tx-cal-nav" id="tx-cal-prev">‹</button>
        <span class="tx-cal-title">${MONTHS[calMonth]} ${calYear}</span>
        <button class="tx-cal-nav" id="tx-cal-next">›</button>
      </div>
      <div class="tx-cal-grid">
        <span class="tx-cal-dow">M</span><span class="tx-cal-dow">T</span><span class="tx-cal-dow">W</span>
        <span class="tx-cal-dow">T</span><span class="tx-cal-dow">F</span><span class="tx-cal-dow">S</span><span class="tx-cal-dow">S</span>
      </div>`;

    cal.querySelector('#tx-cal-prev').onclick = () => {
      if (calMonth === 0) { calYear--; calMonth = 11; } else calMonth--;
      render();
    };
    cal.querySelector('#tx-cal-next').onclick = () => {
      if (calMonth === 11) { calYear++; calMonth = 0; } else calMonth++;
      render();
    };

    const grid = cal.querySelector('.tx-cal-grid');
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    for (let i = 0; i < startDow; i++) {
      const s = document.createElement('span'); s.className = 'tx-cal-day tx-cal-empty'; grid.appendChild(s);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const cell = document.createElement('span');
      cell.className = 'tx-cal-day';
      cell.textContent = d;
      if (dateStr === todayStr) cell.classList.add('tx-cal-today');
      if (examDates.has(dateStr)) cell.classList.add('tx-cal-exam');
      else if (scheduledDates[dateStr] === 'practice') cell.classList.add('tx-cal-practice');
      else if (scheduledDates[dateStr] === 'mock') cell.classList.add('tx-cal-mock');
      grid.appendChild(cell);
    }

    const legend = document.createElement('div');
    legend.className = 'tx-cal-legend';
    legend.innerHTML = `<span class="tx-leg-practice">● Practice</span><span class="tx-leg-mock">● Mock</span><span class="tx-leg-exam">◉ Exam</span>`;
    cal.appendChild(legend);
    return cal;
  }

  function buildUpcomingSection() {
    const sec = document.createElement('div');
    sec.className = 'tx-upcoming';
    sec.innerHTML = `<div class="tx-section-title">UPCOMING EXAMS</div>`;

    const visible = exams
      .filter(e => daysUntil(e.exam_date) > -7)
      .sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date));

    if (!visible.length) {
      sec.innerHTML += `<p class="tx-empty">No exams yet — upload an exam paper to get started.</p>`;
    }
    visible.forEach(exam => {
      const days = daysUntil(exam.exam_date);
      const color = days <= 2 ? '#e03131' : days <= 5 ? '#ae3ec9' : '#e8590c';
      const chip = document.createElement('div');
      chip.className = 'tx-exam-chip';
      chip.style.borderLeftColor = color;
      chip.innerHTML = `
        <div>
          <div class="tx-chip-title">${exam.title}</div>
          <div class="tx-chip-meta">Exam ${exam.exam_date} · ${days <= 0 ? 'Today!' : days + ' days left'}</div>
        </div>
        <span style="color:${color}">›</span>`;
      chip.onclick = () => renderTingxieExamDetail({
        root, student, exam,
        onBack: () => render(),
      });
      sec.appendChild(chip);
    });

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'tx-upload-cta';
    uploadBtn.textContent = '+ Upload New Exam Paper';
    uploadBtn.onclick = () => showTingxieUpload({
      studentId: student.id,
      onDone: (newExam) => { exams.push(newExam); render(); },
      onCancel: () => {},
    });
    sec.appendChild(uploadBtn);
    return sec;
  }
}
