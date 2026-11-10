'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, eventOf } = require('./helpers.js');
const { H } = require('./fixture.js');

const ALL = Object.values(H);
const approvedAll = Object.fromEntries(ALL.map((id) => [id, 'approved']));
const noOwnReview = (data) => {
  data.reviews = data.reviews.filter((review) => review.author !== 'sample-reviewer');
  data.ownRemarks = [];
  data.ownPendingReview = null;
};


async function openSubmit(page, options) {
  const review = await openReview(page, options);
  await page.keyboard.press('s');
  await page.getByText('Nothing reaches GitHub until you press a post button.').waitFor();
  return review;
}

const verdictButton = (page, name) => page.getByRole('group', { name: 'Verdict' }).getByRole('button', { name });

test('proposes request changes when an accepted remark is minor or higher', async ({ page }) => {
  await openSubmit(page, { mutate: noOwnReview, reviewer: { seen: ALL, hunkVerdicts: approvedAll, decisions: { f1: 'accepted', f2: 'accepted' } } });
  await expect(verdictButton(page, /^Request changes/)).toContainText('proposed');
  await expect(verdictButton(page, /^Approve/)).not.toContainText('proposed');
  await expect(verdictButton(page, /^Comment/)).not.toContainText('proposed');
});

test('proposes comment when only nit remarks are accepted', async ({ page }) => {
  await openSubmit(page, { mutate: noOwnReview, reviewer: { seen: ALL, hunkVerdicts: approvedAll, decisions: { f2: 'accepted' } } });
  await expect(verdictButton(page, /^Comment/)).toContainText('proposed');
  await expect(verdictButton(page, /^Request changes/)).not.toContainText('proposed');
});

test('proposes approve when no remark is accepted', async ({ page }) => {
  await openSubmit(page, { mutate: noOwnReview, reviewer: { seen: ALL, hunkVerdicts: approvedAll } });
  await expect(verdictButton(page, /^Approve/)).toContainText('proposed');
});

// After new commits, a hunk with your "changes" verdict can be gone from the review: it no longer counts.
test('proposes approve when only a hunk that is gone has a changes verdict', async ({ page }) => {
  await openSubmit(page, { mutate: noOwnReview, reviewer: { seen: ALL, hunkVerdicts: { ...approvedAll, 'an-older-hunk': 'changes' } } });
  await expect(verdictButton(page, /^Approve/)).toContainText('proposed');
  await expect(verdictButton(page, /^Request changes/)).not.toContainText('proposed');
});

test('presses each of the three verdict buttons', async ({ page }) => {
  const review = await openSubmit(page, { mutate: noOwnReview, reviewer: { seen: ALL, hunkVerdicts: approvedAll } });
  for (const [name, verdict] of [[/^Request changes/, 'REQUEST_CHANGES'], [/^Comment/, 'COMMENT'], [/^Approve/, 'APPROVE']]) {
    await verdictButton(page, name).click();
    await expect(verdictButton(page, name)).toHaveAttribute('aria-pressed', 'true');
    await review.saved((state) => state.verdict === verdict);
  }
});

test('warns about unseen hunks on approve and request changes, not on comment', async ({ page }) => {
  await openSubmit(page, { mutate: noOwnReview, reviewer: { seen: [H.cache] } });
  const warning = page.getByRole('main').getByText('You have not seen 6 of 7 hunks.');
  await verdictButton(page, /^Approve/).click();
  await expect(warning).toBeVisible();
  await verdictButton(page, /^Comment/).click();
  await expect(warning).toBeHidden();
  await verdictButton(page, /^Request changes/).click();
  await expect(warning).toBeVisible();
});

test('does not warn when every hunk is seen', async ({ page }) => {
  await openSubmit(page, { mutate: noOwnReview, reviewer: { seen: ALL } });
  await verdictButton(page, /^Approve/).click();
  await expect(page.getByRole('main').getByText(/You have not seen/)).toBeHidden();
});

const summaryBox = (page) => page.getByRole('textbox', { name: 'Review summary' });
const noPendingBody = (data) => {
  data.ownPendingReview = null;
  data.ownRemarks = data.ownRemarks.filter((own) => own.state === 'posted');
};
const answerTo = (event, answer) => (data) => data.answers.push({ eventId: event.id, hunkId: null, question: '', answer });

