'use strict';
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');

async function openHome(page, options) {
  const review = await openReview(page, options);
  await page.getByRole('button', { name: 'Home' }).click();
  return review;
}

test('shows the PR title, author, description and AI summary', async ({ page }) => {
  await openHome(page);
  const main = page.getByRole('main');
  const banner = page.getByRole('banner');
  await expect(banner.getByRole('heading', { name: 'feat: add three-day forecast' })).toBeVisible();
  await expect(banner.getByText('by sample-author')).toBeVisible();
  await expect(main.getByText('The PR fetches a three-day forecast and shows it in a card.')).toBeVisible();
  await main.getByText('Description', { exact: true }).click();
  await expect(main.getByText('forecast card.')).toBeVisible();
});

test('names the PR in the page title, on the first view and on Home', async ({ page }) => {
  const title = 'Guided PR Review: feat: add three-day forecast example-org/sample-widget#17';
  await openReview(page);
  await expect(page).toHaveTitle(title);
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveTitle(title);
});

// A check row names the problem in one line; its detail opens in place.
const check = (page, name) => page.getByRole('main').getByRole('group', { name: 'What needs your attention' }).locator('details[id^="home-"]').filter({ has: page.locator(':scope > summary', { hasText: name }) });
const openCheck = async (page, name) => { await check(page, name).locator(':scope > summary').click(); };

