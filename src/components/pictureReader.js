// Displays a scene card for picture/video oral stories.
// For 'picture': shows illustration + description prompt.
// For 'video': shows YouTube embed + collapsible SCFRAS hints panel.
// Phase 0: main content + description prompt.
// Phase 1-3: compact view + question counter + question text.
// Returns { setActiveIndex(){}, clearActive(){}, setPhase(phase, questionText) }.

export function renderPictureReader({ root, story }) {
  root.innerHTML = '';
  const isVideo = story.type === 'video';

  const card = document.createElement('div');
  card.className = 'picture-reader-card';

  const title = document.createElement('h2');
  title.className = 'story-title';
  title.textContent = story.title;

  // Media: YouTube iframe or static image
  let mediaEl;
  if (isVideo) {
    const videoWrap = document.createElement('div');
    videoWrap.className = 'video-embed-wrap';
    const iframe = document.createElement('iframe');
    iframe.className = 'video-embed';
    iframe.src = `https://www.youtube.com/embed/${story.youtubeId}`;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('title', story.title);
    videoWrap.appendChild(iframe);
    mediaEl = videoWrap;
  } else {
    const imgPath = `stories/images/${story.id}.jpg`;
    const storyImg = document.createElement('img');
    storyImg.className = 'picture-illustration';
    storyImg.alt = story.title;
    storyImg.addEventListener('load', () => { storyImg.hidden = false; });
    storyImg.addEventListener('error', () => { storyImg.hidden = true; });
    storyImg.hidden = true;
    storyImg.src = imgPath;
    mediaEl = storyImg;
  }

  // Channel credit — video only
  let creditEl = null;
  if (isVideo && story.channel) {
    creditEl = document.createElement('p');
    creditEl.className = 'video-credit';
    const link = document.createElement('a');
    link.href = story.channelUrl || `https://www.youtube.com`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = story.channel;
    creditEl.append('Video by ', link, ' on YouTube');
  }

  // Step counter — always visible
  const questionCounter = document.createElement('p');
  questionCounter.className = 'picture-question-counter';
  questionCounter.textContent = isVideo
    ? '录音 1 / 4 · 看视频说话 Describe the video'
    : '录音 1 / 4 · 看图说话 Describe the picture';

  // Phase 0 description prompt
  const prompt = document.createElement('p');
  prompt.className = 'picture-prompt';
  prompt.textContent = isVideo
    ? '观看视频后，用中文描述视频内容及你的看法。Watch the video, then describe it in Chinese.'
    : '请用中文描述以上图片内容。Describe what you see in Chinese.';

  // Question card — phases 1-3
  const questionCard = document.createElement('div');
  questionCard.className = 'picture-question-card';
  questionCard.hidden = true;

  // Hints panel — video only
  // Phase 0: SCFRAS structure hints for the description
  // Phase 1-3: generic Q&A answering tips
  const QA_HINTS = [
    '直接回答问题 Answer the question directly',
    '说出你的理由或感受 Give a reason or feeling',
    '联系你的亲身经历 Relate to your own experience',
    '用完整的句子 Use complete sentences',
  ];

  let hintsPanel = null;
  let hintsBody = null;
  let hintsToggle = null;
  const hasHintContent = isVideo && (story.scene || (Array.isArray(story.hints) && story.hints.length > 0));
  if (hasHintContent) {
    hintsPanel = document.createElement('div');
    hintsPanel.className = 'scfras-hints';

    hintsToggle = document.createElement('button');
    hintsToggle.className = 'scfras-toggle secondary';
    hintsToggle.textContent = '💡 答题提示 Hints ▾';
    hintsToggle.setAttribute('aria-expanded', 'false');

    hintsBody = document.createElement('div');
    hintsBody.className = 'scfras-body';
    hintsBody.hidden = true;

    hintsToggle.addEventListener('click', () => {
      const willExpand = hintsBody.hidden;
      hintsBody.hidden = !willExpand;
      hintsToggle.setAttribute('aria-expanded', String(willExpand));
      hintsToggle.textContent = willExpand ? '💡 答题提示 Hints ▴' : '💡 答题提示 Hints ▾';
    });

    hintsPanel.appendChild(hintsToggle);
    hintsPanel.appendChild(hintsBody);
  }

  function buildPhase0HintsBody() {
    hintsBody.innerHTML = '';
    if (story.scene) {
      const sceneP = document.createElement('p');
      sceneP.className = 'scfras-scene';
      sceneP.textContent = story.scene;
      hintsBody.appendChild(sceneP);
    }
    if (Array.isArray(story.hints) && story.hints.length > 0) {
      const list = document.createElement('ul');
      list.className = 'scfras-list';
      for (const h of story.hints) {
        const li = document.createElement('li');
        li.textContent = h;
        list.appendChild(li);
      }
      hintsBody.appendChild(list);
    }
  }

  function buildQaHintsBody() {
    hintsBody.innerHTML = '';
    const list = document.createElement('ul');
    list.className = 'scfras-list';
    for (const h of QA_HINTS) {
      const li = document.createElement('li');
      li.textContent = h;
      list.appendChild(li);
    }
    hintsBody.appendChild(list);
  }

  if (hasHintContent) buildPhase0HintsBody();

  // DOM order: title → media → credit → step counter → prompt/question → hints
  card.appendChild(title);
  card.appendChild(mediaEl);
  if (creditEl) card.appendChild(creditEl);
  card.appendChild(questionCounter);
  card.appendChild(prompt);
  card.appendChild(questionCard);
  if (hintsPanel) card.appendChild(hintsPanel);
  root.appendChild(card);

  function setPhase(phase, questionText) {
    if (phase === 0) {
      prompt.hidden = false;
      questionCard.hidden = true;
      questionCounter.textContent = isVideo
        ? '录音 1 / 4 · 看视频说话 Describe the video'
        : '录音 1 / 4 · 看图说话 Describe the picture';
      if (hintsBody) buildPhase0HintsBody();
    } else {
      prompt.hidden = true;
      questionCard.hidden = false;
      questionCard.textContent = questionText || '';
      questionCounter.textContent = `录音 ${phase + 1} / 4 · 第${phase}题 Question ${phase}`;
      if (hintsBody) buildQaHintsBody();
    }
    // Collapse hints when switching phase so student sees the new content on open
    if (hintsBody && hintsToggle) {
      hintsBody.hidden = true;
      hintsToggle.setAttribute('aria-expanded', 'false');
      hintsToggle.textContent = '💡 答题提示 Hints ▾';
    }
  }

  return {
    setActiveIndex() {},
    clearActive() {},
    setPhase,
  };
}
