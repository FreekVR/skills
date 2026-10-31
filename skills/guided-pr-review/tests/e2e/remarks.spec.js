'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, expectPoll } = require('./helpers.js');
const { H } = require('./fixture.js');


const openClientHunk = (page) => openHunk(page, 'Show the forecast', /^A1 /);
let review;

test.describe('a remark', () => {
  test.beforeEach(async ({ page }) => {
    review = await openReview(page);
    await openClientHunk(page);
    await page.getByRole('button', { name: 'Add a remark on line 12' }).click();
    await page.getByLabel('Remark text').fill('Name the url.');
    await page.getByLabel('Severity').selectOption('medium');
    await page.getByRole('button', { name: 'Add remark' }).click();
    await expect(page.getByText('Name the url.')).toBeVisible();
  });

  test('is saved from the line', async () => {
    await expectPoll(() => review.remark('Name the url.'));
    expect(review.remark('Name the url.')).toMatchObject({ hunkId: H.client, line: 12, side: 'RIGHT', severity: 'medium', body: 'Name the url.' });
  });

  test('can be edited', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Edit your remark').fill('Name the url constant.');
    await page.getByRole('button', { name: 'Save remark' }).click();
    await expectPoll(() => review.remark('Name the url constant.'));
  });

  test('can be deleted', async ({ page }) => {
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Name the url.')).toBeHidden();
    await expectPoll(() => !review.remark('Name the url.') && review.reviewer().remarks);
  });
});

test('selecting lines by dragging over the line numbers gives the remark a start line', async ({ page }) => {
  const review = await openReview(page);
  await openClientHunk(page);
  await page.getByRole('button', { name: 'Write a remark on line 10' }).dragTo(page.getByRole('button', { name: 'Write a remark on line 12' }));
  await page.getByLabel('Remark text').fill('This whole block.');
  await page.getByRole('button', { name: 'Add remark' }).click();
  await expectPoll(() => review.remark('This whole block.'));
  expect(review.remark('This whole block.')).toMatchObject({ startLine: 10, line: 12 });
});

test('shift-clicking a second line extends the selection', async ({ page }) => {
  const review = await openReview(page);
  await openClientHunk(page);
  await page.getByRole('button', { name: 'Add a remark on line 10' }).click();
  await page.getByRole('button', { name: 'Write a remark on line 12' }).click({ modifiers: ['Shift'] });
  await page.getByLabel('Remark text').fill('This whole block.');
  await page.getByRole('button', { name: 'Add remark' }).click();
  await expectPoll(() => review.remark('This whole block.'));
  expect(review.remark('This whole block.')).toMatchObject({ startLine: 10, line: 12 });
});

test('"Add a remark on this hunk" selects all changed lines', async ({ page }) => {
  const review = await openReview(page);
  await page.getByRole('button', { name: 'Store the forecast' }).first().click();
  await page.getByRole('navigation', { name: /^Hunks in / }).getByRole('button', { name: /^B1 / }).click();
  await page.getByRole('button', { name: 'Add a remark on this hunk' }).click();
  await page.getByLabel('Remark text').fill('The whole change.');
  await page.getByRole('button', { name: 'Add remark' }).click();
  await expectPoll(() => review.remark('The whole change.'));
  expect(review.remark('The whole change.')).toMatchObject({ hunkId: H.cache, startLine: 2, startSide: 'LEFT', line: 2, side: 'RIGHT' });
});

for (const [key, verdict] of [['a', 'approved'], ['r', 'changes'], ['c', 'comment']]) {
  test(`key ${key} sets the hunk verdict to ${verdict}`, async ({ page }) => {
    const review = await openReview(page);
    await openClientHunk(page);
    await page.keyboard.press(key);
    await expectPoll(() => review.reviewer().hunkVerdicts?.[H.client] === verdict);
  });
}
