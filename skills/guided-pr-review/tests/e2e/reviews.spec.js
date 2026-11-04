'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, eventOf } = require('./helpers.js');


test('counts only your open comments with new commits or a reply from someone else', async ({ page }) => {
  await openReview(page, {
    mutate: (data) => {
      const [posted] = data.ownRemarks;
      // gh-3: nothing happened since it was posted. gh-4: no new commits, but the author replied.
      data.ownRemarks.push(
        { ...posted, id: 'gh-3', threadId: 'T-gh3', body: 'Untouched.', fix: undefined, replies: [] },
        { ...posted, id: 'gh-4', threadId: 'T-gh4', body: 'Answered.', fix: undefined, replies: [{ author: 'sample-author', body: 'Done.', at: '2026-10-22T09:00:00Z' }] },
      );
    },
  });
  await expect(page.getByRole('button', { name: /Existing reviews/ })).toContainText('2 need your decision');
});

test('shows reviews by others and your own with threaded replies', async ({ page }) => {
  await openReview(page);
  const rail = page.getByRole('button', { name: /Existing reviews/ });
  await expect(rail).toContainText('1 by others · 1 needs your decision');
  await rail.click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Other reviewers' })).toBeVisible();
  await expect(main.getByText('@other-reviewer').first()).toBeVisible();
  await expect(main.getByText('Please check the TTL.')).toBeVisible();
  await expect(main.getByText('Should days come from the settings?')).toBeVisible();
  await expect(main.getByText('@sample-author')).toBeVisible();
  await expect(main.getByText('Good idea, later.')).toBeVisible();
  await expect(main.getByText('The README does not mention the card.')).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Your reviews' })).toBeVisible();
  await expect(main.getByText('First round.')).toBeVisible();
  await expect(main.getByText('Is MAX still right?')).toBeVisible();
});

test('saves a call to resolve a thread or leave it open, shows it in place of the buttons, and takes it back', async ({ page }) => {
  const review = await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(main.getByRole('status').filter({ hasText: 'You resolve this comment.' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Resolve', exact: true })).toBeHidden();
  await review.saved((state) => state.threadCalls?.['T-gh1'] === 'resolve');
  await main.getByRole('button', { name: 'Change', exact: true }).click();
  await review.saved((state) => state.threadCalls && !('T-gh1' in state.threadCalls));
  await expect(main.locator('[data-needs-decision]')).toHaveCount(1);
  await main.getByRole('button', { name: 'Leave open', exact: true }).click();
  await expect(main.getByRole('status').filter({ hasText: 'You leave this comment open.' })).toBeVisible();
  await review.saved((state) => state.threadCalls?.['T-gh1'] === 'open');
});

test('offers a reply draft in a thread left open and saves what you write', async ({ page }) => {
  const review = await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await page.getByRole('button', { name: 'Leave open', exact: true }).click();
  const reply = page.getByRole('textbox', { name: 'Reply in this thread' });
  await expect(reply).toHaveValue('MAX is still 10.');
  await reply.fill('Still needs a look.');
  await review.saved((state) => state.threadReplies?.['T-gh1'] === 'Still needs a look.');
});

test('shows a saved call and reply when the page opens', async ({ page }) => {
  await openReview(page, { reviewer: { threadCalls: { 'T-gh1': 'open' }, threadReplies: { 'T-gh1': 'My saved reply.' } } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'You leave this comment open.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Reply in this thread' })).toHaveValue('My saved reply.');
});

test('says which comments need your decision, and why', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const main = page.getByRole('main');
  await expect(main.getByText('1 of your comments needs your decision: choose Resolve or Leave open.')).toBeVisible();
  await expect(main.getByText('1 comment · 1 needs your decision')).toBeVisible();
  const thread = main.locator('[data-needs-decision]');
  await expect(thread).toHaveCount(1);
  await expect(thread).toContainText('Needs your decision');
  await expect(thread).toContainText('New commits since your comment');
});

test('says why: a reply from someone else', async ({ page }) => {
  await openReview(page, {
    mutate: (data) => {
      data.ownRemarks[0].fix = undefined;
      data.ownRemarks[0].replies = [{ author: 'sample-author', body: 'Done.', at: '2026-10-22T09:00:00Z' }];
    },
  });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await expect(page.locator('[data-needs-decision]')).toContainText('@sample-author replied');
});

test('shows the commit each review was made on', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const main = page.getByRole('main');
  await expect(main.getByText('This page shows commit aaa111.')).toBeVisible();
  await expect(main.locator('details').filter({ hasText: 'First round.' })).toContainText('on aaa111 · the commit on this page');
  await expect(main.locator('details').filter({ hasText: 'Please check the TTL.' })).toContainText('on 9f8e7d6 · an older commit');
});

