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
