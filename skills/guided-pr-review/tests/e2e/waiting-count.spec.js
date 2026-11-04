'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, eventOf } = require('./helpers.js');
const { H } = require('./fixture.js');

const live = (review) => fs.writeFileSync(path.join(review.dir, 'session.json'), JSON.stringify({ sessionId: 'sample-session', cwd: review.dir, watcherPid: process.pid }));

async function ask(page, text) {
  await page.getByLabel('Question about this hunk').fill(text);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
}

test('the header counts the requests that wait for the agent and drops them when answered', async ({ page }) => {
  const review = await openReview(page);
  live(review);
  await expect(page.getByText(/waits? for the agent/)).toBeHidden();
  await openHunk(page, 'Show the forecast', /^A1 /);
  await page.getByRole('button', { name: 'Ask the agent about this hunk' }).click();
  await ask(page, 'Why three days?');
  await expect(page.getByText('1 request waits for the agent')).toBeVisible();
  await ask(page, 'Why not four?');
  await expect(page.getByText('2 requests wait for the agent')).toBeVisible();
  // The page polls the agent state, so the colour follows after the next poll.
  await expect(page.getByText('2 requests wait for the agent')).toHaveClass(/text-muted/);

  const asks = review.events().filter((event) => event.type === 'ask');
  const answer = (event) => ({ eventId: event.id, hunkId: H.client, question: event.question, answer: 'An answer.' });
  review.update((data) => { data.answers.push(answer(asks[0])); });
  await expect(page.getByText('1 request waits for the agent')).toBeVisible();
  review.update((data) => { data.answers.push(answer(asks[1])); });
  await expect(page.getByText(/waits? for the agent/)).toBeHidden();
});

test('the label turns to the warning colour while the agent is paused', async ({ page }) => {
  const review = await openReview(page);
  live(review);
  fs.writeFileSync(path.join(review.dir, 'paused'), '');
  await openHunk(page, 'Show the forecast', /^A1 /);
  await page.getByRole('button', { name: 'Ask the agent about this hunk' }).click();
  await ask(page, 'Why three days?');
  await expect(page.getByText('1 request waits for the agent')).toHaveClass(/text-warning/);
});