test('jumps to the next comment that needs your decision, and opens a closed review', async ({ page }) => {
  await openReview(page, {
    mutate: (data) => {
      const [posted] = data.ownRemarks;
      data.reviews.push({ id: 503, author: 'sample-reviewer', state: 'COMMENTED', commitId: 'aaa000', submittedAt: '2026-10-19T09:00:00Z', url: '', body: 'Zero round.' });
      data.ownRemarks.push({ ...posted, id: 'gh-5', threadId: 'T-gh5', reviewId: 503, body: 'Older question.', replies: [] });
    },
  });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const main = page.getByRole('main');
  const older = main.locator('details').filter({ hasText: 'Zero round.' });
  await older.locator('summary').click();
  await expect(main.getByText('Older question.')).toBeHidden();
  const next = main.getByRole('button', { name: /Next comment to decide/ });
  await expect(next).toContainText('2');
  await next.click();
  await expect(main.locator('[data-needs-decision]').filter({ hasText: 'Is MAX still right?' })).toBeFocused();
  await next.click();
  await expect(main.getByText('Older question.')).toBeVisible();
  await expect(main.locator('[data-needs-decision]').filter({ hasText: 'Older question.' })).toBeFocused();
  await next.click();
  await expect(main.locator('[data-needs-decision]').filter({ hasText: 'Is MAX still right?' })).toBeFocused();
});

test('hides the jump button when no comment needs your decision', async ({ page }) => {
  await openReview(page, { reviewer: { threadCalls: { 'T-gh1': 'open' } } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await expect(page.getByRole('button', { name: /Next comment to decide/ })).toBeHidden();
});

const threadOf = (page, text) => page.getByRole('main').locator('.thread').filter({ hasText: text });

test('shows the AI on a comment under that comment, before its replies', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const entries = threadOf(page, 'Should days come from the settings?').locator('li');
  await expect(entries.first()).toContainText('AI on this comment: agrees.');
  await expect(entries.nth(1)).toContainText('Good idea, later.');
  await expect(entries.nth(1)).not.toContainText('AI on this comment');
});

test('shows the AI on the code under "Needs your decision", above the comment', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = page.locator('[data-needs-decision]');
  const fix = await thread.getByText('AI on the code').boundingBox();
  const decision = await thread.getByText('Needs your decision').boundingBox();
  const comment = await thread.getByText('Is MAX still right?').boundingBox();
  expect(fix.y).toBeGreaterThan(decision.y);
  expect(fix.y).toBeLessThan(comment.y);
});

