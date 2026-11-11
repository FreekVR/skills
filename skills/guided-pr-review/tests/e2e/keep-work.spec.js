'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, expectPoll } = require('./helpers.js');

const stop = (page, code) => page.getByRole('button', { name: new RegExp(`^${code} `) }).first();
const draft = (review) => Object.values(review.reviewer().drafts || {})[0];

test('a remark being written comes back after a reload, in its open form', async ({ page }) => {
  const review = await openReview(page);
  await openHunk(page, 'Show the forecast', /^A1 /);
  await page.getByRole('button', { name: 'Add a remark on line 12' }).click();
  await page.getByLabel('Remark text').fill('Name the url.');
  await expectPoll(() => draft(review) === 'Name the url.');
  await page.reload();
  await expect(page.getByLabel('Remark text')).toHaveValue('Name the url.');
});

test('a change made just before the tab closes is still saved', async ({ page }) => {
  const review = await openReview(page);
  await openHunk(page, 'Show the forecast', /^A1 /);
  await page.getByRole('button', { name: 'Add a remark on line 12' }).click();
  await page.getByLabel('Remark text').fill('Saved on the way out.');
  await page.goto('about:blank');
  await expectPoll(() => draft(review) === 'Saved on the way out.');
});

test('a second tab on the same review shows a warning in both, until one closes', async ({ page }) => {
  await openReview(page);
  const other = await page.context().newPage();
  await other.goto(page.url());
  const warning = 'This review is open in another tab.';
  await expect(other.getByText(warning)).toBeVisible();
  await expect(page.getByText(warning)).toBeVisible();
  await other.close();
  await expect(page.getByText(warning)).toBeHidden();
});

test('f goes to the next hunk with an open finding, in reading order, and starts again at the top', async ({ page }) => {
  await openReview(page);
  for (const code of ['A2', 'A3', 'B1', 'A2']) {
    await page.keyboard.press('f');
    await expect(stop(page, code)).toHaveAttribute('aria-current', 'step');
  }
});
