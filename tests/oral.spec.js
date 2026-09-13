// Picture/video oral flow: record → transcribe → score.
// The browser's real mic and SpeechRecognition are stubbed in-page so the app's
// own state machine is what gets tested (headless Chromium never resolves
// getUserMedia here, and Web Speech has no offline engine).

import { test, expect } from '@playwright/test';

const SCORE_JSON = JSON.stringify({
  content_score: 80, language_score: 70, expression_score: 75,
  feedback: 'Good description. Try adding more feelings.',
});

// srMode: 'ok' | 'error' (network failure) | 'absent' (no Web Speech API)
function installStubs(srMode) {
  const fakeStream = { getTracks: () => [{ stop() {} }], getAudioTracks: () => [{ stop() {} }] };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => fakeStream, enumerateDevices: async () => [] },
  });

  class FakeMediaRecorder {
    static isTypeSupported(t) { return t === 'audio/webm;codecs=opus'; }
    constructor(stream, opts) { this.stream = stream; this.mimeType = opts?.mimeType || ''; this.state = 'inactive'; }
    start() {
      this.state = 'recording';
      setTimeout(() => this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) }), 50);
    }
    stop() { this.state = 'inactive'; setTimeout(() => this.onstop?.(), 10); }
  }
  window.MediaRecorder = FakeMediaRecorder;

  if (srMode === 'absent') {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    return;
  }

  class FakeSR extends EventTarget {
    start() {
      // Recorded so a test can assert the language followed the story.
      window.__srLang = this.lang;
      if (srMode === 'silence') {
        // Chrome ends the session after a pause; the app must restart it and
        // keep transcribing the rest of the answer.
        this._round = (this._round || 0) + 1;
        const round = this._round;
        setTimeout(() => {
          const results = [[{ transcript: round === 1 ? '我看到老师。' : '同学们很快乐。', confidence: 0.8 }]];
          results[0].isFinal = true;
          results[0].length = 1;
          this.onresult?.(Object.assign(new Event('result'), {
            resultIndex: 0, results: Object.assign(results, { length: 1 }),
          }));
          if (round === 1) setTimeout(() => { this.onend?.(new Event('end')); this.dispatchEvent(new Event('end')); }, 60);
        }, 80);
        return;
      }
      if (srMode === 'error') {
        setTimeout(() => {
          this.onerror?.(Object.assign(new Event('error'), { error: 'network' }));
          this._ended = true;
          this.onend?.(new Event('end'));
          this.dispatchEvent(new Event('end'));
        }, 40);
        return;
      }
      setTimeout(() => {
        const results = [[{ transcript: '图片里有老师和同学在课室里认真学习。', confidence: 0.9 }]];
        results[0].isFinal = true;
        results[0].length = 1;
        this.onresult?.(Object.assign(new Event('result'), {
          resultIndex: 0,
          results: Object.assign(results, { length: 1 }),
        }));
      }, 150);
    }
    stop() {
      if (this._ended) throw new Error('already ended');
      setTimeout(() => { this.onend?.(new Event('end')); this.dispatchEvent(new Event('end')); }, 20);
    }
    abort() {}
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
}

