'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview, eventOf } = require('./helpers.js');
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
// The test runner stands in for the watch process of the agent that runs this page's review.
const liveAgent = (review) => fs.writeFileSync(path.join(review.dir, 'session.json'), JSON.stringify({ sessionId: 'abc-123', cwd: '/work', worktree: null, watcherPid: process.pid }));

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
  liveAgent(review);
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
  const table = page.getByRole('main').getByRole('list', { name: 'Does the stack cover WX-42?' });
  await expect(homeStack(page).getByRole('list', { name: /Does the stack cover/ })).toHaveCount(0);
  const cell = (id, number) => coverageCell(page, id, number);
  await expect(cell('WX-42#1', 14)).toHaveText(/confirmed/);
  await expect(cell('WX-42#2', 15)).toHaveText(/not met/);
  await expect(cell('WX-42#3', 16)).toHaveText(/expected/);
  await expect(criterionRow(page, 'WX-42#4')).toContainText('Not found in the stack');
  await expect(page.getByRole('main').getByRole('list', { name: 'What the marks mean' }).getByRole('listitem')).toHaveText([/^Confirmed:/, /^Not met:/, /^Expected:/, /^Not found:/]);
  await expect(criterionRow(page, 'WX-42#2')).not.toContainText('Not found');
  await expect(table.getByRole('listitem').filter({ hasText: 'WX-42#1' }).getByRole('listitem')).toHaveCount(1);
  await expect(cell('WX-42#1', 16)).toHaveCount(0);
});

test('in a stack, a criterion another PR meets shows that PR as expected in the criteria', async ({ page }) => {
  await openReview(page, { mutate: (data) => {
    onPage(data);
    data.context.tickets[0].acceptanceCriteria[0] = { ...data.context.tickets[0].acceptanceCriteria[0], verdict: 'elsewhere', pr: 16 };
  } });
  const panel = page.locator('#home-criteria');
  await expect(panel).toContainText('1 of 2 criteria not met');
  await expect(page.getByRole('main').getByRole('list', { name: 'Where WX-42#1 is met' })).toContainText('#16 · expected');
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

const criterionRow = (page, id) => page.getByRole('main').getByRole('list', { name: /^Does the stack cover/ }).getByRole('listitem').filter({ has: page.getByText(id, { exact: true }) }).first();
const coverageCell = (page, id, number) => page.getByRole('main').getByRole('list', { name: `Where ${id} is met` }).getByRole('listitem').filter({ hasText: `#${number}` });

test('the legend explains only the marks the list shows', async ({ page }) => {
  await openReview(page, { mutate: (data) => { onHome(data); data.context.tickets[0].acceptanceCriteria = [{ id: 'WX-42#1', text: 'Fetches a three-day forecast.', source: 'ticket', verdict: 'met' }]; data.stack.coverage = []; } });
  await expect(page.getByRole('main').getByRole('list', { name: 'What the marks mean' }).getByRole('listitem')).toHaveText([/^Confirmed:/]);
});

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
  await expect(criterionRow(page, 'WX-42#3')).not.toContainText('Not found');
});

test('Start a review sends a start-review event and shows that the agent prepares it', async ({ page }) => {
  const review = await openReview(page, { mutate: onPage, others: [merged()] });
  liveAgent(review);
  await button(page).click();
  await row(page, 16).getByRole('button', { name: 'Start a review' }).click();
  expect(await eventOf(review, 'start-review')).toMatchObject({ type: 'start-review', number: 16 });
  await reviewDirOf(page, review, 16, 'preparing', '');
  await expect(row(page, 16)).toContainText('Preparing the review…');
  await expect(row(page, 16).getByRole('button', { name: 'Start a review' })).toHaveCount(0);
});

// Posts the final review of the page's PR and plays the agent that answers with the post result.
const postFinal = async (page, review) => {
  await page.keyboard.press('s');
  await page.getByText('Nothing reaches GitHub until you press a post button.').waitFor();
  await page.getByRole('group', { name: 'Verdict' }).getByRole('button', { name: /^Approve/ }).click();
  await page.getByRole('main').getByRole('button', { name: 'Post new review: approve' }).click();
  const event = await eventOf(review, 'post');
  review.update((data) => data.posts.push({ eventId: event.id, kind: 'final', status: 'posted', message: 'ok', url: 'https://github.com/example-org/sample-widget/pull/1#pullrequestreview-10', reviewId: 10 }));
  await expect(page.getByRole('button', { name: 'Finish for now' })).toBeVisible();
};

const reviewOf16 = () => {
  const data = merged();
  data.pr.number = 16;
  data.pr.title = TITLES[16];
  data.stack = stackFixture([14, 15, 16, 17], 16);
  return data;
};

test('after the final post the page offers the next PR in the stack, linking to its review when it has one', async ({ page }) => {
  const review = await openReview(page, { mutate: onPage, others: [merged()] });
  review.write(reviewOf16());
  await postFinal(page, review);
  const next = page.getByRole('link', { name: 'Next in the stack: #16' });
  await expect(next).toHaveAttribute('href', /\/example-org\/sample-widget\/16$/);
});

test('after the final post the Next button starts the review of a PR without one', async ({ page }) => {
  const review = await openReview(page, { mutate: onPage, others: [merged()] });
  await postFinal(page, review);
  await page.getByRole('button', { name: 'Next in the stack: #16' }).click();
  expect(await eventOf(review, 'start-review')).toMatchObject({ number: 16 });
});