test('sends a summarize event with the remarks and fills an empty summary with the answer', async ({ page }) => {
  const review = await openSubmit(page, { mutate: noPendingBody, reviewer: { decisions: { f2: 'accepted' } } });
  await expect(summaryBox(page)).toHaveValue('');
  await page.getByRole('button', { name: 'Write a summary from your remarks' }).click();
  const event = await eventOf(review, 'summarize');
  expect(event.remarks).toEqual([expect.objectContaining({ severity: 'nit', body: 'Use a named function for readability.' })]);
  review.update(answerTo(event, 'The card looks fine.'));
  await expect(summaryBox(page)).toHaveValue('The card looks fine.');
  await review.saved((state) => state.summary === 'The card looks fine.');
});

test('offers to replace a written summary with the answer', async ({ page }) => {
  const review = await openSubmit(page, { mutate: noPendingBody, reviewer: { decisions: { f2: 'accepted' }, summary: 'My own words.' } });
  await page.getByRole('button', { name: 'Write a new summary from your remarks' }).click();
  const event = await eventOf(review, 'summarize');
  review.update(answerTo(event, 'The AI words.'));
  await expect(page.getByText('The AI words.')).toBeVisible();
  await expect(summaryBox(page)).toHaveValue('My own words.');
  await page.getByRole('button', { name: 'Replace your summary with this' }).click();
  await expect(summaryBox(page)).toHaveValue('The AI words.');
  await review.saved((state) => state.summary === 'The AI words.');
});

test('keeps a written summary when you turn the answer down', async ({ page }) => {
  const review = await openSubmit(page, { mutate: noPendingBody, reviewer: { decisions: { f2: 'accepted' }, summary: 'My own words.' } });
  await page.getByRole('button', { name: 'Write a new summary from your remarks' }).click();
  const event = await eventOf(review, 'summarize');
  review.update(answerTo(event, 'The AI words.'));
  await page.getByRole('button', { name: 'Keep yours' }).click();
  await expect(page.getByText('The AI words.')).toBeHidden();
  await expect(summaryBox(page)).toHaveValue('My own words.');
});

test('does not offer to summarize without remarks', async ({ page }) => {
  await openSubmit(page, { mutate: noOwnReview });
  await expect(page.getByRole('button', { name: 'Write a summary from your remarks' })).toBeDisabled();
  await expect(page.getByText('Include a finding in your review or write a remark first.')).toBeVisible();
});

test('loads the pending review body into the summary', async ({ page }) => {
  await openSubmit(page);
  await expect(summaryBox(page)).toHaveValue('Pending summary from GitHub.');
});

test('shows the summary text in the post preview', async ({ page }) => {
  await openSubmit(page, { mutate: noPendingBody });
  await page.getByText('What will be posted').click();
  await summaryBox(page).fill('Looks good overall.');
  await expect(page.getByRole('paragraph').filter({ hasText: 'Looks good overall.' })).toBeVisible();
  await summaryBox(page).fill('Changed my mind.');
  await expect(page.getByRole('paragraph').filter({ hasText: 'Changed my mind.' })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: 'Looks good overall.' })).toBeHidden();
});

const draftOptions = {
  mutate: noOwnReview,
  reviewer: {
    decisions: { f2: 'accepted', f3: 'accepted' },
    summary: 'Nice work.',
    remarks: [{ id: 'r1', hunkId: H.cache, line: 3, side: 'RIGHT', severity: 'minor', body: 'My own remark.' }],
  },
};

test('posts a draft with the remarks, each finding headed by its severity, rule and title, and the disclosure on AI text only', async ({ page }) => {
  const review = await openSubmit(page, draftOptions);
  await page.getByRole('main').getByRole('button', { name: /^Post as draft/ }).click();
  const event = await eventOf(review, 'post');
  expect(event.kind).toBe('draft');
  expect(event.comments).toEqual([
    { path: 'src/components/ForecastCard.tsx', line: 2, side: 'RIGHT', body: '**nit(style): Name the map callback**\n\nUse a named function for readability.\n\n_Written by AI_' },
    { path: 'src/cache.ts', line: 3, side: 'RIGHT', body: '**minor:** My own remark.' },
  ]);
  expect(event.body).toBe('Nice work.\n\n- **medium(tests): No test for the card**\n\n  The new card has no test.\n\n_Contains AI findings_');
});