// generate: 'ok' | 'fail' (upstream error) | 'nokey' (server has no ANTHROPIC_API_KEY).
// The browser never holds a key — /api/generate answers on the server's own.
async function boot(page, { srMode = 'ok', loggedIn = true, generate = 'ok' } = {}) {
  const ctx = { dialogs: [], pageErrors: [], generate, anthropicCalls: 0 };
  page.on('dialog', async d => { ctx.dialogs.push(d.message()); await d.dismiss(); });
  page.on('pageerror', e => ctx.pageErrors.push(e.message));

  await page.addInitScript(installStubs, srMode);
  await page.addInitScript((li) => {
    if (li) localStorage.setItem('cr-token', 'test-token');
    localStorage.setItem('cr-students', JSON.stringify([
      { id: 'stu-1', name: 'Test Kid', level: 'P1', color: '#e8590c', createdAt: 1 },
    ]));
    localStorage.setItem('cr-active-student', 'stu-1');
    localStorage.setItem('cr-synced-up', '1');
  }, loggedIn);

  // The key must never leave the server, so the page must never call Anthropic itself.
  await page.route('https://api.anthropic.com/**', route => {
    ctx.anthropicCalls += 1;
    return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/generate', route => {
    if (ctx.generate === 'nokey') {
      return route.fulfill({
        status: 503, contentType: 'application/json',
        body: JSON.stringify({ error: 'AI is unavailable — the server has no Anthropic API key configured.' }),
      });
    }
    if (ctx.generate !== 'ok') {
      return route.fulfill({
        status: 502, contentType: 'application/json',
        body: JSON.stringify({ error: 'Could not reach Anthropic API: socket hang up' }),
      });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ content: [{ type: 'text', text: SCORE_JSON }] }),
    });
  });
  for (const p of ['**/api/students', '**/api/sessions', '**/api/recordings**']) {
    await page.route(p, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  }

  await page.goto('/');
  const skip = page.locator('#ob-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForSelector('.filter-tab', { timeout: 10000 });
  await page.locator('.filter-tab', { hasText: '看图 Picture' }).click();
  await page.locator('.story-button').first().click();
  await expect(page.locator('.picture-reader-card')).toBeVisible();
  return ctx;
}

async function record(page) {
  await page.locator('.recorder-start-btn').click();
  await page.waitForTimeout(400);
  await page.locator('.recorder-stop-btn').click();
  await expect(page.locator('.recorder-start-btn')).toBeEnabled({ timeout: 10000 });
  await page.waitForTimeout(1200); // selectQuestions / scorePicture round trip
}

const counter = page => page.locator('.picture-question-counter');
const status = page => page.locator('.recorder-status');

test.describe('picture oral', () => {
  test('four recordings advance through the questions and produce a score', async ({ page }) => {
    const ctx = await boot(page);

    await expect(counter(page)).toContainText('录音 1 / 4');
    await record(page);
    await expect(counter(page)).toContainText('录音 2 / 4');
    await expect(page.locator('.picture-question-card')).not.toBeEmpty();
    await record(page);
    await expect(counter(page)).toContainText('录音 3 / 4');
    await record(page);
    await expect(counter(page)).toContainText('录音 4 / 4');
    await record(page);

    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('#score-num')).toBeVisible();
    await expect(page.locator('.score-feedback-text')).toContainText('Good description');
    expect(ctx.pageErrors).toEqual([]);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cr-progress-stu-1')));
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0].transcript).toContain('老师');
  });

  test('a failed recognition is reported and never scored as a blank answer', async ({ page }) => {
    const ctx = await boot(page, { srMode: 'error' });

    for (let i = 0; i < 4; i++) await record(page);

    // Still on step 1: an empty transcript must not advance the flow.
    await expect(counter(page)).toContainText('录音 1 / 4');
    await expect(status(page)).toBeVisible();
    await expect(status(page)).toContainText(/网络|connection/);
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    const saved = await page.evaluate(() => localStorage.getItem('cr-progress-stu-1'));
    expect(saved).toBeNull();
    expect(ctx.pageErrors).toEqual([]);
  });

  test('speech recognition ending on a pause does not truncate the answer', async ({ page }) => {
    await boot(page, { srMode: 'silence' });

    await page.locator('.recorder-start-btn').click();
    await page.waitForTimeout(900);   // long enough for the silence-end + restart
    await page.locator('.recorder-stop-btn').click();
    await expect(counter(page)).toContainText('录音 2 / 4');

    for (let i = 0; i < 3; i++) await record(page);
    await expect(page.locator('.modal-overlay')).toBeVisible();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cr-progress-stu-1')));
    expect(saved.sessions[0].transcript).toContain('我看到老师');
    expect(saved.sessions[0].transcript).toContain('同学们很快乐');   // lost before the restart fix
  });

  test('a browser with no speech recognition warns before recording', async ({ page }) => {
    await boot(page, { srMode: 'absent' });

    await expect(status(page)).toBeVisible();
    await expect(status(page)).toContainText('Chrome');

    await record(page);
    await expect(counter(page)).toContainText('录音 1 / 4');
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  });

  test('without a family account the student is told before and after recording', async ({ page }) => {
    const ctx = await boot(page, { loggedIn: false });

    await expect(status(page)).toContainText('Settings');
    for (let i = 0; i < 4; i++) await record(page);

    await expect(status(page)).toContainText('family account');
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    expect(ctx.pageErrors).toEqual([]);   // used to be a TypeError on null result
  });

  test('scoring needs no key in the browser and never calls Anthropic directly', async ({ page }) => {
    const ctx = await boot(page);

    for (let i = 0; i < 4; i++) await record(page);

    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('#score-num')).toBeVisible();
    expect(ctx.anthropicCalls).toBe(0);   // the key lives only on the server
    const stored = await page.evaluate(() => localStorage.getItem('anthropicApiKey'));
    expect(stored).toBeNull();
    expect(ctx.pageErrors).toEqual([]);
  });

  test('a server with no ANTHROPIC_API_KEY is reported, and the answers survive', async ({ page }) => {
    const ctx = await boot(page, { generate: 'nokey' });

    for (let i = 0; i < 4; i++) await record(page);

    await expect(status(page)).toContainText('AI is unavailable');
    await expect(counter(page)).toContainText('录音 4 / 4');
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    // Key added in Railway — re-recording question 3 scores the whole set.
    ctx.generate = 'ok';
    await record(page);
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('#score-num')).toBeVisible();
    expect(ctx.pageErrors).toEqual([]);
  });

  test('a scoring API failure keeps the four answers and allows a retry', async ({ page }) => {
    const ctx = await boot(page, { generate: 'fail' });

    for (let i = 0; i < 4; i++) await record(page);

    await expect(status(page)).toContainText('Scoring failed');
    await expect(counter(page)).toContainText('录音 4 / 4');
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    // API recovers — re-recording question 3 scores the whole set, no restart.
    ctx.generate = 'ok';
    await record(page);
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('#score-num')).toBeVisible();
    expect(ctx.pageErrors).toEqual([]);
  });
});

