// Displays a scene card for picture description stories.
// Phase 0: full scene card + description prompt.
// Phase 1-3: compact scene + question counter + question text.
// Returns { setActiveIndex(){}, clearActive(){}, setPhase(phase, questionText) }.

export function renderPictureReader({ root, story }) {
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'picture-reader-card';

  const title = document.createElement('h2');
  title.className = 'story-title';
  title.textContent = story.title;

  // Illustration image (if available) — shown prominently above scene grid
  const imgPath = `stories/images/${story.id}.jpg`;
  const storyImg = document.createElement('img');
  storyImg.className = 'picture-illustration';
  storyImg.alt = story.title;
  storyImg.hidden = true; // shown once loaded successfully
  // Listeners must be attached before setting src — if the image is cached,
  // the load event fires synchronously during src assignment.
  storyImg.addEventListener('load', () => { storyImg.hidden = false; scene.hidden = true; });
  storyImg.addEventListener('error', () => { storyImg.hidden = true; scene.hidden = false; });
  storyImg.src = imgPath;

  // Scene grid — rendered once, CSS class toggled for compact mode
  const scene = document.createElement('div');
  scene.className = 'picture-scene';
  for (const part of (story.sceneParts || [])) {
    const item = document.createElement('div');
    item.className = 'picture-scene-item';
    const emoji = document.createElement('span');
    emoji.className = 'scene-emoji';
    emoji.textContent = part.emoji;
    const label = document.createElement('span');
    label.className = 'scene-label';
    label.textContent = part.label;
    item.appendChild(emoji);
    item.appendChild(label);
    scene.appendChild(item);
  }

  // Phase 0 elements
  const prompt = document.createElement('p');
  prompt.className = 'picture-prompt';
  prompt.textContent = '请描述以下图片的内容：';

  const hint = document.createElement('p');
  hint.className = 'picture-hint';
  hint.textContent = story.scene || '';

  // Phase 1-3 elements (hidden initially)
  const questionCounter = document.createElement('p');
  questionCounter.className = 'picture-question-counter';
  questionCounter.hidden = true;

  const questionCard = document.createElement('div');
  questionCard.className = 'picture-question-card';
  questionCard.hidden = true;

  card.appendChild(title);
  card.appendChild(storyImg);
  card.appendChild(scene);
  card.appendChild(prompt);
  card.appendChild(hint);
  card.appendChild(questionCounter);
  card.appendChild(questionCard);
  root.appendChild(card);

  function setPhase(phase, questionText) {
    if (phase === 0) {
      storyImg.classList.remove('compact');
      scene.classList.remove('picture-scene-compact');
      prompt.hidden = false;
      hint.hidden = false;
      questionCounter.hidden = true;
      questionCard.hidden = true;
    } else {
      storyImg.classList.add('compact');
      scene.classList.add('picture-scene-compact');
      prompt.hidden = true;
      hint.hidden = true;
      questionCounter.hidden = false;
      questionCounter.textContent = `第${phase}题 共3题`;
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
