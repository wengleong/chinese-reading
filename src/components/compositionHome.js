// Composition mode: pick a level and language, get an exam-style prompt sheet.
// English = one topic with three pictures (use any, all or none).
// Chinese = the real paper's choice of two: 命题作文 or 看图作文 (5 panels + a
// blank 6th the child invents, plus 8 reference words).

import { loadCompositionIndex, loadComposition, compositionImagePath } from '../lib/compositions.js';

const LEVELS = ['P3', 'P4', 'P5', 'P6'];

let activeLang = null;    // null = both, 'zh' | 'en'
let activeLevel = null;

export async function renderCompositionHome({ root }) {
  root.innerHTML = `<div class="comp-loading">Loading composition topics…</div>`;

  let papers;
  try {
    papers = await loadCompositionIndex();
  } catch (err) {
    root.innerHTML = `<div class="comp-error">${err.message}</div>`;
    return;
  }

  renderList();

  function renderList() {
    root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'comp-home';

    const heading = document.createElement('h2');
    heading.className = 'comp-heading';
    heading.textContent = '📝 作文 Composition';
    wrap.appendChild(heading);

    const hint = document.createElement('p');
    hint.className = 'comp-hint';
    hint.textContent = '选一个题目，用纸笔写作文。 Pick a topic, then write your composition on paper.';
    wrap.appendChild(hint);

    wrap.appendChild(makeFilterBar([
      ['全部 Both', null], ['中文 Chinese', 'zh'], ['English', 'en'],
    ], () => activeLang, (v) => { activeLang = v; renderList(); }));

    wrap.appendChild(makeFilterBar(
      [['All', null], ...LEVELS.map(l => [l, l])],
      () => activeLevel, (v) => { activeLevel = v; renderList(); }));

    const list = document.createElement('div');
    list.className = 'comp-list';
    const visible = papers.filter(p =>
      (!activeLang || p.lang === activeLang) && (!activeLevel || p.level === activeLevel));

    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'comp-hint';
      empty.textContent = 'No topics for this filter yet.';
      list.appendChild(empty);
    }

    for (const p of visible) {
      const btn = document.createElement('button');
      btn.className = 'comp-card';
      const tag = p.lang === 'en'
        ? '<span class="lang-badge">EN</span>'
        : '<span class="lang-badge lang-badge-zh">中</span>';
      btn.innerHTML = `${tag} <span class="comp-card-title">${p.title}</span>
        <span class="comp-card-meta">${p.level} · ${p.timeMinutes} min</span>`;
      btn.addEventListener('click', () => openPaper(p.id));
      list.appendChild(btn);
    }
    wrap.appendChild(list);
    root.appendChild(wrap);
  }

  function makeFilterBar(options, getActive, onPick) {
    const bar = document.createElement('div');
    bar.className = 'filter-bar';
    for (const [label, value] of options) {
      const btn = document.createElement('button');
      btn.className = 'filter-tab' + (getActive() === value ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => onPick(value));
      bar.appendChild(btn);
    }
    return bar;
  }

  async function openPaper(id) {
    root.innerHTML = `<div class="comp-loading">Loading…</div>`;
    let paper;
    try {
      paper = await loadComposition(id);
    } catch (err) {
      root.innerHTML = `<div class="comp-error">${err.message}</div>`;
      return;
    }

    root.innerHTML = '';
    const sheet = document.createElement('div');
    sheet.className = 'comp-sheet';

    const back = document.createElement('button');
    back.className = 'secondary comp-back';
    back.textContent = '← 返回 Back';
    back.addEventListener('click', renderList);
    sheet.appendChild(back);

    const head = document.createElement('div');
    head.className = 'comp-sheet-head';
    head.innerHTML = `<span class="comp-level">${paper.level}</span>
      <span class="comp-time">⏱ ${paper.timeMinutes} 分钟 min</span>`;
    sheet.appendChild(head);

    const instructions = document.createElement('p');
    instructions.className = 'comp-instructions';
    instructions.textContent = paper.instructions;
    sheet.appendChild(instructions);

    if (paper.lang === 'en') {
      sheet.appendChild(buildEnglishPaper(paper));
    } else {
      sheet.appendChild(buildChinesePaper(paper));
    }

    const footer = document.createElement('p');
    footer.className = 'comp-hint comp-footer';
    footer.textContent = paper.lang === 'en'
      ? 'Now write your composition on paper. Plan first — beginning, middle, end.'
      : '现在用纸笔写作文。先想好开头、经过和结尾。';
    sheet.appendChild(footer);

    root.appendChild(sheet);
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function buildEnglishPaper(paper) {
    const box = document.createElement('div');

    const topic = document.createElement('h3');
    topic.className = 'comp-topic';
    topic.textContent = paper.topic;
    box.appendChild(topic);

    box.appendChild(buildImage(paper, 'Three pictures for the topic'));

    if (paper.guidingQuestions?.length) {
      box.appendChild(buildList('Think about:', paper.guidingQuestions));
    }
    return box;
  }

  function buildChinesePaper(paper) {
    const box = document.createElement('div');

    for (const q of paper.questions) {
      const qBox = document.createElement('div');
      qBox.className = 'comp-question';

      const qHead = document.createElement('h3');
      qHead.className = 'comp-topic';
      qHead.textContent = `第${q.no}题 · ${q.type}`;
      qBox.appendChild(qHead);

      if (q.type === '命题作文') {
        const title = document.createElement('p');
        title.className = 'comp-zh-title';
        title.textContent = `《${q.title}》`;
        qBox.appendChild(title);
        if (q.hints?.length) qBox.appendChild(buildList('提示 Hints:', q.hints));
      } else {
        qBox.appendChild(buildImage(paper, '看图作文 — 五幅图和一幅空白图'));
        if (q.note) {
          const note = document.createElement('p');
          note.className = 'comp-note';
          note.textContent = q.note;
          qBox.appendChild(note);
        }
        if (q.referenceWords?.length) {
          const words = document.createElement('div');
          words.className = 'comp-words';
          words.innerHTML = `<span class="comp-words-label">参考词语 Reference words:</span>`;
          for (const w of q.referenceWords) {
            const chip = document.createElement('span');
            chip.className = 'comp-word';
            chip.textContent = w;
            words.appendChild(chip);
          }
          qBox.appendChild(words);
        }
      }
      box.appendChild(qBox);
    }
    return box;
  }

  function buildImage(paper, alt) {
    const img = document.createElement('img');
    img.className = 'comp-image';
    img.alt = alt;
    img.loading = 'lazy';
    img.src = compositionImagePath(paper);
    return img;
  }

  function buildList(label, items) {
    const wrap = document.createElement('div');
    wrap.className = 'comp-hints';
    const h = document.createElement('p');
    h.className = 'comp-hints-label';
    h.textContent = label;
    wrap.appendChild(h);
    const ul = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    return wrap;
  }
}
