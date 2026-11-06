'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openReview, eventOf } = require('./helpers.js');
const { H } = require('./fixture.js');

const main = (page) => page.getByRole('main');

test('new commits: the banner loads them and a changed hunk shows as changed and not seen', async ({ page }) => {
  const review = await openReview(page);
  await page.getByRole('complementary').getByRole('button', { name: /^Show the forecast/ }).click();
  review.update((data) => { data.remote.headSha = 'bbb222'; });
  await expect(main(page).getByText('New commits on this PR.')).toBeVisible();

  await page.getByRole('button', { name: 'Load the new commits' }).click();
  await eventOf(review, 'refresh');

  review.update((data) => {
    const hunk = data.hunks.find((candidate) => candidate.id === H.card);
    hunk.id = 'bbbbbbbbbbb3';
    hunk.lines = ['+export function ForecastCard({ days }) {', '+  return days.map(renderCompactDay);', '+}'];
    for (const flow of data.flows) for (const step of flow.steps) if (step.hunkId === H.card) step.hunkId = hunk.id;
    data.pr.headSha = 'bbb222';
    data.refreshes = [{ eventId: review.events().find((event) => event.type === 'refresh').id, status: 'done', from: 'aaa111', to: 'bbb222' }];
    data.changesSince = { from: 'aaa111', to: 'bbb222', summary: '- The card now uses a compact day.' };
  });
  await expect(main(page).getByText('New commits on this PR.')).toBeHidden();
  const stop = page.getByRole('button', { name: /^A3 src\/components\/ForecastCard\.tsx, not seen/ });
  await expect(stop).toContainText('changed');
  await stop.click();
  await expect(page.getByRole('region', { name: 'Diff of src/components/ForecastCard.tsx' })).toContainText('renderCompactDay');
});

test('new comments: the banner opens the comment', async ({ page }) => {
  const review = await openReview(page);
  review.update((data) => {
    data.reviewComments.push({ id: 'c3', reviewId: 501, threadId: 'T-c3', author: 'late-reviewer', url: 'https://github.com/example-org/sample-widget/pull/17#discussion_r9', hunkId: H.card, path: 'src/components/ForecastCard.tsx', line: 2, side: 'RIGHT',
      body: 'Why map here?', diffHunk: '', resolved: false, replies: [] });
  });
  await expect(main(page).getByText('1 new comment')).toBeVisible();
  await expect(main(page).getByText('@late-reviewer')).toBeVisible();

  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(main(page).getByText('Why map here?')).toBeVisible();
  await expect(main(page).getByText('1 new comment')).toBeHidden();
});

test('merged PR: the banner offers Finish, which sends a finish event', async ({ page }) => {
  const review = await openReview(page);
  review.update((data) => { data.remote.state = 'merged'; });
  await expect(main(page).getByText('This PR is merged.')).toBeVisible();

  await page.getByRole('button', { name: 'Finish the review' }).click();
  await eventOf(review, 'finish');
  await expect(main(page).getByText('The agent asks in the chat whether to delete the review data.')).toBeVisible();
});

test('a failed check: the banner shows the error until a later check removes it', async ({ page }) => {
  const review = await openReview(page);
  review.update((data) => { data.remote.error = 'gh: HTTP 502'; });
  await expect(main(page).getByText('The agent could not reach GitHub: gh: HTTP 502')).toBeVisible();
  review.update((data) => { delete data.remote.error; });
  await expect(main(page).getByText('The agent could not reach GitHub')).toBeHidden();
});

const loadNewCommits = async (page, review) => {
  review.update((data) => { data.remote.headSha = 'bbb222'; });
  await page.getByRole('button', { name: 'Load the new commits' }).click();
  return eventOf(review, 'refresh');
};

test('loading new commits: the banner keeps saying the agent is loading, also after a reload', async ({ page }) => {
  const review = await openReview(page);
  fs.writeFileSync(path.join(review.dir, 'session.json'), JSON.stringify({ sessionId: 'sample-session', cwd: review.dir, watcherPid: process.pid }));
  await loadNewCommits(page, review);
  await expect(main(page).getByText('The agent is loading the new commits…')).toBeVisible();
  await review.saved((state) => state.sent?.some((sent) => sent.type === 'refresh'));
  await page.reload();
  await expect(main(page).getByText('The agent is loading the new commits…')).toBeVisible();
});