test('lists what needs your attention, worst first, each in one line that opens its detail', async ({ page }) => {
  await openHome(page);
  const rows = page.getByRole('main').getByRole('group', { name: 'What needs your attention' }).locator('details[id^="home-"] > summary');
  await expect(rows).toHaveText([/1 of 2 acceptance criteria not met.*WX-42#2/, /3 open AI findings.*TTL is in milliseconds/, /1 earlier comment of yours to decide/, /1 open comment by others/]);
  await expect(page.getByText('Caches the forecast for one hour.').first()).toBeVisible();
  await expect(page.getByText('Shows three days with min and max temperature.')).toBeHidden();
  await openCheck(page, 'acceptance criteria');
  await page.getByText('Show the 1 met criterion').click();
  await expect(page.getByText('Shows three days with min and max temperature.')).toBeVisible();
});

test('a check takes the severity colour of its worst item: an unmet criterion counts as the worst severity', async ({ page }) => {
  await openHome(page);
  const disc = (name) => check(page, name).locator('[data-check-level]');
  await expect(disc('acceptance criteria')).toHaveAttribute('data-check-level', '3');
  await expect(disc('open AI findings')).toHaveAttribute('data-check-level', '3');
  await expect(disc('earlier comment')).toHaveAttribute('data-check-level', '1');
  await expect(disc('comment by others')).toHaveAttribute('data-check-level', 'none');
});

test('the findings check counts per severity, on the whole PR and in the flows', async ({ page }) => {
  await openHome(page);
  await openCheck(page, 'open AI findings');
  const detail = check(page, 'open AI findings');
  await expect(detail).toContainText('1 major · 1 medium · 1 nit');
  await expect(detail).toContainText('1 on the whole PR · 2 in the flows');
  await expect(detail.getByText('No test for the card').first()).toBeVisible();
});

test('the comment outside the diff opens from its check; coverage and what the AI did not read sit under Also checked', async ({ page }) => {
  await openHome(page);
  await openCheck(page, 'open comment by others');
  await expect(page.getByText('The README does not mention the card.', { exact: true })).toBeVisible();
  const also = page.getByRole('main').getByRole('group', { name: 'Also checked' });
  await also.locator('summary', { hasText: 'Coverage' }).click();
  await expect(also.locator('#home-coverage p')).toContainText('Line coverage 81%, the new card has no test.');
  await also.locator('summary', { hasText: 'not read by the AI' }).click();
  await expect(page.getByText('Confluence: no tool can read Confluence')).toBeVisible();
});

test('with every criterion met, the criteria check moves to Also checked', async ({ page }) => {
  await openHome(page, { mutate: (data) => { data.context.tickets[0].acceptanceCriteria[1].verdict = 'met'; } });
  await expect(check(page, 'acceptance criteria')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('group', { name: 'Also checked' })).toContainText('All 2 criteria met');
});

test('the PR section names the tickets and linked pull requests in one line, the description opens on click', async ({ page }) => {
  await openHome(page);
  const pr = page.getByRole('main').getByRole('region', { name: 'This pull request' });
  await expect(pr.getByRole('link', { name: 'WX-42', exact: true })).toBeVisible();
  await expect(pr.getByRole('link', { name: 'example-org/sample-api#8' })).toHaveAttribute('title', /Adds the endpoint this PR calls./);
  await expect(pr.getByText('forecast card.')).toBeHidden();
  await pr.getByText('Description', { exact: true }).click();
  await expect(pr.getByText('forecast card.')).toBeVisible();
  await expect(pr.getByText('Adds the endpoint this PR calls.')).toBeVisible();
});

test('the flow tiles carry the findings and the seen count, and your review sits in the side panel', async ({ page }) => {
  await openHome(page);
  const tile = (name) => page.getByRole('banner').getByRole('button', { name: new RegExp(name) });
  await expect(tile('Show the forecast')).toContainText('3 hunks · 2 findings');
  await expect(tile('Store the forecast')).toContainText('2 hunks · 1 finding');
  const mine = page.getByRole('main').getByRole('region', { name: 'Your review' });
  await expect(mine).toContainText('0/7');
  await expect(mine.getByRole('definition')).toHaveText(['0/7', '1']);
  await expect(mine.getByRole('term')).toHaveText(['seen', 'remark']);
  await expect(mine.getByRole('button', { name: 'Continue reviewing' })).toBeVisible();
});

test('since your last review: changed hunks, the findings on them, and what changed, open until you fold it', async ({ page }) => {
  await openHome(page, {
    // The card compares with your last submitted review, made on the commit the summary starts from.
    mutate: (data) => { data.changesSince = { from: '9f8e7d6c5b4a', to: 'aaa111', summary: '- The TTL is one hour.' }; data.reviews.find((review) => review.id === 502).commitId = '9f8e7d6c5b4a'; },
    reviewer: { knownHunks: ['aaaaaaaaaaa2', 'aaaaaaaaaaa3', 'aaaaaaaaaaa4', 'aaaaaaaaaaa5', 'aaaaaaaaaaa6', 'aaaaaaaaaaa7'] },
  });
  const since = page.getByRole('main').getByRole('region', { name: 'Since your last review' });
  await expect(since).toContainText('1 new or changed hunk');
  await expect(since).toContainText('1 open finding on changed code');
  await expect(since.getByText('The TTL is one hour.')).toBeVisible();
  await since.getByRole('button', { name: 'What changed' }).click();
  await expect(since.getByText('The TTL is one hour.')).toBeHidden();
});

test('a changed hunk stays marked after a reload, until you open it', async ({ page }) => {
  const review = await openHome(page, { reviewer: { knownHunks: ['aaaaaaaaaaa2', 'aaaaaaaaaaa3', 'aaaaaaaaaaa4', 'aaaaaaaaaaa5', 'aaaaaaaaaaa6', 'aaaaaaaaaaa7'] } });
  const since = page.getByRole('main').getByRole('region', { name: 'Since your last visit' });
  await expect(since).toContainText('1 new or changed hunk');
  await review.saved((reviewer) => (reviewer.changedHunks || []).includes('aaaaaaaaaaa1'));
  await page.reload();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(since).toContainText('1 new or changed hunk');
  await page.getByRole('main').getByRole('button', { name: 'Show the first changed hunk' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(since).toHaveCount(0);
});

test('the page names its language, and a check names its severity to a screen reader', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(check(page, 'acceptance criteria').locator(':scope > summary')).toContainText('major: 1 of 2 acceptance criteria not met');
  await expect(check(page, 'open comment by others').locator(':scope > summary .sr-only')).toHaveCount(0);
});

test('under reduced motion the checks open without an animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);
  const duration = await check(page, 'acceptance criteria').evaluate((details) => getComputedStyle(details, '::details-content').transitionDuration);
  expect(duration.split(',').every((part) => parseFloat(part) < 0.001)).toBe(true);
});

// Without a submitted review on the commit the summary starts from, the card compares with your last visit.
test('the card says since your last visit when no review of yours was made on the commit it starts from', async ({ page }) => {
  await openHome(page, { mutate: (data) => { data.changesSince = { from: '9f8e7d6c5b4a', to: 'aaa111', summary: '- The TTL is one hour.' }; } });
  await expect(page.getByRole('main').getByRole('region', { name: 'Since your last visit' })).toContainText('9f8e7d6 → aaa111');
  await expect(page.getByRole('main').getByRole('region', { name: 'Since your last review' })).toHaveCount(0);
});