const sessionOf = (review, number) => {
  const dir = path.join(path.dirname(review.dir), String(number));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify({ sessionId: 'def-456', cwd: '/work', worktree: null, watcherPid: process.pid }));
};

test('the Next button skips a PR that another session runs', async ({ page }) => {
  const review = await openReview(page, { mutate: onPage, others: [merged()] });
  sessionOf(review, 16);
  await postFinal(page, review);
  await expect(page.getByRole('button', { name: 'Next in the stack: #17' })).toBeVisible();
});

test('the Next button is absent when the agent prepares the only PR left', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { onPage(data); data.stack = stackFixture([14, 15, 16], 15); }, others: [merged()] });
  const dir = path.join(path.dirname(review.dir), '16');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'preparing'), '');
  await postFinal(page, review);
  await expect(page.getByText(/Next in the stack/)).toHaveCount(0);
});

// #15 has a posted final review, as the server reads it: a post result and the sent event with this head.
const postedReviewOf = (review, number) => {
  const data = merged();
  data.pr.number = number;
  data.pr.title = TITLES[number];
  data.stack = stackFixture([14, 15, 16, 17], 16);
  data.posts = [{ eventId: 'e1', kind: 'final', status: 'posted', message: 'ok', url: 'https://github.com/example-org/sample-widget/pull/1#r', reviewId: 1 }];
  const dir = review.write(data);
  fs.writeFileSync(path.join(dir, 'reviewer.json'), JSON.stringify({ sent: [{ id: 'e1', type: 'post', kind: 'final', headSha: data.pr.headSha }] }));
};

test('the Next button skips a PR whose final review is posted, and is absent when none is left', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { onPage(data); data.pr.number = 16; data.pr.title = TITLES[16]; data.stack = stackFixture([14, 15, 16], 16); }, others: [merged()] });
  postedReviewOf(review, 15);
  await postFinal(page, review);
  await expect(page.getByText(/Next in the stack/)).toHaveCount(0);
});

test('with #17 posted the Next button targets the PR below', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { onPage(data); data.pr.number = 16; data.pr.title = TITLES[16]; data.stack = stackFixture([14, 15, 16, 17], 16); }, others: [merged()] });
  postedReviewOf(review, 17);
  const other = merged();
  other.pr.number = 15;
  other.pr.title = TITLES[15];
  other.stack = stackFixture([14, 15, 16, 17], 16);
  review.write(other);
  await postFinal(page, review);
  await expect(page.getByRole('link', { name: 'Next in the stack: #15' })).toBeVisible();
});

test('after Start a review, the row shows Preparing and offers no second start, also after a reload', async ({ page }) => {
  const review = await openReview(page, { mutate: onPage, others: [merged()] });
  liveAgent(review);
  await button(page).click();
  await row(page, 16).getByRole('button', { name: 'Start a review' }).click();
  await eventOf(review, 'start-review');
  await expect(row(page, 16)).toContainText('Preparing the review…');
  await expect(row(page, 16).getByRole('button', { name: 'Start a review' })).toHaveCount(0);
  await review.saved((state) => (state.sent || []).some((sent) => sent.type === 'start-review'));
  await page.reload();
  await button(page).click();
  await expect(row(page, 16)).toContainText('Preparing the review…');
  await expect(row(page, 16).getByRole('button', { name: 'Start a review' })).toHaveCount(0);
});

test('Start a review on another PR does not turn Finish for now into the finishing text', async ({ page }) => {
  const review = await openReview(page, { mutate: onPage, others: [merged()] });
  await postFinal(page, review);
  await page.getByRole('button', { name: 'Finish for now' }).click();
  await eventOf(review, 'finish');
  await expect(page.getByText('The agent keeps this review.')).toBeVisible();
  await page.getByRole('button', { name: 'Next in the stack: #16' }).click();
  await eventOf(review, 'start-review');
  await expect(page.getByText('The agent keeps this review.')).toBeVisible();
});

test('a PR in no stack shows no Next button after the final post', async ({ page }) => {
  const review = await openReview(page);
  await postFinal(page, review);
  await expect(page.getByText(/Next in the stack/)).toHaveCount(0);
});

test('a stack read from the branches has no number, so the page shows no "#" for it', async ({ page }) => {
  const fromBranches = (data) => {
    onHome(data);
    data.stack.source = 'branches';
    data.stack.number = null;
  };
  await openReview(page, { mutate: fromBranches, others: [mergedWithCriteria()] });
  await expect(homeStack(page)).toContainText('stack, 4 PRs, base main');
  await expect(homeStack(page)).not.toContainText('stack #');
  await button(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Stack · bottom to top');
  await expect(dialog).not.toContainText('Stack #');
});

test('a PR with remarks shows them next to the hunks seen in the stack switch', async ({ page }) => {
  const above = fixture();
  above.pr.number = 16;
  above.pr.title = TITLES[16];
  above.stack = stackFixture([14, 15, 16, 17], 16);
  const review = await openReview(page, { mutate: onPage, others: [merged(), above] });
  const dir = path.join(path.dirname(review.dir), '16');
  fs.writeFileSync(path.join(dir, 'reviewer.json'), JSON.stringify({ seen: [], remarks: [{ id: 'r1' }, { id: 'r2' }] }));
  await page.reload();
  await button(page).click();
  await expect(row(page, 16)).toContainText(/\d+ of \d+ hunks seen · 2 remarks/);
});
