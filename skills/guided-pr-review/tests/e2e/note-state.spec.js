'use strict';
// Every comment, remark and finding says where it stands on GitHub, and when it was made.
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');

const centre = async (locator) => { const box = await locator.boundingBox(); return box.y + box.height / 2; };

test('a comment by someone else shows its time and an On GitHub icon, in line with its buttons', async ({ page }) => {
  const review = await openReview(page);
  await page.goto(`${review.url}/A1`);
  const note = page.locator('#note-c1');
  await expect(note).toContainText('Oct');
  const icon = note.getByRole('img', { name: 'On GitHub' });
  await expect(icon).toHaveCount(1);
  const copy = note.getByRole('button', { name: 'Copy to my review' });
  expect(Math.abs(await centre(icon) - await centre(copy))).toBeLessThanOrEqual(1);
});

test('your posted comment shows an On GitHub icon', async ({ page }) => {
  const review = await openReview(page);
  await page.goto(`${review.url}/B1`);
  await expect(page.locator('#note-gh-1').getByRole('img', { name: 'On GitHub' })).toHaveCount(1);
});

test('an AI finding shows when the agent wrote it', async ({ page }) => {
  const review = await openReview(page);
  await page.goto(`${review.url}/B1`);
  await expect(page.getByRole('main').getByText('TTL is in milliseconds').first()).toBeVisible();
  await expect(page.getByRole('main').getByText(/Oct 21, 2026/).first()).toBeVisible();
});

test('a new remark records and shows the time you wrote it', async ({ page }) => {
  const review = await openReview(page);
  await page.goto(`${review.url}/B1`);
  await page.getByRole('button', { name: 'Add a remark on line 1' }).click();
  await page.getByLabel('Remark text').fill('Name the unit.');
  await page.getByRole('button', { name: 'Add remark' }).click();
  await expect.poll(() => review.remark('Name the unit.')?.at).toBeTruthy();
  await expect(page.getByRole('main').getByText(/Your remark · .*line 1 · /)).toBeVisible();
});

test('every comment card on Existing reviews has exactly one state icon', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const cards = page.getByRole('main').locator('.thread');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let at = 0; at < count; at++) await expect(cards.nth(at).locator('[data-note-state]')).toHaveCount(1);
});

test('a comment outside the diff on Home shows an On GitHub icon', async ({ page }) => {
  await openReview(page);
  await page.getByText('open comment by others outside the diff').click();
  const card = page.getByRole('main').getByText('The README does not mention the card.').locator('xpath=ancestor::div[contains(@class, "py-4")][1]');
  await expect(card.getByRole('img', { name: 'On GitHub' })).toHaveCount(1);
});

// f2 is open on A3; an edit of its text is the reviewer's own words, which are not posted until they include it.
test('an open AI finding you edited says so, and that your edit is not in your review', async ({ page }) => {
  const review = await openReview(page, { reviewer: { edits: { f2: 'Use a named function. I would add a test too.' } } });
  await page.goto(`${review.url}/A3`);
  // The card holds a state icon before and after Include, so it anchors on that.
  const card = page.getByRole('main').getByText('Name the map callback').first().locator('xpath=ancestor::div[.//*[@data-note-state]][1]');
  await expect(card.getByText('Edited by you')).toBeVisible();
  const icon = card.getByRole('img', { name: 'Edited, not in your review' });
  await expect(icon).toHaveCount(1);
  const include = card.getByRole('button', { name: 'Include in my review' });
  expect(Math.abs(await centre(icon) - await centre(include))).toBeLessThanOrEqual(1);
  await include.click();
  await expect(card.getByRole('img', { name: /^In your review, not posted/ })).toHaveCount(1);
});

test('an open AI finding you did not edit has no edit mark and no state icon', async ({ page }) => {
  const review = await openReview(page);
  await page.goto(`${review.url}/A3`);
  const card = page.getByRole('main').getByText('Name the map callback').first().locator('xpath=ancestor::div[.//button[normalize-space()="Include in my review"]][1]');
  await expect(card.getByText('Edited by you')).toHaveCount(0);
  await expect(card.locator('[data-note-state]')).toHaveCount(0);
});
