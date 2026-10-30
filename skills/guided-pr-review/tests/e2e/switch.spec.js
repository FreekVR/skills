'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview, startServer } = require('./helpers.js');
const { review: fixture } = require('./fixture.js');

const other = () => {
  const data = fixture();
  data.pr.number = 18;
  data.pr.title = 'fix: round the temperature';
  return data;
};

test('the review switch lists both reviews and shows how to resume one that does not run', async ({ page }) => {
  await openReview(page, { others: [other()] });
  await page.getByRole('banner').getByText('2 reviews').click();
  await expect(page.getByText('feat: add three-day forecast', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('fix: round the temperature')).toBeVisible();
  await expect(page.getByText('Not running.')).toBeVisible();
  await expect(page.getByText('Ask your agent to resume the guided review of example-org/sample-widget#18.')).toBeVisible();
});

test('the review switch links to another review whose server runs', async ({ page }) => {
  const review = await openReview(page, { others: [other()] });
  const dir = path.join(review.stateHome, 'guided-pr-review', 'example-org', 'sample-widget', '18');
  const { url, stop } = await startServer(dir, review.stateHome);
  page.on('close', stop);

  await page.reload();
  await page.getByRole('main').waitFor();
  await page.getByRole('banner').getByText('2 reviews').click();
  await expect(page.getByRole('link', { name: /fix: round the temperature/ })).toHaveAttribute('href', url);
});

// This test changes form after the Nuxt migration: the page will then show per review whether an agent is connected.
test('when the server stops the page says the review is not running and shows the resume command', async ({ page }) => {
  const review = await openReview(page);
  fs.writeFileSync(path.join(review.dir, 'session.json'), JSON.stringify({ sessionId: 'abc-123', cwd: '/work/sample widget', worktree: null }));
  await page.reload();
  await page.getByRole('main').waitFor();

  review.stop();
  await expect(page.getByRole('main').getByText('This review is not running.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("cd '/work/sample widget' && claude --resume abc-123")).toBeVisible();
});
