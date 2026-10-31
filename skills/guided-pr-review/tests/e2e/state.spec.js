'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, eventOf, expectPoll } = require('./helpers.js');
const { H } = require('./fixture.js');


test('a reload opens the same hunk and keeps remarks, hunk verdicts and the theme', async ({ page }) => {
  const review = await openReview(page);
  await page.getByRole('complementary').getByRole('button', { name: /^Store the forecast/ }).click();
  await expect(page.getByRole('region', { name: 'Diff of src/cache.ts' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a remark on line 1' }).click();
  await page.getByLabel('Remark text').fill('Check this constant.');
  await page.getByRole('button', { name: 'Add remark' }).click();
  await page.getByRole('button', { name: 'Dark' }).click();
  await page.getByRole('button', { name: 'Request changes' }).click();
  await expect(page.getByRole('region', { name: 'Diff of package-lock.json' })).toBeVisible();
  await expectPoll(() => review.reviewer().remarks?.length && review.reviewer().hunkVerdicts?.[H.cache] === 'changes' && review.reviewer().theme === 'dark');

  await page.reload();
  await page.getByRole('main').waitFor();
  await expect(page.getByRole('region', { name: 'Diff of package-lock.json' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /^B1 src\/cache\.ts/ }).click();
  await expect(page.getByRole('main').getByText('Check this constant.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request changes' })).toHaveAttribute('aria-pressed', 'true');
  expect(review.reviewer().remarks.map((remark) => remark.body)).toContain('Check this constant.');
});

test('the page sends a check event when it opens', async ({ page }) => {
  const review = await openReview(page);
  const event = await eventOf(review, 'check');
  expect(event.review).toBe('example-org/sample-widget#17');
});

test('the theme buttons switch the theme and reviewer.json follows', async ({ page }) => {
  const review = await openReview(page);
  const root = page.locator('html');
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expectPoll(() => review.reviewer().theme === 'dark');

  await page.getByRole('button', { name: 'Light' }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expectPoll(() => review.reviewer().theme === 'light');

  await page.getByRole('button', { name: 'Use the system setting' }).click();
  await expect(page.getByRole('button', { name: 'Use the system setting' })).toHaveAttribute('aria-pressed', 'true');
  await expectPoll(() => review.reviewer().theme === 'system');
});