test('shows a draft as posted when the agent reports it', async ({ page }) => {
  const review = await openSubmit(page, draftOptions);
  await page.getByRole('main').getByRole('button', { name: /^Post as draft/ }).click();
  const event = await eventOf(review, 'post');
  review.update((data) => data.posts.push({ eventId: event.id, kind: 'draft', status: 'posted', message: 'ok', url: 'https://github.com/example-org/sample-widget/pull/17#pullrequestreview-9', reviewId: 9 }));
  await expect(page.getByText(/Draft posted/)).toBeVisible();
  await expect(page.getByText(/Draft on GitHub/)).toBeVisible();
});

test('shows the error when GitHub refuses a draft', async ({ page }) => {
  const review = await openSubmit(page, draftOptions);
  await page.getByRole('main').getByRole('button', { name: /^Post as draft/ }).click();
  const event = await eventOf(review, 'post');
  review.update((data) => data.posts.push({ eventId: event.id, kind: 'draft', status: 'error', message: 'Validation failed' }));
  await expect(page.getByText('GitHub refused the draft: Validation failed')).toBeVisible();
});

test('does not post a draft without anything in it', async ({ page }) => {
  const review = await openSubmit(page, { mutate: noOwnReview });
  await page.getByRole('main').getByRole('button', { name: /^Post as draft/ }).click();
  await expect(page.getByText('There is nothing to put in a draft yet.').last()).toBeVisible();
  expect(review.events().filter((event) => event.type === 'post')).toEqual([]);
});

test('posts the final review with the chosen verdict', async ({ page }) => {
  const review = await openSubmit(page, draftOptions);
  await verdictButton(page, /^Comment/).click();
  await page.getByRole('button', { name: 'Post review: comment' }).click();
  const event = await eventOf(review, 'post');
  expect(event).toMatchObject({ kind: 'final', verdict: 'COMMENT', body: expect.stringContaining('Nice work.') });
  expect(event.comments).toHaveLength(2);
});

test('sends the replies with the final review, and shows them in the preview', async ({ page }) => {
  const review = await openSubmit(page, { ...draftOptions, reviewer: { ...draftOptions.reviewer, threadReplies: { 'T-c1': 'Fine for now.' } } });
  await page.locator('#term-preview summary').click();
  await expect(page.getByText("Reply to @other-reviewer's comment on src/api/weatherClient.ts")).toBeVisible();
  await verdictButton(page, /^Comment/).click();
  await page.getByRole('button', { name: 'Post review: comment' }).click();
  const event = await eventOf(review, 'post');
  expect(event.replies).toEqual([{ threadId: 'T-c1', body: 'Fine for now.' }]);
});

test('offers Finish again after a review posted in a later session than an earlier finish', async ({ page }) => {
  const review = await openSubmit(page, { reviewer: { sent: [{ id: 'old-finish', type: 'finish' }] } });
  await verdictButton(page, /^Approve/).click();
  await page.getByRole('main').getByRole('button', { name: 'Post new review: approve' }).click();
  const event = await eventOf(review, 'post');
  review.update((data) => data.posts.push({ eventId: event.id, kind: 'final', status: 'posted', message: 'ok', url: 'https://github.com/example-org/sample-widget/pull/17#pullrequestreview-10', reviewId: 10 }));
  await expect(page.getByRole('heading', { name: 'Approved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish for now' })).toBeVisible();
});

