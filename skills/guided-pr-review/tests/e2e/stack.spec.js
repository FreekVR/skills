'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');
const { review: fixture } = require('./fixture.js');

const TITLES = { 14: 'feat: add the forecast API client', 15: 'feat: cache forecasts per region', 16: 'feat: show the forecast card', 17: 'docs: describe the forecast settings' };

// The stack field the agent writes into review.json, bottom to top. The lowest PR is merged.
function stackFixture(numbers, current) {
  return {
    number: 31,
    source: 'github',
    base: 'main',
    prs: numbers.map((number, at) => ({
      number,
      title: TITLES[number],
      url: `https://github.com/example-org/sample-widget/pull/${number}`,
      state: at === 0 && number !== current ? 'merged' : 'open',
      approved: false,
      summary: '',
    })),
  };
}

// The review on the page is #15, the second PR of the stack.
const onPage = (data) => {
  data.pr.number = 15;
  data.pr.title = TITLES[15];
  data.stack = stackFixture([14, 15, 16, 17], 15);
};

// #14 has a review of its own, which the reviewer posted before the PR merged.
const merged = () => {
  const data = fixture();
  data.pr.number = 14;
  data.pr.title = TITLES[14];
  data.stack = stackFixture([14, 15, 16, 17], 14);
  return data;
};

const button = (page) => page.getByRole('banner').getByRole('button', { name: /^Stack · / });
const row = (page, number) => page.getByRole('listitem').filter({ hasText: `#${number} ${TITLES[number]}` });

test("shows the PR's place in the stack and the stack as a line from the bottom PR", async ({ page }) => {
  await openReview(page, { mutate: onPage, others: [merged()] });
  await expect(button(page)).toHaveText(/Stack · 2 of 4/);
  await button(page).click();
  const rows = page.getByRole('list', { name: 'PRs in this stack, bottom to top' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);
  for (const [at, number] of [14, 15, 16, 17].entries()) await expect(rows.nth(at)).toContainText(`#${number}`);
  await expect(row(page, 15)).toContainText('this page');
  await expect(row(page, 14)).toContainText('Merged');
  await expect(row(page, 14)).toContainText('merged');
});

test('opens the review page of a PR that has a review', async ({ page }) => {
  await openReview(page, { mutate: onPage, others: [merged()] });
  await button(page).click();
  await row(page, 14).getByRole('link', { name: /#14/ }).click();
  await expect(page).toHaveURL(/\/example-org\/sample-widget\/14$/);
});

test('offers Start a review for a PR without a review', async ({ page }) => {
  await openReview(page, { mutate: onPage, others: [merged()] });
  await button(page).click();
  await expect(row(page, 16)).toContainText('Not reviewed');
  await expect(row(page, 16).getByRole('button', { name: 'Start a review' })).toBeVisible();
});

test('shows no stack switch for a PR that is in no stack, or alone in it', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => { if (request.url().endsWith('/stack')) requests.push(request.url()); });
  await openReview(page);
  await expect(page.getByRole('banner').getByRole('button', { name: /session/ })).toBeVisible();
  await expect(button(page)).toHaveCount(0);

  await openReview(page, { mutate: (data) => { data.stack = stackFixture([17], 17); } });
  await expect(page.getByRole('banner').getByRole('button', { name: /session/ })).toBeVisible();
  await expect(button(page)).toHaveCount(0);
  expect(requests).toEqual([]);
});

// A review directory without review.json has no page yet (the page answers 404), so the row has no link.
const reviewDirOf = async (page, review, number, file, content) => {
  const dir = path.join(path.dirname(review.dir), String(number));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
  await page.reload();
  await button(page).click();
};

test('shows a PR whose review another session runs, without a link or Start a review', async ({ page }) => {
  const review = await openReview(page, { mutate: onPage, others: [merged()] });
  // The test runner stands in for the watch process of the other session.
  await reviewDirOf(page, review, 16, 'session.json', JSON.stringify({ sessionId: 'def-456', cwd: '/work', worktree: null, watcherPid: process.pid }));
  await expect(row(page, 16)).toContainText('Reviewed in another session');
  await expect(row(page, 16).getByRole('link')).toHaveCount(0);
  await expect(row(page, 16).getByRole('button', { name: 'Start a review' })).toHaveCount(0);
});

test('shows a PR whose review the agent prepares, without a link or Start a review', async ({ page }) => {
  const review = await openReview(page, { mutate: onPage, others: [merged()] });
  await reviewDirOf(page, review, 16, 'preparing', '');
  await expect(row(page, 16)).toContainText('Preparing the review…');
  await expect(row(page, 16).getByRole('link')).toHaveCount(0);
  await expect(row(page, 16).getByRole('button', { name: 'Start a review' })).toHaveCount(0);
});

test('offers no Start a review while the stack request fails', async ({ page }) => {
  await page.route('**/stack', (route) => route.fulfill({ status: 500 }));
  const failed = page.waitForResponse((response) => response.url().endsWith('/stack'));
  await openReview(page, { mutate: onPage, others: [merged()] });
  await failed;
  await button(page).click();
  await expect(row(page, 16)).toContainText('Not reviewed');
  await expect(page.getByRole('button', { name: 'Start a review' })).toHaveCount(0);
});

test('shows no stack switch when this PR is not in the stack', async ({ page }) => {
  await openReview(page, { mutate: (data) => { data.stack = stackFixture([14, 15, 16], 15); } });
  await expect(page.getByRole('banner').getByRole('button', { name: /session/ })).toBeVisible();
  await expect(button(page)).toHaveCount(0);
});
