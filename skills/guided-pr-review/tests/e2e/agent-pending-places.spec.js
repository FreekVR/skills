'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, eventOf } = require('./helpers.js');

const NO_AGENT = 'No agent runs this review, so this request waits.';
const main = (page) => page.getByRole('main');

test('Explain more shows that no agent runs the review', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await page.getByRole('button', { name: 'Explain more' }).click();
  await expect(main(page).getByText(NO_AGENT)).toBeVisible();
  await expect(main(page).getByText('The AI is writing a longer explanation…')).toBeHidden();
});

test('the summary tools show that no agent runs the review', async ({ page }) => {
  const review = await openReview(page, { reviewer: { decisions: { f2: 'accepted' } } });
  await page.keyboard.press('s');
  await page.getByText('Nothing reaches GitHub until you press a post button.').waitFor();
  await page.getByRole('button', { name: /^Write a (new )?summary from your remarks/ }).click();
  await eventOf(review, 'summarize');
  await expect(main(page).getByText(NO_AGENT)).toBeVisible();
});

test('a post that waits shows that no agent runs the review', async ({ page }) => {
  const review = await openReview(page, { reviewer: { decisions: { f2: 'accepted' }, summary: 'Nice work.' } });
  await page.keyboard.press('s');
  await page.getByText('Nothing reaches GitHub until you press a post button.').waitFor();
  await main(page).getByRole('button', { name: /^Post as draft/ }).click();
  await eventOf(review, 'post');
  await expect(main(page).getByRole('status').getByText(NO_AGENT)).toBeVisible();
});

test('loading new commits shows that no agent runs the review', async ({ page }) => {
  const review = await openReview(page);
  review.update((data) => { data.remote.headSha = 'bbb222'; });
  await page.getByRole('button', { name: 'Load the new commits' }).click();
  await eventOf(review, 'refresh');
  await expect(main(page).getByText(NO_AGENT)).toBeVisible();
  await expect(main(page).getByText('The agent is loading the new commits…')).toBeHidden();
});

test('the stack row says Waits for an agent while no agent runs the review', async ({ page }) => {
  const prs = [14, 15, 16].map((number) => ({ number, title: `feat: step ${number}`, url: `https://github.com/example-org/sample-widget/pull/${number}`, state: 'open', approved: false, summary: '' }));
  const review = await openReview(page, { mutate: (data) => { data.pr.number = 15; data.stack = { number: 31, source: 'github', base: 'main', prs }; } });
  fs.mkdirSync(path.join(path.dirname(review.dir), '16'), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(review.dir), '16', 'preparing'), '');
  await page.reload();
  await page.getByRole('banner').getByRole('button', { name: /^Stack · / }).click();
  const row = page.getByRole('dialog').getByRole('listitem').filter({ hasText: '#16 feat: step 16' });
  await expect(row).toContainText('Waits for an agent');
  await expect(row).not.toContainText('Preparing the review…');
});
