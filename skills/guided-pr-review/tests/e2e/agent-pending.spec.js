'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, eventOf } = require('./helpers.js');
const { H } = require('./fixture.js');

const live = (review) => fs.writeFileSync(path.join(review.dir, 'session.json'), JSON.stringify({ sessionId: 'sample-session', cwd: review.dir, watcherPid: process.pid }));

// Opens the questions about the first hunk and sends one that no agent answers.
async function askQuestion(page, review) {
  await openHunk(page, 'Show the forecast', /^A1 /);
  await page.getByRole('button', { name: 'Ask the agent about this hunk' }).click();
  await page.getByLabel('Question about this hunk').fill('Why three days?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  return eventOf(review, 'ask');
}

const panel = (page) => page.getByRole('region', { name: 'Ask the agent about this hunk' });

test('a request shows that it waits while a live agent runs the review', async ({ page }) => {
  const review = await openReview(page);
  live(review);
  await askQuestion(page, review);
  await expect(panel(page).getByText('Waiting for the agent…')).toBeVisible();
  await expect(panel(page).getByText('No agent runs this review')).toBeHidden();
});

test('a request says that no agent runs the review and shows how to resume it', async ({ page }) => {
  const review = await openReview(page);
  fs.writeFileSync(path.join(review.dir, 'session.json'), JSON.stringify({ sessionId: 'sample-session', cwd: review.dir, watcherPid: 2 ** 22 + 1 }));
  await askQuestion(page, review);
  await expect(panel(page).getByText('No agent runs this review, so this request waits.')).toBeVisible();
  await expect(panel(page).getByText('To resume its agent session, run in a terminal:')).toBeVisible();
  await expect(panel(page).getByText('claude --resume sample-session')).toBeVisible();
});

test('an answer removes the indicator', async ({ page }) => {
  const review = await openReview(page);
  const asked = await askQuestion(page, review);
  await expect(panel(page).getByText('No agent runs this review, so this request waits.')).toBeVisible();
  review.update((data) => { data.answers.push({ eventId: asked.id, hunkId: H.client, question: 'Why three days?', answer: 'The ticket asks for three days.' }); });
  await expect(panel(page).getByText('The ticket asks for three days.')).toBeVisible();
  await expect(panel(page).getByText('No agent runs this review')).toBeHidden();
});
