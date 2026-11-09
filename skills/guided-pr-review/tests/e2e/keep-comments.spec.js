'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, eventOf } = require('./helpers.js');

// Every comment on GitHub shows in the page, resolved ones too, with a label that says so.
const resolve = (id) => (data) => { Object.assign(data.reviewComments.find((comment) => comment.id === id), { resolved: true, resolvedBy: 'sample-author' }); };

test('a resolved comment by others still shows on its hunk, marked as resolved', async ({ page }) => {
  await openReview(page, { mutate: resolve('c1') });
  await openHunk(page, 'Show the forecast', /^A1 /);
  await expect(page.getByRole('main').getByText('Should days come from the settings?')).toBeVisible();
  await expect(page.getByRole('main').getByText('Resolved by @sample-author')).toBeVisible();
});

test('a resolved comment outside the diff still shows on Home, marked as resolved', async ({ page }) => {
  await openReview(page, { mutate: resolve('c2') });
  await page.getByText('1 resolved comment by others outside the diff').click();
  await expect(page.getByRole('main').getByText('The README does not mention the card.')).toBeVisible();
  await expect(page.getByRole('main').getByText('Resolved by @sample-author')).toBeVisible();
});

test('a comment that the page showed before and that is gone from the review data gives a warning until it is closed', async ({ page }) => {
  const review = await openReview(page);
  review.update((data) => { data.reviewComments = data.reviewComments.filter((comment) => comment.id !== 'c2'); });
  const warning = page.getByText('1 comment from GitHub no longer shows here.');
  await expect(warning).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(warning).toBeHidden();
});

test('a reply in a resolved thread goes out with the final review', async ({ page }) => {
  const review = await openReview(page, { mutate: resolve('c1'), reviewer: { summary: 'Nice work.', threadReplies: { 'T-c1': 'Still worth a setting.' } } });
  await page.keyboard.press('s');
  await page.getByRole('group', { name: 'Verdict' }).getByRole('button', { name: /^Comment/ }).click();
  await page.getByRole('button', { name: /^Post (new )?review: comment/ }).click();
  const event = await eventOf(review, 'post');
  expect(event.replies).toEqual([{ threadId: 'T-c1', body: 'Still worth a setting.' }]);
});