test('loaded new commits: the banner says what changed, that no reload is needed, and opens the first changed hunk', async ({ page }) => {
  const review = await openReview(page);
  const event = await loadNewCommits(page, review);
  review.update((data) => {
    const hunk = data.hunks.find((candidate) => candidate.id === H.card);
    hunk.id = 'bbbbbbbbbbb3';
    for (const flow of data.flows) for (const step of flow.steps) if (step.hunkId === H.card) step.hunkId = hunk.id;
    data.pr.headSha = 'bbb222';
    data.refreshes = [{ eventId: event.id, status: 'done', from: 'aaa111', to: 'bbb222' }];
    data.changesSince = { from: 'aaa111', to: 'bbb222', summary: 'The card now shows a compact day.' };
  });
  const banner = main(page).getByText('Loaded the new commits').locator('..');
  await expect(banner).toContainText('aaa111 → bbb222');
  await expect(banner).toContainText('1 hunk new or changed');
  await expect(banner).toContainText('The page is up to date; no reload needed.');
  await expect(main(page).getByText('The card now shows a compact day.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Show the first changed hunk' }).first().click();
  await expect(page.getByRole('button', { name: /^A3 / })).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(main(page).getByText('Loaded the new commits')).toBeHidden();
});

test('loading new commits failed: the banner shows the error and asks again', async ({ page }) => {
  const review = await openReview(page);
  const event = await loadNewCommits(page, review);
  review.update((data) => { data.refreshes = [{ eventId: event.id, status: 'error', message: 'git fetch failed' }]; });
  await expect(main(page).getByText('The agent could not load the new commits: git fetch failed')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => review.events().filter((sent) => sent.type === 'refresh').length).toBe(2);
});

test('home shows what changed since your last review, for the commit on this page only', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { data.changesSince = { from: '9f8e7d6c5b4a', to: 'aaa111', summary: '- Days come from the settings now.\n- The TTL is one hour.' }; } });
  const panel = main(page).getByRole('region', { name: /^Since your last/ });
  await expect(panel).toContainText('9f8e7d6 → aaa111');
  await expect(panel.locator('li')).toHaveCount(2);
  review.update((data) => { data.changesSince.to = 'an-older-commit'; });
  await expect(panel).toBeHidden();
});

const preparing = (review, content) => fs.writeFileSync(path.join(review.dir, 'preparing'), content);
const live = (review) => fs.writeFileSync(path.join(review.dir, 'session.json'), JSON.stringify({ sessionId: 'sample-session', cwd: review.dir, watcherPid: process.pid }));

test('a banner says that the agent still prepares the review and shows its step until it is done', async ({ page }) => {
  const review = await openReview(page);
  live(review);
  await expect(page.getByText('The agent is still preparing this review.')).toBeHidden();
  preparing(review, JSON.stringify({ step: 'running the AI reviews', since: '2026-11-04T10:00:00Z' }));
  await expect(page.getByText('The agent is still preparing this review.')).toBeVisible();
  await expect(page.getByText('Now: running the AI reviews.')).toBeVisible();
  await expect(page.getByText('Findings and explanations can still appear.')).toBeVisible();
  await expect(page.getByText('Preparing…')).toBeVisible();
  fs.rmSync(path.join(review.dir, 'preparing'));
  await expect(page.getByText('The agent is still preparing this review.')).toBeHidden();
  // The agent read the PR while it prepared, so the page does not wait for the check it skipped.
  await expect(main(page).getByText('Checking GitHub for new commits.')).toBeHidden();
});

test('the preparing banner says that no agent runs the review when the session is gone', async ({ page }) => {
  const review = await openReview(page);
  preparing(review, '');
  await expect(page.getByText('The agent is still preparing this review.')).toBeVisible();
  await expect(page.getByText('Now:')).toBeHidden();
  await expect(page.getByText('No agent runs this review, so the preparation has stopped.')).toBeVisible();
});

// The page shows what it last read until the agent answers the check it sent as it opened.
test('on open the page says that it checks GitHub, and loads new commits at once when the agent finds them', async ({ page }) => {
  const review = await openReview(page);
  await expect(main(page).getByText('Checking GitHub for new commits.')).toBeVisible();
  await eventOf(review, 'check');
  review.update((data) => { data.remote = { ...data.remote, headSha: 'bbb222', checkedAt: new Date().toISOString() }; });
  await expect(main(page).getByText('Checking GitHub for new commits.')).toBeHidden();
  await eventOf(review, 'refresh');
});

