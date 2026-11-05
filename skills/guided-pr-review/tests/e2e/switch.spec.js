'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');
const { review: fixture } = require('./fixture.js');

const other = () => {
  const data = fixture();
  data.pr.number = 18;
  data.pr.title = 'fix: round the temperature';
  return data;
};

test('the page names its PR, and the review switch lists it first, marked as this page', async ({ page }) => {
  const first = fixture();
  first.pr.number = 9;
  first.pr.title = 'chore: an older PR';
  await openReview(page, { others: [first] });
  await expect(page.getByRole('complementary', { name: 'Review navigation' })).toContainText('example-org/sample-widget#17feat: add three-day forecast');
  await page.getByRole('banner').getByText('2 sessions').click();
  const items = page.getByRole('listitem').filter({ hasText: 'example-org/sample-widget#' });
  await expect(items.first()).toContainText('example-org/sample-widget#17');
  await expect(items.first()).toContainText('this page');
  await expect(items.first()).toHaveAttribute('aria-current', 'page');
});

test('the review switch lists both reviews and shows how to resume one that does not run', async ({ page }) => {
  await openReview(page, { others: [other()] });
  await page.getByRole('banner').getByText('2 sessions').click();
  await expect(page.getByText('feat: add three-day forecast', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('fix: round the temperature')).toBeVisible();
  await expect(page.getByText('Not running.')).toBeVisible();
  await expect(page.getByText('Ask your agent to resume the guided review of example-org/sample-widget#18.')).toBeVisible();
});

// One server serves every review, so the switch links to the other review's path on the same server.
test('the review switch links to another review on the same server', async ({ page }) => {
  await openReview(page, { others: [other()] });
  await page.getByRole('banner').getByText('2 sessions').click();
  await expect(page.getByRole('link', { name: /fix: round the temperature/ })).toHaveAttribute('href', '/example-org/sample-widget/18');
});

test('when the server stops the page says the review is not running and shows the resume command', async ({ page }) => {
  const review = await openReview(page);
  fs.writeFileSync(path.join(review.dir, 'session.json'), JSON.stringify({ sessionId: 'abc-123', cwd: '/work/sample widget', worktree: null }));
  // The resume command comes from the list of reviews, so the page must have it before the server stops.
  const listed = page.waitForResponse((response) => /\/(api\/)?reviews$/.test(new URL(response.url()).pathname));
  await page.reload();
  await listed;

  review.stop();
  await expect(page.getByRole('main').getByText('This review is not running.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("cd '/work/sample widget' && claude --resume abc-123")).toBeVisible();
});

test('the review switch scrolls when its sessions do not fit in the window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  const others = Array.from({ length: 12 }, (_, index) => {
    const data = other();
    data.pr.number = 100 + index;
    data.pr.title = `fix: session ${index}`;
    return data;
  });
  await openReview(page, { others });
  await page.getByRole('banner').getByText('13 sessions').click();
  const last = page.getByRole('link', { name: /fix: session 11/ });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

const checks = (review) => review.events().filter((event) => event.type === 'check').length;

test('pause and play the agent from the review switch, and play asks the agent to check GitHub', async ({ page }) => {
  const review = await openReview(page);
  const paused = path.join(review.dir, 'paused');
  // The test runner stands in for the agent's watch process, so the review counts as running.
  fs.writeFileSync(path.join(review.dir, 'session.json'), JSON.stringify({ sessionId: 'abc-123', cwd: '/work', worktree: null, watcherPid: process.pid }));
  await page.reload();
  await page.getByRole('banner').getByText('1 session').click();
  await page.getByRole('button', { name: 'Pause the agent of example-org/sample-widget#17' }).click();
  await expect.poll(() => fs.existsSync(paused)).toBe(true);
  await expect(page.getByText('Agent paused.')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Agent paused.')).toBeVisible();
  const before = checks(review);
  await page.getByRole('banner').getByText('1 session').click();
  await page.getByRole('button', { name: 'Resume the agent of example-org/sample-widget#17' }).click();
  await expect.poll(() => fs.existsSync(paused)).toBe(false);
  await expect(page.getByText('Agent paused.')).toBeHidden();
  await expect.poll(() => checks(review)).toBe(before + 1);
});

// Sets the time of the last activity of a review in the state directory, a number of days ago.
function lastActive(review, owner, repo, number, daysAgo) {
  const dir = path.join(review.stateHome, 'guided-pr-review', owner, repo, String(number));
  const at = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
  fs.utimesSync(path.join(dir, 'review.json'), at, at);
}
const prOf = (number, title, change = () => {}) => {
  const data = fixture();
  data.pr.number = number;
  data.pr.title = title;
  change(data);
  return data;
};
const sessions = (page) => page.getByRole('banner').getByRole('button', { name: /sessions?:/ });

test('the review switch groups the reviews by repository, the newest first', async ({ page }) => {
  const review = await openReview(page, {
    others: [prOf(9, 'chore: an older PR'), prOf(18, 'fix: round the temperature'), prOf(3, 'feat: the forecast endpoint', (data) => { data.pr.repo = 'sample-api'; })],
  });
  lastActive(review, 'example-org', 'sample-widget', 9, 6);
  lastActive(review, 'example-org', 'sample-widget', 18, 2);
  lastActive(review, 'example-org', 'sample-api', 3, 1);
  await page.reload();
  await sessions(page).click();
  const groups = page.getByRole('list', { name: /^Reviews in / });
  await expect(groups).toHaveCount(2);
  await expect(groups.first()).toHaveAccessibleName('Reviews in example-org/sample-widget');
  await expect(groups.first().getByRole('listitem')).toHaveText([/#17.*this page/, /#18.*2 days ago/, /#9.*last week/]);
  await expect(groups.last().getByRole('listitem')).toHaveText([/sample-api#3.*yesterday/]);
});

test('the review switch folds away merged and closed reviews that were quiet for 14 days', async ({ page }) => {
  const review = await openReview(page, {
    others: [prOf(9, 'chore: an older PR', (data) => { data.remote = { state: 'merged' }; }), prOf(18, 'fix: round the temperature', (data) => { data.remote = { state: 'closed' }; })],
  });
  lastActive(review, 'example-org', 'sample-widget', 9, 20);
  lastActive(review, 'example-org', 'sample-widget', 18, 3);
  await page.reload();
  await sessions(page).click();
  await expect(page.getByText('fix: round the temperature')).toBeVisible();
  await expect(page.getByText('chore: an older PR')).toBeHidden();
  await page.getByText('1 older merged or closed').click();
  await expect(page.getByText('chore: an older PR')).toBeVisible();
});

test('remove a review from the review switch after you confirm it', async ({ page }) => {
  const review = await openReview(page, { others: [other()] });
  const dir = path.join(review.stateHome, 'guided-pr-review', 'example-org', 'sample-widget', '18');
  await sessions(page).click();
  await page.getByRole('button', { name: 'Remove the review of example-org/sample-widget#18' }).click();
  await expect(page.getByText('Delete the review folder of #18 and its worktree?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(fs.existsSync(dir)).toBe(true);
  await page.getByRole('button', { name: 'Remove the review of example-org/sample-widget#18' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('fix: round the temperature')).toBeHidden();
  expect(fs.existsSync(dir)).toBe(false);
  await expect(page.getByRole('button', { name: /^Remove the review of .*#17$/ })).toHaveCount(0);
});

test('a review that cannot be removed stays in the switch with the reason', async ({ page }) => {
  const review = await openReview(page, { others: [other()] });
  const dir = path.join(review.stateHome, 'guided-pr-review', 'example-org', 'sample-widget', '18');
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify({ sessionId: null, cwd: '/', worktree: review.stateHome }));
  await sessions(page).click();
  await page.getByRole('button', { name: 'Remove the review of example-org/sample-widget#18' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText(/not a git repository/)).toBeVisible();
  await expect(page.getByText('fix: round the temperature')).toBeVisible();
  expect(fs.existsSync(dir)).toBe(true);
});
