'use strict';
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');
const { H } = require('./fixture.js');

const GEN = { api: 'bbbbbbbbbbb1', model: 'bbbbbbbbbbb2', sql: 'bbbbbbbbbbb3' };

// Adds the group of generated files: three files with a hunk each, and the lockfile, which is also a step of a flow.
function withGenerated(data) {
  const hunk = (id, file) => ({ id, file, status: 'added', oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, context: '', lines: ['+generated'], explanation: 'Generated.' });
  data.hunks.push(hunk(GEN.api, 'src/api/generated/WeatherApi.ts'), hunk(GEN.model, 'src/api/generated/models/Forecast.ts'), hunk(GEN.sql, 'scripts/schema.sql'));
  data.generated = {
    files: [
      { path: 'src/api/generated/WeatherApi.ts', reason: 'header' },
      { path: 'src/api/generated/models/Forecast.ts', reason: 'header' },
      { path: 'scripts/schema.sql', reason: 'confirmed' },
      { path: 'package-lock.json', reason: 'name' },
    ],
    summary: 'The client is generated from the spec.',
    sourceHunkIds: [],
  };
  data.findings.push({ id: 'g1', hunkId: GEN.api, line: 1, side: 'RIGHT', severity: 'minor', title: 'Generated call differs', body: 'The generated call changed.', rule: 'correctness' });
}

const heading = (page) => page.getByRole('heading', { level: 1 });

async function openAt(page, path, options = {}) {
  const review = await openReview(page, { mutate: withGenerated, ...options });
  await page.goto(review.url + path);
  await page.getByRole('main').waitFor();
  return review;
}

test('the address /generated opens the group page', async ({ page }) => {
  await openAt(page, '/generated');
  await expect(heading(page)).toHaveText('Generated files');
  await expect(page).toHaveURL(/\/generated$/);
});

test('j from the last stop of the last flow opens the group, then X1; k from X1 opens the group', async ({ page }) => {
  await openAt(page, '/C2');
  await page.keyboard.press('j');
  await expect(heading(page)).toHaveText('Generated files');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/\/X1$/);
  await page.keyboard.press('k');
  await expect(heading(page)).toHaveText('Generated files');
  await page.keyboard.press('k');
  await expect(page).toHaveURL(/\/C2$/);
});

test('a verdict on the last unseen stop opens the group while it has no verdict', async ({ page }) => {
  const seen = [H.client, H.cache, H.card, H.rename, H.logo, H.lock, GEN.api, GEN.model, GEN.sql];
  await openAt(page, '/X1', { reviewer: { seen } });
  await page.keyboard.press('a');
  await expect(heading(page)).toHaveText('Generated files');
});

test('n with every stop seen opens the group while it has no verdict', async ({ page }) => {
  await openAt(page, '/A1', { reviewer: { seen: [H.client, H.cache, H.card, H.rename, H.logo, H.lock, H.format] } });
  await page.keyboard.press('n');
  await expect(heading(page)).toHaveText('Generated files');
});

test('the group opens in the directory layout too', async ({ page }) => {
  await openAt(page, '/generated', { mutate: (data) => { withGenerated(data); data.layout = 'directory'; } });
  await expect(heading(page)).toHaveText('Generated files');
  await page.keyboard.press('k');
  await expect(page).toHaveURL(/\/F\d+$/);
  await page.keyboard.press('j');
  await expect(heading(page)).toHaveText('Generated files');
});

test('opening the group page alone leaves its hunks unseen', async ({ page }) => {
  const review = await openAt(page, '/generated');
  await expect(heading(page)).toHaveText('Generated files');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/\/X1$/);
  await review.saved((reviewer) => (reviewer.seen || []).includes(H.format));
  expect(review.reviewer().seen).not.toContain(GEN.api);
  expect(review.reviewer().seen).not.toContain(GEN.model);
  expect(review.reviewer().seen).not.toContain(GEN.sql);
});

for (const [key, verdict] of [['a', 'approved'], ['r', 'changes'], ['c', 'comment']]) {
  test(`${key} on the group page gives the group the verdict ${verdict}, marks its hunks seen and opens Submit review`, async ({ page }) => {
    const review = await openAt(page, '/generated', { reviewer: { seen: [H.client, H.cache, H.card, H.rename, H.logo, H.format] } });
    await page.keyboard.press(key);
    await expect(page).toHaveURL(/\/submit$/);
    await review.saved((reviewer) => reviewer.generatedVerdict === verdict);
    expect(review.reviewer().seen).toEqual(expect.arrayContaining([GEN.api, GEN.model, GEN.sql, H.lock]));
  });
}