// English read-aloud and English stimulus-based conversation.
// Boots without forcing the Picture filter so the language bar can be used.
async function bootEnglish(page, { srMode = 'ok', generate = 'ok' } = {}) {
  const ctx = { pageErrors: [], generate };
  page.on('pageerror', e => ctx.pageErrors.push(e.message));

  await page.addInitScript(installStubs, srMode);
  await page.addInitScript(() => {
    localStorage.setItem('cr-token', 'test-token');
    localStorage.setItem('cr-students', JSON.stringify([
      { id: 'stu-1', name: 'Test Kid', level: 'P4', color: '#e8590c', createdAt: 1 },
    ]));
    localStorage.setItem('cr-active-student', 'stu-1');
    localStorage.setItem('cr-synced-up', '1');
  });
  await page.route('**/api/generate', route => route.fulfill({
    status: ctx.generate === 'ok' ? 200 : 503,
    contentType: 'application/json',
    body: ctx.generate === 'ok'
      ? JSON.stringify({ content: [{ type: 'text', text: SCORE_JSON }] })
      : JSON.stringify({ error: 'AI is unavailable — the server has no Anthropic API key configured.' }),
  }));
  for (const p of ['**/api/students', '**/api/sessions', '**/api/recordings**']) {
    await page.route(p, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  }

  await page.goto('/');
  const skip = page.locator('#ob-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForSelector('.filter-tab', { timeout: 10000 });
  await page.locator('.filter-tab', { hasText: 'English' }).click();
  return ctx;
}

test.describe('english', () => {
  test('the English filter shows only English stories', async ({ page }) => {
    await bootEnglish(page);

    const titles = await page.locator('.story-button').allInnerTexts();
    expect(titles.length).toBeGreaterThan(0);
    // Every visible story carries the EN badge; no Chinese titles leak through.
    expect(await page.locator('.story-button .lang-badge').count()).toBe(titles.length);
    expect(titles.join(' ')).not.toMatch(/[一-鿿]/);
  });

  test('an English passage renders as words, with pinyin hidden', async ({ page }) => {
    await bootEnglish(page);
    await page.locator('.story-button', { hasText: 'The Lost Wallet' }).click();

    await expect(page.locator('.story-paragraph-en')).toBeVisible();
    expect(await page.locator('.en-word').count()).toBeGreaterThan(20);
    expect(await page.locator('.story-reader ruby').count()).toBe(0);
    await expect(page.locator('#pinyin-toggle')).toBeHidden();
    await expect(page.locator('.en-word').first()).toHaveText('On');
  });

  test('recording an English story transcribes in English, not Chinese', async ({ page }) => {
    const ctx = await bootEnglish(page);
    await page.locator('.story-button', { hasText: 'The Lost Wallet' }).click();
    await expect(page.locator('.story-paragraph-en')).toBeVisible();

    await page.locator('.recorder-start-btn').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__srLang)).toBe('en-SG');
    await page.locator('.recorder-stop-btn').click();
    await expect(page.locator('.recorder-start-btn')).toBeEnabled({ timeout: 10000 });
    expect(ctx.pageErrors).toEqual([]);
  });

  test('an English picture oral prompts in English through all four steps', async ({ page }) => {
    const ctx = await bootEnglish(page);
    await page.locator('.story-button', { hasText: 'Lunchtime at the Hawker Centre' }).click();

    await expect(page.locator('.picture-reader-card')).toBeVisible();
    await expect(counter(page)).toContainText('Recording 1 / 4');
    await expect(page.locator('.picture-prompt')).toContainText('describe what you see', { ignoreCase: true });

    await record(page);
    await expect(counter(page)).toContainText('Recording 2 / 4');
    for (let i = 0; i < 3; i++) await record(page);

    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('#score-num')).toBeVisible();
    expect(ctx.pageErrors).toEqual([]);
  });
});