test('shows the posted state after the final review is posted', async ({ page }) => {
  const review = await openSubmit(page);
  await verdictButton(page, /^Approve/).click();
  await page.getByRole('main').getByRole('button', { name: 'Post new review: approve' }).click();
  const event = await eventOf(review, 'post');
  expect(event).toMatchObject({ kind: 'final', verdict: 'APPROVE' });
  review.update((data) => data.posts.push({ eventId: event.id, kind: 'final', status: 'posted', message: 'ok', url: 'https://github.com/example-org/sample-widget/pull/17#pullrequestreview-10', reviewId: 10 }));
  await expect(page.getByRole('heading', { name: 'Approved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish for now' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View on GitHub' })).toBeVisible();
  await expect(page.getByText('Nothing reaches GitHub until you press a post button.')).toBeHidden();
});

test('the review resolves the comments you chose to resolve and posts your replies, with new comments and one verdict', async ({ page }) => {
  const review = await openSubmit(page, { reviewer: { threadCalls: { 'T-gh1': 'resolve' }, threadReplies: { 'T-gh1': 'Fixed, thanks.' }, remarks: [{ id: 'r1', hunkId: H.cache, line: 3, side: 'RIGHT', severity: 'minor', body: 'A new finding.' }] } });
  await expect(page.getByText('1 to resolve · 0 left open')).toBeVisible();
  await page.locator('#term-preview summary').click();
  await expect(page.getByText('Resolve your comment on src/cache.ts line 3')).toBeVisible();
  await verdictButton(page, /^Request changes/).click();
  await page.getByRole('main').getByRole('button', { name: 'Post new review: request changes' }).click();
  const event = await eventOf(review, 'post');
  expect(event).toMatchObject({ kind: 'final', verdict: 'REQUEST_CHANGES', resolve: ['T-gh1'], replies: [{ threadId: 'T-gh1', body: 'Fixed, thanks.' }] });
  expect(event.comments.map((comment) => comment.body)).toContain('**minor:** A new finding.');
});

test('a draft resolves nothing and posts no replies', async ({ page }) => {
  const review = await openSubmit(page, { ...draftOptions, reviewer: { ...draftOptions.reviewer, threadCalls: { 'T-gh1': 'resolve' }, threadReplies: { 'T-c1': 'Later.' } } });
  await page.getByRole('main').getByRole('button', { name: /^Post as draft/ }).click();
  const event = await eventOf(review, 'post');
  expect(event.kind).toBe('draft');
  expect(event.resolve).toBeUndefined();
  expect(event.unresolve).toBeUndefined();
  expect(event.replies).toBeUndefined();
});

test('does not post request changes or comment without a review body, which GitHub needs for them', async ({ page }) => {
  const review = await openSubmit(page, { mutate: (data) => { data.ownPendingReview = null; }, reviewer: { threadCalls: { 'T-gh1': 'resolve' } } });
  await verdictButton(page, /^Comment/).click();
  await page.getByRole('main').getByRole('button', { name: 'Post new review: comment' }).click();
  await expect(page.getByText('Write a summary first. GitHub needs a review body for request changes and comment.').last()).toBeVisible();
  expect(review.events().filter((event) => event.type === 'post')).toEqual([]);
});

test('your earlier comments include one someone else resolved that the AI doubts', async ({ page }) => {
  await openSubmit(page, { mutate: (data) => { Object.assign(data.ownRemarks[0], { resolved: true, resolvedBy: 'sample-author', fix: { verdict: 'unclear', note: 'Unclear.' } }); } });
  await expect(page.getByText('0 to resolve · 0 left open · 1 without a decision')).toBeVisible();
});

test('the list of whole-PR findings leaves out the ones an earlier review posted', async ({ page }) => {
  await openSubmit(page, {
    mutate: (data) => {
      data.findings.push({ id: 'f4', hunkId: null, severity: 'minor', title: 'No changelog entry', body: 'The PR adds no changelog entry.', rule: 'docs' });
      data.posts = [{ eventId: 'e1', kind: 'final', status: 'posted', message: 'ok', url: 'https://github.com/example-org/sample-widget/pull/17#pullrequestreview-10', reviewId: 10 }];
    },
    reviewer: { sent: [{ id: 'e1', type: 'post', kind: 'final', contents: [{ id: 'f3', body: 'The new card has no test.' }] }], reopenedAfter: 'e1' },
  });
  const list = page.locator('#term-findings');
  await expect(list.getByText('No changelog entry').first()).toBeVisible();
  await expect(list.getByText('No test for the card')).toHaveCount(0);
  await expect(list).toContainText('1 · 1 open');
  // f1, f2 and f4 are open; f3 is on GitHub already.
  await expect(page.getByText('3 AI findings are still open and not posted.')).toBeVisible();
});