test('replies in a thread of someone else, and sends the reply with the next review', async ({ page }) => {
  const review = await openReview(page, { reviewer: { threadCalls: { 'T-gh1': 'resolve' } } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = threadOf(page, 'Should days come from the settings?');
  await thread.getByRole('button', { name: 'Reply', exact: true }).click();
  await thread.getByRole('textbox', { name: 'Reply in this thread' }).fill('Agreed, a follow-up then.');
  await review.saved((state) => state.threadReplies?.['T-c1'] === 'Agreed, a follow-up then.');
  await page.getByRole('main').getByRole('button', { name: 'Submit review' }).click();
  await page.getByRole('group', { name: 'Verdict' }).getByRole('button', { name: /^Approve/ }).click();
  await page.getByRole('main').getByRole('button', { name: 'Post new review: approve' }).click();
  const event = await eventOf(review, 'post');
  expect(event).toMatchObject({ kind: 'final', resolve: ['T-gh1'], replies: [{ threadId: 'T-c1', body: 'Agreed, a follow-up then.' }] });
});

test('the existing reviews only record your decisions; they have no post form of their own', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const main = page.getByRole('main');
  await expect(main.getByText('Your decisions and replies go to GitHub with your next review.')).toBeVisible();
  await expect(main.getByRole('button', { name: /^Update review/ })).toHaveCount(0);
  await expect(main.getByRole('textbox', { name: 'Note to the author' })).toHaveCount(0);
});

test('offers a reply in your own thread next to Resolve and Leave open', async ({ page }) => {
  const review = await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = page.locator('[data-needs-decision]');
  await thread.getByRole('button', { name: 'Reply', exact: true }).click();
  await thread.getByRole('textbox', { name: 'Reply in this thread' }).fill('Thanks!');
  await review.saved((state) => state.threadReplies?.['T-gh1'] === 'Thanks!');
  await expect(thread.getByRole('button', { name: 'Resolve', exact: true })).toBeVisible();
});

test('shows a comment in each flow its hunk is in, with the comment in focus', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = page.locator('[data-needs-decision]');
  await expect(thread.getByRole('button', { name: /^Show this comment in the flow/ })).toHaveCount(2);
  await thread.getByRole('button', { name: 'Show this comment in the flow Store the forecast' }).click();
  await expect(page.getByRole('button', { name: /^B1 / })).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#note-gh-1')).toBeFocused();
});

// GitHub's allowlist: html-pipeline's SanitizationFilter, with Selma's default protocols and removed contents.
test('shows HTML in comments the way GitHub does: allowed tags render, the rest is removed', async ({ page }) => {
  await openReview(page, {
    mutate: (data) => {
      data.reviewComments[0].body = [
        'Small print: <sub>AI wrote this</sub>, press <kbd>Ctrl</kbd>.',
        '<script>window.hacked = true</script>',
        '<a href="javascript:alert(1)">bad link</a> <a href="https://example.test/ok" onclick="window.hacked = true" class="x">good link</a>',
        '<img src="https://example.test/a.png" alt="a picture" onerror="window.hacked = true">',
        '<details><summary>More</summary>Hidden text</details>',
        '<custom-element>kept text</custom-element> <span style="color: red" id="anchor">styled</span>',
      ].join('\n\n');
    },
  });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = page.getByRole('main').locator('.thread').filter({ hasText: 'Small print' });
  await expect(thread.locator('sub')).toHaveText('AI wrote this');
  await expect(thread.locator('kbd')).toHaveText('Ctrl');
  await expect(thread.locator('script')).toHaveCount(0);
  await expect(thread).not.toContainText('window.hacked');
  await expect(thread.getByText('bad link')).not.toHaveAttribute('href');
  const good = thread.getByRole('link', { name: 'good link' });
  await expect(good).toHaveAttribute('href', 'https://example.test/ok');
  await expect(good).not.toHaveAttribute('onclick');
  await expect(good).not.toHaveClass(/(^|\s)x(\s|$)/);
  await expect(thread.getByRole('img', { name: 'a picture' })).not.toHaveAttribute('onerror');
  await expect(thread.locator('details summary')).toHaveText('More');
  await expect(thread.locator('custom-element')).toHaveCount(0);
  await expect(thread).toContainText('kept text');
  await expect(thread.getByText('styled')).not.toHaveAttribute('style');
  await expect(thread.getByText('styled')).toHaveAttribute('id', 'user-content-anchor');
  expect(await page.evaluate(() => window.hacked)).toBeUndefined();
});

