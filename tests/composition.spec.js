// Composition mode: the app hands out a topic and pictures, the child writes on
// paper. Nothing is uploaded, stored or marked — so these tests assert the
// prompt sheet is complete and correct, not that anything is scored.

import { test, expect } from '@playwright/test';

async function openComposition(page) {
  await page.addInitScript(() => {
    localStorage.setItem('cr-students', JSON.stringify([
      { id: 'stu-1', name: 'Test Kid', level: 'P5', color: '#e8590c', createdAt: 1 },
    ]));
    localStorage.setItem('cr-active-student', 'stu-1');
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const skip = page.locator('#ob-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.locator('#mode-composition').click();
  await expect(page.locator('.comp-list')).toBeVisible({ timeout: 10000 });
  return errors;
}

test.describe('composition', () => {
  test('works without a family account and lists P3-P6 in both languages', async ({ page }) => {
    const errors = await openComposition(page);

    // No login prompt: there is nothing to sync or score.
    await expect(page.locator('#ob-skip')).toHaveCount(0);
    const cards = page.locator('.comp-card');
    await expect(cards).toHaveCount(8);
    const text = await page.locator('.comp-list').innerText();
    for (const level of ['P3', 'P4', 'P5', 'P6']) expect(text).toContain(level);
    expect(errors).toEqual([]);
  });

  test('the language filter splits Chinese from English topics', async ({ page }) => {
    await openComposition(page);

    await page.locator('.composition-panel .filter-tab', { hasText: 'English' }).click();
    await expect(page.locator('.comp-card')).toHaveCount(4);
    expect(await page.locator('.comp-card .lang-badge-zh').count()).toBe(0);

    await page.locator('.composition-panel .filter-tab', { hasText: '中文 Chinese' }).click();
    await expect(page.locator('.comp-card')).toHaveCount(4);
    expect(await page.locator('.comp-card .lang-badge-zh').count()).toBe(4);
  });

  test('an English paper shows the topic, three pictures and the use-any rule', async ({ page }) => {
    const errors = await openComposition(page);
    await page.locator('.composition-panel .filter-tab', { hasText: 'English' }).click();
    await page.locator('.comp-card', { hasText: 'Courage' }).click();

    await expect(page.locator('.comp-topic')).toHaveText('Courage');
    await expect(page.locator('.comp-instructions')).toContainText('at least 150 words');
    // The real paper lets candidates ignore the pictures — the child must be told.
    await expect(page.locator('.comp-instructions')).toContainText('one, two, all three, or none');
    await expect(page.locator('.comp-image')).toBeVisible();
    await expect(page.locator('.comp-hints li')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('a Chinese paper offers both question types, with words and a blank frame', async ({ page }) => {
    const errors = await openComposition(page);
    await page.locator('.composition-panel .filter-tab', { hasText: '中文 Chinese' }).click();
    await page.locator('.comp-card').first().click();

    // The real paper is a choice of two: 命题作文 or 看图作文.
    await expect(page.locator('.comp-question')).toHaveCount(2);
    await expect(page.locator('.comp-topic').first()).toContainText('命题作文');
    await expect(page.locator('.comp-topic').nth(1)).toContainText('看图作文');
    await expect(page.locator('.comp-instructions')).toContainText('选做一题');

    await expect(page.locator('.comp-zh-title')).toBeVisible();     // 命题 title
    await expect(page.locator('.comp-hints li').first()).toBeVisible();
    await expect(page.locator('.comp-image')).toBeVisible();        // the 6 panels
    await expect(page.locator('.comp-word')).toHaveCount(8);        // 八个参考词语
    await expect(page.locator('.comp-note')).toContainText('空白');  // invent the ending
    expect(errors).toEqual([]);
  });

  test('every paper has a picture file that actually loads', async ({ page }) => {
    await openComposition(page);
    const count = await page.locator('.comp-card').count();

    for (let i = 0; i < count; i++) {
      await page.locator('.comp-card').nth(i).click();
      const img = page.locator('.comp-image').first();
      await expect(img).toBeVisible();
      // naturalWidth stays 0 for a broken src, which would otherwise look fine.
      await expect.poll(() => img.evaluate(el => el.naturalWidth), { timeout: 10000 })
        .toBeGreaterThan(0);
      await page.locator('.comp-back').click();
      await expect(page.locator('.comp-list')).toBeVisible();
    }
  });

  test('switching modes hides the other panels', async ({ page }) => {
    await openComposition(page);
    await expect(page.locator('.app-main')).toBeHidden();

    await page.locator('#mode-reading').click();
    await expect(page.locator('.composition-panel')).toBeHidden();
    await expect(page.locator('.app-main')).toBeVisible();
  });
});
