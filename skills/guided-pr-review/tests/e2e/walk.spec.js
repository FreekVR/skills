'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, expectPoll } = require('./helpers.js');
const { H } = require('./fixture.js');

const stop = (page, code) => page.getByRole('button', { name: new RegExp(`^${code} `) });

const flowRow = (page, name) => page.getByRole('main').getByRole('button', { name: new RegExp(`^${name} .`) });

const hasSeen = (review, hunkId) => (review.reviewer().seen || []).includes(hunkId);

async function openFlow(page, name) {
  await flowRow(page, name).click();
}

test('opening a hunk marks it seen', async ({ page }) => {
  const review = await openReview(page);
  await openFlow(page, 'Show the forecast');
  await expect(page.getByText('1 of 7 hunks seen')).toBeVisible();
  await expect(page.getByText('1 of 3 hunks seen')).toBeVisible();
  await expect(stop(page, 'A1')).toHaveAccessibleName(/, seen$/);
  await expect(stop(page, 'A2')).toHaveAccessibleName(/, not seen$/);
  await expectPoll(() => hasSeen(review, H.client));
  expect(review.reviewer().seen).toEqual([H.client]);
});

test('a hunk in two flows counts as seen in both', async ({ page }) => {
  const review = await openReview(page);
  await openFlow(page, 'Show the forecast');
  await stop(page, 'A2').click();
  await expect(stop(page, 'A2')).toHaveAccessibleName(/src\/cache\.ts, seen$/);
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(flowRow(page, 'Show the forecast')).toContainText('2/3 seen');
  await expect(flowRow(page, 'Store the forecast')).toContainText('1/2 seen');
  await expectPoll(() => hasSeen(review, H.cache));
  expect(review.reviewer().seen.filter((id) => id === H.cache)).toHaveLength(1);
});

test('keyboard: j, k and n move between hunks', async ({ page }) => {
  await openReview(page);
  await page.keyboard.press('j');
  await expect(stop(page, 'A1')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('j');
  await expect(stop(page, 'A2')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('k');
  await expect(stop(page, 'A1')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('n');
  await expect(stop(page, 'A3')).toHaveAttribute('aria-current', 'step');
});

test('keyboard: h goes Home, s goes to the submit page, ? opens the shortcut list', async ({ page }) => {
  await openReview(page);
  await page.keyboard.press('j');
  await page.keyboard.press('h');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.keyboard.press('s');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Post a new review');
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Next unseen hunk')).toBeVisible();
  await expect(dialog.getByText('Submit review')).toBeVisible();
});

test('clicking a stop on the flow map opens that hunk', async ({ page }) => {
  const review = await openReview(page);
  await openFlow(page, 'Show the forecast');
  await stop(page, 'A3').click();
  await expect(stop(page, 'A3')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText('src/components/ForecastCard.tsx', { exact: true }).first()).toBeVisible();
  await expectPoll(() => hasSeen(review, H.card));
});

test('a flow without criteria shows its reason', async ({ page }) => {
  await openReview(page);
  await openFlow(page, 'Moved and added files');
  await expect(page.getByText('No acceptance criteria to check. These files change no behaviour.')).toBeVisible();
});
