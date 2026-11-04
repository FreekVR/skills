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
// The rows of the stack switch. Home lists the same PRs, so the row is looked for in the switch only.
const row = (page, number) => page.getByRole('dialog').getByRole('listitem').filter({ hasText: `#${number} ${TITLES[number]}` });

test("shows the PR's place in the stack and the stack as a line from the bottom PR", async ({ page }) => {
  await openReview(page, { mutate: onPage, others: [merged()] });
  await expect(button(page)).toHaveText(/Stack · 2 of 4/);
  await button(page).click();
  const rows = page.getByRole('dialog').getByRole('list', { name: 'PRs in this stack, bottom to top' }).getByRole('listitem');
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

const SUMMARIES = { 14: 'Adds the client that calls the forecast endpoint.', 15: 'Caches the client’s answers for one hour.', 16: 'Shows three days in a card on the dashboard.', 17: 'README and settings docs.' };

// The stack on Home: one AI line per PR, and for each criterion of WX-42 the PR that meets it.
// #14 confirmed #1 in its full review, #16 is expected to meet #3 from its highlights, this PR does not meet #2, and no PR covers #4.
const onHome = (data) => {
  onPage(data);
  for (const pr of data.stack.prs) pr.summary = SUMMARIES[pr.number];
  data.stack.prs[0].approved = true;
  data.context.tickets[0].acceptanceCriteria = [
    { id: 'WX-42#1', text: 'Fetches a three-day forecast.', source: 'ticket', verdict: 'elsewhere', pr: 14 },
    { id: 'WX-42#2', text: 'Caches the forecast for one hour.', source: 'ticket', verdict: 'not-met', note: 'The TTL is one minute.' },
    { id: 'WX-42#3', text: 'Shows three days with min and max temperature.', source: 'ticket', verdict: 'elsewhere', pr: 16 },
    { id: 'WX-42#4', text: 'The forecast region is a setting.', source: 'ticket' },
  ];
  data.stack.coverage = [{ criterion: 'WX-42#3', pr: 16, status: 'expected' }, { criterion: 'WX-42#4', pr: null, status: 'expected' }];
  data.stack.outsideTickets = [{ pr: 17, text: 'Renames the WEATHER_* settings.', status: 'expected' }];
};

const mergedWithCriteria = () => {
  const data = merged();
  data.context.tickets[0].acceptanceCriteria = [{ id: 'WX-42#1', text: 'Fetches a three-day forecast.', source: 'ticket', verdict: 'met' }];
  return data;
};

const homeStack = (page) => page.getByRole('region', { name: 'This PR in its stack' });

test('Home shows the stack with one AI line per PR', async ({ page }) => {
  await openReview(page, { mutate: onHome, others: [mergedWithCriteria()] });
  const rows = homeStack(page).getByRole('list', { name: 'PRs in this stack, bottom to top' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);
  for (const [at, number] of [14, 15, 16, 17].entries()) {
    await expect(rows.nth(at)).toContainText(`#${number} ${TITLES[number]}`);
    await expect(rows.nth(at)).toContainText(SUMMARIES[number]);
  }
  await expect(homeStack(page)).toContainText('stack #31, 4 PRs, base main');
  await expect(rows.nth(0)).toContainText('Approved by you');
  await expect(rows.nth(1)).toContainText('this page');
  await expect(rows.nth(2)).toContainText('Not reviewed');
  await expect(rows.nth(0).getByRole('link', { name: '#14' })).toHaveAttribute('href', /example-org\/sample-widget\/issues\/14$/);
});

test('the coverage table marks criteria confirmed, expected, not met and in no PR', async ({ page }) => {
  await openReview(page, { mutate: onHome, others: [mergedWithCriteria()] });
  const table = homeStack(page).getByRole('table', { name: 'Does the stack cover WX-42?' });
  const cell = (id, number) => table.getByRole('row').filter({ hasText: id }).getByRole('cell').nth([14, 15, 16, 17].indexOf(number) + 1);
  await expect(cell('WX-42#1', 14)).toHaveText(/confirmed/);
  await expect(cell('WX-42#2', 15)).toHaveText(/not met/);
  await expect(cell('WX-42#3', 16)).toHaveText(/expected/);
  await expect(table.getByRole('row').filter({ hasText: 'WX-42#4' })).toContainText('no PR');
  await expect(table.getByRole('row').filter({ hasText: 'WX-42#2' })).not.toContainText('no PR');
  await expect(cell('WX-42#1', 16)).toHaveText('');
});

test('a criterion another PR meets shows In #16 in this PR\'s criteria', async ({ page }) => {
  await openReview(page, { mutate: (data) => {
    onPage(data);
    data.context.tickets[0].acceptanceCriteria[0] = { ...data.context.tickets[0].acceptanceCriteria[0], verdict: 'elsewhere', pr: 16 };
  } });
  const panel = page.locator('#home-criteria');
  await expect(panel).toContainText('1 of 2 criteria not met');
  await expect(panel.getByRole('listitem').filter({ hasText: 'WX-42#1' })).toContainText('In #16');
});

test('a PR in no stack shows no stack section, no In #… criterion and asks no stack status', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => { if (request.url().endsWith('/stack')) requests.push(request.url()); });
  await openReview(page);
  await expect(page.locator('#home-criteria')).toBeVisible();
  await expect(homeStack(page)).toHaveCount(0);
  await expect(page.locator('#home-criteria')).not.toContainText('In #');
  expect(requests).toEqual([]);
});

test("changes outside the stack's tickets name their PR", async ({ page }) => {
  await openReview(page, { mutate: onHome, others: [mergedWithCriteria()] });
  const outside = homeStack(page).getByRole('listitem').filter({ hasText: 'Renames the WEATHER_* settings.' });
  await expect(outside).toContainText('#17');
  await expect(outside).toContainText('expected');
  await expect(outside.getByRole('link', { name: '#17' })).toBeVisible();
});

const coverageCell = (page, id, number) => homeStack(page).getByRole('table').getByRole('row').filter({ hasText: id }).getByRole('cell').nth([14, 15, 16, 17].indexOf(number) + 1);

test("another PR's own review that does not meet a criterion shows not met in that PR's column", async ({ page }) => {
  const other = mergedWithCriteria();
  other.context.tickets[0].acceptanceCriteria.push({ id: 'WX-42#2', text: 'Caches the forecast for one hour.', source: 'ticket', verdict: 'not-met', note: 'No cache yet.' });
  await openReview(page, { mutate: onHome, others: [other] });
  await expect(coverageCell(page, 'WX-42#2', 14)).toHaveText(/not met/);
  await expect(coverageCell(page, 'WX-42#2', 14)).not.toContainText('No cache yet.');
  await expect(coverageCell(page, 'WX-42#2', 15)).toContainText('The TTL is one minute.');
});

test('a criterion this PR places in another PR is expected there, even without stack coverage', async ({ page }) => {
  await openReview(page, { mutate: (data) => { onHome(data); data.stack.coverage = []; }, others: [mergedWithCriteria()] });
  await expect(coverageCell(page, 'WX-42#3', 16)).toHaveText(/expected/);
  await expect(homeStack(page).getByRole('table').getByRole('row').filter({ hasText: 'WX-42#3' })).not.toContainText('no PR');
});
