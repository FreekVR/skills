'use strict';
const { test, expect } = require('@playwright/test');
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

const loadNewCommits = async (page, review) => {
  review.update((data) => { data.remote.headSha = 'bbb222'; });
  await page.getByRole('button', { name: 'Load the new commits' }).click();
  return eventOf(review, 'refresh');
};

test('loading new commits: the banner keeps saying the agent is loading, also after a reload', async ({ page }) => {
  const review = await openReview(page);
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
  await page.getByRole('button', { name: 'Show the first changed hunk' }).click();
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
  const panel = main(page).getByRole('region', { name: 'Changed since your last review' });
  await expect(panel).toContainText('9f8e7d6 → aaa111');
  await expect(panel.locator('li')).toHaveCount(2);
  review.update((data) => { data.changesSince.to = 'an-older-commit'; });
  await expect(panel).toBeHidden();
});
