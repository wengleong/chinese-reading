// Displays a scene card for picture description stories.
// Returns the same interface as storyReader (setActiveIndex, clearActive) as no-ops.

export function renderPictureReader({ root, story }) {
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'picture-reader-card';

  const title = document.createElement('h2');
  title.className = 'story-title';
  title.textContent = story.title;

  const prompt = document.createElement('p');
  prompt.className = 'picture-prompt';
  prompt.textContent = '请描述以下图片的内容：';

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

  const hint = document.createElement('p');
  hint.className = 'picture-hint';
  hint.textContent = story.scene || '';

  card.appendChild(title);
  card.appendChild(prompt);
  card.appendChild(scene);
  card.appendChild(hint);
  root.appendChild(card);

  return {
    setActiveIndex() {},
    clearActive() {},
  };
}