test('when the check on open fails, only the error shows, not that the page still checks', async ({ page }) => {
  const review = await openReview(page);
  review.update((data) => { data.remote.error = 'HTTP 502'; data.remote.checkedAt = new Date().toISOString(); });
  await expect(main(page).getByText('The agent could not reach GitHub: HTTP 502')).toBeVisible();
  await expect(main(page).getByText('Checking GitHub for new commits.')).toBeHidden();
  // Home does not wait for that check either.
  review.update((data) => { data.checkedSha = 'zzz000'; });
  await expect(main(page).getByText('The agent has not checked the code of this commit yet.')).toBeVisible();
});

test('new commits that a later check finds wait for the reviewer to load them', async ({ page }) => {
  const review = await openReview(page);
  review.update((data) => { data.remote.checkedAt = new Date().toISOString(); });
  await expect(main(page).getByText('Checking GitHub for new commits.')).toBeHidden();
  review.update((data) => { data.remote = { ...data.remote, headSha: 'bbb222', checkedAt: new Date().toISOString() }; });
  await expect(page.getByRole('button', { name: 'Load the new commits' })).toBeVisible();
  // Two polls of review.json, so the page had the chance to send a refresh.
  await page.waitForTimeout(6500);
  expect(review.events().filter((event) => event.type === 'refresh')).toHaveLength(0);
});

// checkedSha is the head commit whose hunks the agent took through its checks.
const notChecked = 'The agent has not checked the code of this commit yet.';
const answered = (data) => { data.remote.checkedAt = new Date().toISOString(); };

test('Home asks the agent to check a head commit it has not checked, and shows that it works on it', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { data.checkedSha = 'zzz000'; } });
  live(review);
  await expect(main(page).getByText(notChecked)).toBeHidden();
  review.update(answered);
  await page.getByRole('button', { name: 'Ask the agent to check it' }).click();
  await eventOf(review, 'refresh');
  await expect(main(page).getByText('The agent is checking the code of this commit…')).toBeVisible();
  await expect(main(page).getByText('New commits on this PR.')).toBeHidden();
  review.update((data) => { data.checkedSha = 'aaa111'; });
  await expect(main(page).getByText('The agent is checking the code of this commit…')).toBeHidden();
});

test('Home says how to resume the agent when a head commit is not checked and no agent runs', async ({ page }) => {
  // Nothing answers the check on open without an agent, so Home does not wait for it.
  await openReview(page, { mutate: (data) => { data.checkedSha = 'zzz000'; } });
  await expect(main(page).getByText(notChecked)).toBeVisible();
  await expect(main(page).getByText('No agent runs this review. Resume it to check this commit.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask the agent to check it' })).toBeHidden();
});

test('Home shows nothing about checking when the head commit is checked, or the review has no checkedSha', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { data.checkedSha = 'aaa111'; } });
  review.update(answered);
  await expect(main(page).getByText('Checking GitHub for new commits.')).toBeHidden();
  await expect(main(page).getByText(notChecked)).toBeHidden();
  review.update((data) => { delete data.checkedSha; });
  await expect(main(page).getByText(notChecked)).toBeHidden();
});

test('a page opened in a background tab sends the check on open when it becomes visible', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.visibility || 'hidden' }));
  const review = await openReview(page);
  await page.waitForTimeout(500);
  expect(review.events().filter((event) => event.type === 'check')).toHaveLength(0);
  await expect(main(page).getByText('Checking GitHub for new commits.')).toBeHidden();
  await page.evaluate(() => { window.visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
  await eventOf(review, 'check');
  await expect(main(page).getByText('Checking GitHub for new commits.')).toBeVisible();
});

test('an error from an earlier check does not end the wait for the check on open', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { data.remote.error = 'HTTP 502'; } });
  await eventOf(review, 'check');
  // One poll of review.json with the old error, before the agent answers.
  await page.waitForTimeout(3500);
  review.update((data) => { delete data.remote.error; data.remote = { ...data.remote, headSha: 'bbb222', checkedAt: new Date().toISOString() }; });
  await eventOf(review, 'refresh');
});