test('shows your posted comment in the hunk view with the same HTML rules', async ({ page }) => {
  await openReview(page, { mutate: (data) => { data.ownRemarks[0].body = 'Is MAX still right?\n\n<sub>AI Disclaimer: written by AI</sub>'; } });
  await page.getByRole('main').getByRole('button', { name: /^Store the forecast/ }).first().click();
  const note = page.locator('#note-gh-1');
  await expect(note.locator('sub')).toHaveText('AI Disclaimer: written by AI');
  await expect(note).not.toContainText('<sub>');
});

test('shows your remarks in the hunk view as markdown, as GitHub will show them', async ({ page }) => {
  const { H } = require('./fixture.js');
  await openReview(page, { reviewer: { remarks: [{ id: 'r1', hunkId: H.cache, line: 3, side: 'RIGHT', severity: 'minor', body: 'Press <kbd>Ctrl</kbd> and use `MAX`.' }] } });
  await page.getByRole('main').getByRole('button', { name: /^Store the forecast/ }).first().click();
  const remark = page.locator('main').getByText('and use');
  await expect(remark.locator('kbd')).toHaveText('Ctrl');
  await expect(remark.locator('code')).toHaveText('MAX');
});

test('shows a single line break in a comment as a new line, as GitHub does', async ({ page }) => {
  await openReview(page, { mutate: (data) => { data.reviewComments[0].body = 'First line\nSecond line'; } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = page.getByRole('main').locator('.thread').filter({ hasText: 'First line' });
  await expect(thread.locator('p').filter({ hasText: 'First line' }).locator('br')).toHaveCount(1);
});

test('marks the lines of a comment in the diff only while you point at the comment, as GitHub does', async ({ page }) => {
  await openReview(page, { mutate: (data) => { Object.assign(data.ownRemarks[0], { startLine: 1, startSide: 'RIGHT' }); } });
  await page.getByRole('main').getByRole('button', { name: /^Store the forecast/ }).first().click();
  const marked = page.locator('tr.noted');
  await expect(page.locator('#note-gh-1')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(marked).toHaveCount(0);
  await page.locator('#note-gh-1').hover();
  await expect(marked).toHaveCount(4);
});

const resolvedReadme = (data) => { data.reviewComments[1].resolved = true; };

test('unresolves a resolved thread, shows the choice in place of the button, and takes it back', async ({ page }) => {
  const review = await openReview(page, { mutate: resolvedReadme });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = threadOf(page, 'The README does not mention the card.');
  await thread.locator('summary').click();
  await thread.getByRole('button', { name: 'Unresolve', exact: true }).click();
  await expect(thread.getByRole('status').filter({ hasText: 'You unresolve this comment.' })).toBeVisible();
  await expect(thread.getByText('Resolved · you unresolve it')).toBeVisible();
  await review.saved((state) => state.threadCalls?.['T-c2'] === 'unresolve');
  await thread.getByRole('button', { name: 'Change', exact: true }).click();
  await review.saved((state) => state.threadCalls && !('T-c2' in state.threadCalls));
  await expect(thread.getByRole('button', { name: 'Unresolve', exact: true })).toBeVisible();
});

test('offers no Unresolve when GitHub does not allow it', async ({ page }) => {
  await openReview(page, { mutate: (data) => { resolvedReadme(data); data.reviewComments[1].canUnresolve = false; } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = threadOf(page, 'The README does not mention the card.');
  await thread.locator('summary').click();
  await expect(thread.getByRole('button', { name: 'Unresolve', exact: true })).toBeHidden();
});

test('sends the threads to unresolve and their replies with the next review', async ({ page }) => {
  const review = await openReview(page, { mutate: resolvedReadme, reviewer: { threadCalls: { 'T-gh1': 'resolve', 'T-c2': 'unresolve' } } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = threadOf(page, 'The README does not mention the card.');
  await thread.locator('summary').click();
  await thread.getByRole('button', { name: 'Reply', exact: true }).click();
  await thread.getByRole('textbox', { name: 'Reply in this thread' }).fill('The card needs a line after all.');
  await review.saved((state) => state.threadReplies?.['T-c2'] === 'The card needs a line after all.');
  await page.getByRole('main').getByRole('button', { name: 'Submit review' }).click();
  await page.locator('#term-preview summary').click();
  await expect(page.getByText("Unresolve @other-reviewer's comment on README.md")).toBeVisible();
  await page.getByRole('group', { name: 'Verdict' }).getByRole('button', { name: /^Comment/ }).click();
  await page.getByRole('main').getByRole('button', { name: 'Post new review: comment' }).click();
  const event = await eventOf(review, 'post');
  expect(event).toMatchObject({ kind: 'final', unresolve: ['T-c2'], resolve: ['T-gh1'], replies: [{ threadId: 'T-c2', body: 'The card needs a line after all.' }] });
});

test('ignores a choice to resolve once GitHub shows the thread resolved, and offers Unresolve', async ({ page }) => {
  await openReview(page, { mutate: (data) => { data.ownRemarks[0].resolved = true; }, reviewer: { threadCalls: { 'T-gh1': 'resolve' } } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = threadOf(page, 'Is MAX still right?');
  await thread.locator('summary').click();
  await expect(thread.getByText('You resolve this comment.')).toBeHidden();
  await expect(thread.getByRole('button', { name: 'Unresolve', exact: true })).toBeVisible();
});

test('ignores a choice to unresolve once GitHub shows the thread open, and asks for a decision', async ({ page }) => {
  await openReview(page, { reviewer: { threadCalls: { 'T-gh1': 'unresolve' } } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = threadOf(page, 'Is MAX still right?');
  await expect(thread.getByText('You unresolve this comment.')).toBeHidden();
  await expect(thread.getByRole('button', { name: 'Resolve', exact: true })).toBeVisible();
});

const resolvedByAuthor = (verdict) => (data) => {
  Object.assign(data.ownRemarks[0], { resolved: true, resolvedBy: 'sample-author', fix: { verdict, note: 'Line 3 still has MAX 10.' } });
};

test('highlights your comment that someone else resolved when the AI is not sure it is fixed', async ({ page }) => {
  const review = await openReview(page, { mutate: resolvedByAuthor('unclear') });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = threadOf(page, 'Is MAX still right?');
  await expect(thread).toHaveAttribute('data-needs-decision', '');
  await expect(thread.getByText('@sample-author resolved it; the AI is not sure it is fixed')).toBeVisible();
  await expect(thread.getByText('Line 3 still has MAX 10.')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Review navigation' }).getByText('1 needs your decision')).toBeVisible();
  await thread.getByRole('button', { name: 'Keep resolved', exact: true }).click();
  await expect(thread.getByRole('status').filter({ hasText: 'You keep this comment resolved.' })).toBeVisible();
  await expect(thread).not.toHaveAttribute('data-needs-decision', '');
  await review.saved((state) => state.threadCalls?.['T-gh1'] === 'keep');
});

test('suggests Unresolve when the AI thinks a comment someone else resolved is not fixed', async ({ page }) => {
  const review = await openReview(page, { mutate: resolvedByAuthor('not-fixed') });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = threadOf(page, 'Is MAX still right?');
  await expect(thread.getByText('@sample-author resolved it; the AI thinks it is not fixed')).toBeVisible();
  await expect(thread.getByRole('button', { name: 'Keep resolved', exact: true })).toHaveClass(/not-hover:not-focus-visible:text-muted/);
  await thread.getByRole('button', { name: 'Unresolve', exact: true }).click();
  await review.saved((state) => state.threadCalls?.['T-gh1'] === 'unresolve');
});

test('leaves a comment folded when someone else resolved it and the AI says it is fixed', async ({ page }) => {
  await openReview(page, { mutate: resolvedByAuthor('fixed') });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  const thread = threadOf(page, 'Is MAX still right?');
  await expect(thread).not.toHaveAttribute('data-needs-decision', '');
  await expect(thread.getByText('Resolved by @sample-author')).toBeVisible();
  await thread.locator('summary').click();
  await expect(thread.getByText('Line 3 still has MAX 10.')).toBeVisible();
});
