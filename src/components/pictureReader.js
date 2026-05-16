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

  // Phase 0 description prompt
  const prompt = document.createElement('p');
  prompt.className = 'picture-prompt';
  prompt.textContent = isVideo
    ? '观看视频后，用中文描述视频内容及你的看法。Watch the video, then describe it in Chinese.'
    : '请用中文描述以上图片内容。Describe what you see in Chinese.';

  const hint = document.createElement('p');
  hint.className = 'picture-hint';
  hint.textContent = story.scene || '';

  // SCFRAS hints panel — video only, collapsed by default
  let hintsPanel = null;
  if (isVideo && Array.isArray(story.hints) && story.hints.length > 0) {
    hintsPanel = document.createElement('div');
    hintsPanel.className = 'scfras-hints';

    const toggle = document.createElement('button');
    toggle.className = 'scfras-toggle secondary';
    toggle.textContent = '💡 答题提示 Hints ▾';
    toggle.setAttribute('aria-expanded', 'false');

    const list = document.createElement('ul');
    list.className = 'scfras-list';
    list.hidden = true;

    for (const h of story.hints) {
      const li = document.createElement('li');
      li.textContent = h;
      list.appendChild(li);
    }

    toggle.addEventListener('click', () => {
      const willExpand = list.hidden;
      list.hidden = !willExpand;
      toggle.setAttribute('aria-expanded', String(willExpand));
      toggle.textContent = willExpand ? '💡 答题提示 Hints ▴' : '💡 答题提示 Hints ▾';
    });

    hintsPanel.appendChild(toggle);
    hintsPanel.appendChild(list);
  }

  // Step counter — shown in all phases
  const questionCounter = document.createElement('p');
  questionCounter.className = 'picture-question-counter';
  questionCounter.textContent = isVideo
    ? '录音 1 / 4 · 看视频说话 Describe the video'
    : '录音 1 / 4 · 看图说话 Describe the picture';

  const questionCard = document.createElement('div');
  questionCard.className = 'picture-question-card';
  questionCard.hidden = true;

  card.appendChild(title);
  card.appendChild(mediaEl);
  card.appendChild(prompt);
  card.appendChild(hint);
  if (hintsPanel) card.appendChild(hintsPanel);
  card.appendChild(questionCounter);
  card.appendChild(questionCard);
  root.appendChild(card);

  function setPhase(phase, questionText) {
    if (phase === 0) {
      prompt.hidden = false;
      hint.hidden = false;
      if (hintsPanel) hintsPanel.hidden = false;
      questionCounter.textContent = isVideo
        ? '录音 1 / 4 · 看视频说话 Describe the video'
        : '录音 1 / 4 · 看图说话 Describe the picture';
      questionCard.hidden = true;
    } else {
      prompt.hidden = true;
      hint.hidden = true;
      if (hintsPanel) hintsPanel.hidden = false;
      questionCounter.textContent = `录音 ${phase + 1} / 4 · 第${phase}题 Question ${phase}`;
      questionCard.hidden = false;
      questionCard.textContent = questionText || '';
    }
  }

  return {
    setActiveIndex() {},
    clearActive() {},
    setPhase,
  };
}
