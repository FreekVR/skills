'use strict';
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');


test('shows reviews by others and your own with threaded replies', async ({ page }) => {
  await openReview(page);
  const rail = page.getByRole('button', { name: /Existing reviews/ });
  await expect(rail).toContainText('1 by others · 1 to check');
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
  await main.getByRole('button', { name: 'Resolve' }).click();
  await expect(main.getByRole('button', { name: 'Resolve', pressed: true })).toBeVisible();
  await review.saved((state) => state.threadCalls?.['T-gh1'] === 'resolve');
  await main.getByRole('button', { name: 'Leave open' }).click();
  await expect(main.getByRole('button', { name: 'Leave open', pressed: true })).toBeVisible();
  await review.saved((state) => state.threadCalls?.['T-gh1'] === 'open');
});

test('offers a reply draft in a thread left open and saves what you write', async ({ page }) => {
  const review = await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await page.getByRole('button', { name: 'Leave open' }).click();
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
