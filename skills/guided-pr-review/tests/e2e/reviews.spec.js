'use strict';
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');


test('counts only your open comments with new commits or a reply from someone else', async ({ page }) => {
  await openReview(page, {
    mutate: (data) => {
      const [posted] = data.ownRemarks;
      // gh-3: nothing happened since it was posted. gh-4: no new commits, but the author replied.
      data.ownRemarks.push(
        { ...posted, id: 'gh-3', threadId: 'T-gh3', body: 'Untouched.', fix: undefined, replies: [] },
        { ...posted, id: 'gh-4', threadId: 'T-gh4', body: 'Answered.', fix: undefined, replies: [{ author: 'sample-author', body: 'Done.', at: '2026-10-22T09:00:00Z' }] },
      );
    },
  });
  await expect(page.getByRole('button', { name: /Existing reviews/ })).toContainText('2 need your decision');
});

test('shows reviews by others and your own with threaded replies', async ({ page }) => {
  await openReview(page);
  const rail = page.getByRole('button', { name: /Existing reviews/ });
  await expect(rail).toContainText('1 by others · 1 needs your decision');
  await rail.click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Other reviewers' })).toBeVisible();
  await expect(main.getByText('@other-reviewer').first()).toBeVisible();
  await expect(main.getByText('Please check the TTL.')).toBeVisible();
  await expect(main.getByText('Should days come from the settings?')).toBeVisible();
  await expect(main.getByText('@sample-author')).toBeVisible();
  await expect(main.getByText('Good idea, later.')).toBeVisible();
  await expect(main.getByText('The README does not mention the card.')).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Your reviews' })).toBeVisible();
  await expect(main.getByText('First round.')).toBeVisible();
  await expect(main.getByText('Is MAX still right?')).toBeVisible();
});

test('saves a call to resolve a thread or leave it open', async ({ page }) => {
  const review = await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(main.getByRole('button', { name: 'Resolve', pressed: true })).toBeVisible();
  await review.saved((state) => state.threadCalls?.['T-gh1'] === 'resolve');
  await main.getByRole('button', { name: 'Leave open', exact: true }).click();
  await expect(main.getByRole('button', { name: 'Leave open', pressed: true })).toBeVisible();
  await review.saved((state) => state.threadCalls?.['T-gh1'] === 'open');
});

test('offers a reply draft in a thread left open and saves what you write', async ({ page }) => {
  const review = await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await page.getByRole('button', { name: 'Leave open', exact: true }).click();
  const reply = page.getByRole('textbox', { name: 'Reply in this thread' });
  await expect(reply).toHaveValue('MAX is still 10.');
  await reply.fill('Still needs a look.');
  await review.saved((state) => state.threadReplies?.['T-gh1'] === 'Still needs a look.');
});

test('shows a saved call and reply when the page opens', async ({ page }) => {
  await openReview(page, { reviewer: { threadCalls: { 'T-gh1': 'open' }, threadReplies: { 'T-gh1': 'My saved reply.' } } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await expect(page.getByRole('button', { name: 'Leave open', pressed: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Reply in this thread' })).toHaveValue('My saved reply.');
});

test('says which comments need your decision, and why', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const main = page.getByRole('main');
  await expect(main.getByText('1 of your comments needs your decision: choose Resolve or Leave open.')).toBeVisible();
  await expect(main.getByText('1 comment · 1 needs your decision')).toBeVisible();
  const thread = main.locator('[data-needs-decision]');
  await expect(thread).toHaveCount(1);
  await expect(thread).toContainText('Needs your decision');
  await expect(thread).toContainText('New commits since your comment');
});

test('says why: a reply from someone else', async ({ page }) => {
  await openReview(page, {
    mutate: (data) => {
      data.ownRemarks[0].fix = undefined;
      data.ownRemarks[0].replies = [{ author: 'sample-author', body: 'Done.', at: '2026-10-22T09:00:00Z' }];
    },
  });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await expect(page.locator('[data-needs-decision]')).toContainText('@sample-author replied');
});

test('shows the commit each review was made on', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const main = page.getByRole('main');
  await expect(main.getByText('This page shows commit aaa111.')).toBeVisible();
  await expect(main.locator('details').filter({ hasText: 'First round.' })).toContainText('on aaa111 · the commit on this page');
  await expect(main.locator('details').filter({ hasText: 'Please check the TTL.' })).toContainText('on 9f8e7d6 · an older commit');
});

test('jumps to the next comment that needs your decision, and opens a closed review', async ({ page }) => {
  await openReview(page, {
    mutate: (data) => {
      const [posted] = data.ownRemarks;
      data.reviews.push({ id: 503, author: 'sample-reviewer', state: 'COMMENTED', commitId: 'aaa000', submittedAt: '2026-10-19T09:00:00Z', url: '', body: 'Zero round.' });
      data.ownRemarks.push({ ...posted, id: 'gh-5', threadId: 'T-gh5', reviewId: 503, body: 'Older question.', replies: [] });
    },
  });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const main = page.getByRole('main');
  const older = main.locator('details').filter({ hasText: 'Zero round.' });
  await older.locator('summary').click();
  await expect(main.getByText('Older question.')).toBeHidden();
  const next = main.getByRole('button', { name: /Next comment to decide/ });
  await expect(next).toContainText('2');
  await next.click();
  await expect(main.locator('[data-needs-decision]').filter({ hasText: 'Is MAX still right?' })).toBeFocused();
  await next.click();
  await expect(main.getByText('Older question.')).toBeVisible();
  await expect(main.locator('[data-needs-decision]').filter({ hasText: 'Older question.' })).toBeFocused();
  await next.click();
  await expect(main.locator('[data-needs-decision]').filter({ hasText: 'Is MAX still right?' })).toBeFocused();
});

test('hides the jump button when no comment needs your decision', async ({ page }) => {
  await openReview(page, { reviewer: { threadCalls: { 'T-gh1': 'open' } } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await expect(page.getByRole('button', { name: /Next comment to decide/ })).toBeHidden();
});
