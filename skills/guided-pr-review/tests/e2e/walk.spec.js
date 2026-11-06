'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, expectPoll } = require('./helpers.js');
const { H } = require('./fixture.js');

const stop = (page, code) => page.getByRole('button', { name: new RegExp(`^${code} `) });

// On Home the flows are the tiles on the band.
const flowRow = (page, name) => page.getByRole('banner').getByRole('button', { name: new RegExp(name) });

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
  await expect(flowRow(page, 'Show the forecast')).toContainText('3 hunks · 2 seen');
  await expect(flowRow(page, 'Store the forecast')).toContainText('2 hunks · 1 seen');
  await expectPoll(() => hasSeen(review, H.cache));
  expect(review.reviewer().seen.filter((id) => id === H.cache)).toHaveLength(1);
});

test('a hunk says you saw it in another flow only after you saw it there', async ({ page }) => {
  await openReview(page);
  const sawIt = page.getByText('You saw this hunk in another flow already.');
  await openFlow(page, 'Store the forecast');
  await expect(stop(page, 'B1')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTitle('Open this hunk in the flow Show the forecast')).toBeVisible();
  await expect(sawIt).toBeHidden();
  await page.getByRole('button', { name: 'Home' }).click();
  await openFlow(page, 'Show the forecast');
  await stop(page, 'A2').click();
  await expect(sawIt).toBeVisible();
});

test('opening a flow again returns to the hunk you had open in it', async ({ page }) => {
  await openReview(page);
  await openFlow(page, 'Show the forecast');
  await stop(page, 'A3').click();
  await page.getByRole('button', { name: 'Home' }).click();
  await openFlow(page, 'Show the forecast');
  await expect(stop(page, 'A3')).toHaveAttribute('aria-current', 'step');
});

// A saved position from before the flow changed, or from before the page saved the flow's hunks with it.
test('a flow that changed since you left it opens at its first unseen hunk', async ({ page }) => {
  await openReview(page, { reviewer: { seen: [H.client], flowPositions: { 'forecast-read': { hunkId: H.client, stops: [H.client, 'an-older-hunk', H.card] }, 'forecast-store': H.lock } } });
  await openFlow(page, 'Store the forecast');
  await expect(stop(page, 'B1')).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: 'Home' }).click();
  await openFlow(page, 'Show the forecast');
  await expect(stop(page, 'A3')).toHaveAttribute('aria-current', 'step');
});

test('a verdict on the last hunk of a flow goes back to the first hunk without a verdict', async ({ page }) => {
  await openReview(page, { reviewer: { hunkVerdicts: { [H.cache]: 'approved' } } });
  await openFlow(page, 'Show the forecast');
  await stop(page, 'A3').click();
  await page.keyboard.press('a');
  await expect(stop(page, 'A1')).toHaveAttribute('aria-current', 'step');
});

test('a verdict on the last hunk goes to the next flow once every hunk of the flow has one', async ({ page }) => {
  await openReview(page, { reviewer: { hunkVerdicts: { [H.client]: 'approved', [H.cache]: 'approved' } } });
  await openFlow(page, 'Show the forecast');
  await stop(page, 'A3').click();
  await page.keyboard.press('a');
  await expect(stop(page, 'B1')).toHaveAttribute('aria-current', 'step');
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
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.keyboard.press('s');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeHidden();
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

test('a criterion verdict in the flow header is a round pill with an icon, readable on any band colour', async ({ page }) => {
  await openReview(page);
  await openFlow(page, 'Show the forecast');
  const pills = page.locator('[data-criterion-verdict]:visible');
  await expect(pills.filter({ hasText: /^\s*Met\s*$/ }).first()).toBeVisible();
  for (const pill of await pills.all()) {
    await expect(pill).toHaveClass(/rounded-full/);
    await expect(pill).toHaveClass(/bg-elevated/);
    await expect(pill.locator('[data-verdict-icon]')).toHaveCount(1);
  }
  await expect(pills.first().locator('[data-verdict-icon]')).toHaveClass(/text-success/);
  // It sits level with the source pill before it on the same line.
  const row = page.locator('li', { has: pills.first() });
  const source = await row.getByText('acceptance criterion').boundingBox();
  const verdict = await pills.first().boundingBox();
  expect(Math.abs(verdict.y - source.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(verdict.height - source.height)).toBeLessThanOrEqual(1);
});

// On a band of any colour, a verdict stop is a white disc with the icon in the verdict colour, on the map and in the legend.
test('verdict stops and their legend entries are white discs with a coloured icon', async ({ page }) => {
  await openReview(page, { reviewer: { hunkVerdicts: { [H.client]: 'approved', [H.cache]: 'changes', [H.card]: 'comment' } } });
  await openFlow(page, 'Show the forecast');
  const colours = (locator) => locator.evaluate((element) => ({ disc: getComputedStyle(element).backgroundColor, icon: getComputedStyle(element.querySelector('.iconify, svg, span')).color }));
  const red = await page.locator('body').evaluate(() => { const probe = document.createElement('span'); probe.className = 'text-error'; document.body.append(probe); const colour = getComputedStyle(probe).color; probe.remove(); return colour; });
  for (const code of ['A1', 'A2', 'A3']) {
    const { disc } = await colours(stop(page, code).locator('[data-tick]'));
    expect(disc).toBe('rgb(255, 255, 255)');
  }
  expect((await colours(stop(page, 'A2').locator('[data-tick]'))).icon).toBe(red);
  await page.getByText('Legend').click();
  for (const entry of await page.locator('[data-legend-verdict]').all()) expect((await colours(entry)).disc).toBe('rgb(255, 255, 255)');
});
