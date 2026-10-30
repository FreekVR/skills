'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, eventOf, expectPoll } = require('./helpers.js');
const { H } = require('./fixture.js');

let review;

test('shows the file path, the status and the function of the hunk', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  const main = page.getByRole('main');
  await expect(main.getByText('src/cache.ts').first()).toBeVisible();
  await expect(main.getByText('modified')).toBeVisible();
  await expect(main.getByText('export class Cache {').first()).toBeVisible();
});

test('shows where a renamed file came from', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Moved and added files', /^C1 /);
  await expect(page.getByRole('main').getByText('renamed from src/old/legacy.ts')).toBeVisible();
});

test('shows old and new line numbers in the diff', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  const removed = page.getByRole('row').filter({ hasText: 'const TTL = 60;' });
  await expect(removed.getByRole('cell').nth(0)).toHaveText('2');
  const added = page.getByRole('row').filter({ hasText: 'const TTL = 60 * 1000;' });
  await expect(added.getByRole('cell').nth(1)).toHaveText('2');
  const context = page.getByRole('row').filter({ hasText: 'const MAX = 10;' });
  await expect(context.getByRole('cell').nth(0)).toHaveText('3');
  await expect(context.getByRole('cell').nth(1)).toHaveText('3');
});

test('shows the gap in a whole-file hunk', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Store the forecast', /^B2 package-lock\.json/);
  await expect(page.getByText('unchanged lines skipped, continues at line 40')).toBeVisible();
});

test('shows the text for a binary file', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Moved and added files', /^C2 docs\/logo\.png/);
  await expect(page.getByText('This is a binary file. Open it on GitHub to compare.')).toBeVisible();
});

test('shows the explanation, and asks for a longer one', async ({ page }) => {
  const review = await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await expect(page.getByText('The cache keeps forecasts longer.')).toBeVisible();
  await page.getByRole('button', { name: 'Explain more' }).click();
  expect((await eventOf(review, 'explain')).hunkId).toBe(H.cache);
  review.update((data) => { data.hunks.find((hunk) => hunk.id === H.cache).explanationMore = 'The longer story about the TTL.'; });
  await page.getByText('Longer explanation from the AI').click();
  await expect(page.getByText('The longer story about the TTL.')).toBeVisible();
});

test.describe('a finding', () => {
  test.beforeEach(async ({ page }) => {
    review = await openReview(page);
    await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
    await expect(page.getByText('TTL is in milliseconds')).toBeVisible();
    await expect(page.getByText('The TTL is 60 seconds, not one hour.')).toBeVisible();
  });

  test('can be accepted', async ({ page }) => {
    await page.getByRole('button', { name: 'Accept' }).click();
    await expectPoll(() => review.reviewer().decisions?.f1 === 'accepted');
  });

  test('can get another severity', async ({ page }) => {
    await page.getByRole('combobox', { name: /^Severity/ }).selectOption('nit');
    await expectPoll(() => review.reviewer().severities?.f1 === 'nit');
  });

  test('can be dismissed', async ({ page }) => {
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expectPoll(() => review.reviewer().decisions?.f1 === 'dismissed');
  });
});

test('shows the comment of someone else with reply, fix line and opinion', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Show the forecast', /^A1 src\/api\/weatherClient\.ts/);
  const main = page.getByRole('main');
  await expect(main.getByText('Should days come from the settings?')).toBeVisible();
  await expect(main.getByText('Good idea, later.')).toBeVisible();
  await expect(main.getByText('Line 11 still has the constant.')).toBeVisible();
  await expect(main.getByText('A setting avoids a deploy for a change.')).toBeVisible();
});

test('copies a comment of someone else as a remark at the lowest severity', async ({ page }) => {
  const review = await openReview(page);
  await openHunk(page, 'Show the forecast', /^A1 src\/api\/weatherClient\.ts/);
  await page.getByRole('button', { name: 'Copy to my review' }).click();
  await expect(page.getByLabel('Severity')).toHaveValue('nit');
  await expect(page.getByLabel('Remark text')).toHaveValue(/Should days come from the settings\?/);
  await page.getByRole('button', { name: 'Add remark' }).click();
  await expectPoll(() => (review.reviewer().remarks || []).find((remark) => remark.copiedFrom === 'c1'));
  expect((review.reviewer().remarks || []).find((remark) => remark.copiedFrom === 'c1')).toMatchObject({ hunkId: H.client, severity: 'nit' });
});

test.describe('your posted comment', () => {
  test.beforeEach(async ({ page }) => {
    review = await openReview(page);
    await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
    const main = page.getByRole('main');
    await expect(main.getByText('Is MAX still right?')).toBeVisible();
    await expect(main.getByText('No commit changed line 3.')).toBeVisible();
    await expect(main.getByText('MAX does not depend on the TTL.')).toBeVisible();
  });

  test('can be resolved', async ({ page }) => {
    await page.getByRole('button', { name: 'Resolve' }).click();
    await expectPoll(() => review.reviewer().threadCalls?.['T-gh1'] === 'resolve');
  });

  test('can be left open', async ({ page }) => {
    await page.getByRole('button', { name: 'Leave open' }).click();
    await expectPoll(() => review.reviewer().threadCalls?.['T-gh1'] === 'open');
  });
});

test('shows the opinion on your pending comment until you edit its text', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Show the forecast', /^A3 src\/components\/ForecastCard\.tsx/);
  const main = page.getByRole('main');
  await expect(main.getByText('Add a docblock.')).toBeVisible();
  await expect(main.getByText('Exported components need one.')).toBeVisible();
  await main.getByRole('button', { name: 'Edit', exact: true }).click();
  await main.getByLabel('Edit your remark').fill('Add a short docblock.');
  await main.getByRole('button', { name: 'Save remark' }).click();
  await expect(main.getByText('Add a short docblock.')).toBeVisible();
  await expect(main.getByText('Exported components need one.')).toBeHidden();
});

test('shows the whole file', async ({ page }) => {
  const review = await openReview(page);
  fs.mkdirSync(path.join(review.dir, 'files', 'src'), { recursive: true });
  fs.writeFileSync(path.join(review.dir, 'files', 'src', 'cache.ts'), 'export const NAME = "cache";\nconst TTL = 60 * 1000;\nconst MAX = 10;\nconst LAST = "end of file";\n');
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await page.getByRole('button', { name: 'Whole file' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'src/cache.ts' })).toBeVisible();
  await expect(dialog.getByText('const LAST = "end of file";')).toBeVisible();
});
