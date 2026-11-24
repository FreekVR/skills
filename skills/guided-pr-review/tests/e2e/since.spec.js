'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, expectPoll, expectAligned } = require('./helpers.js');

const stop = (page, code) => page.getByRole('button', { name: new RegExp(`^${code} `) });
const rail = (page) => page.getByRole('complementary', { name: 'Review navigation' });
const railFlow = (page, name) => rail(page).getByRole('button', { name: new RegExp(name) });
const scopeSelect = (page) => page.getByRole('combobox', { name: 'Which changes to show' });

// A re-review: the user reviewed aaa111, and since then src/cache.ts changed and src/new/legacy.ts moved.
// The cache hunk is A2 and B1, the move is C1; A1, A3, B2, C2 and the hunk in "Not in a flow" are the same.
function reReview(data) {
  data.pr.headSha = 'bbb222';
  data.pr.baseRef = 'main';
  data.changesSince = {
    from: 'aaa111',
    to: 'bbb222',
    summary: '- The TTL is one hour.\n- The legacy file moved.',
    files: [
      { path: 'src/cache.ts', summary: 'The TTL is one hour now.' },
      { path: 'src/new/legacy.ts', previousPath: 'src/old/legacy.ts', summary: 'The file moved to the new folder.' },
    ],
  };
}

test('a re-review opens with only the hunks in files changed since your last review', async ({ page }) => {
  await openReview(page, { mutate: reReview });
  await expect(scopeSelect(page)).toHaveText(/Changed since last review/);
  await expect(railFlow(page, 'Show the forecast')).toBeVisible();
  await expect(railFlow(page, 'Moved and added files')).toBeVisible();
  await expect(railFlow(page, 'Not in a flow')).toHaveCount(0);
  await railFlow(page, 'Show the forecast').click();
  await expect(stop(page, 'A2')).toHaveAttribute('aria-current', 'step');
  // The flow opens at its first changed hunk, so that hunk carries the flow's intro and its open criteria.
  await expect(page.getByText('From the request to the card.')).toBeVisible();
  await expect(page.getByText('Shows three days with min and max temperature.')).toBeVisible();
  await expect(stop(page, 'A1')).toHaveCount(0);
  await expect(stop(page, 'A3')).toHaveCount(0);
});

test('j and n step only between the changed hunks, which keep their station codes', async ({ page }) => {
  await openReview(page, { mutate: reReview });
  await page.keyboard.press('j');
  await expect(stop(page, 'A2')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('j');
  await expect(stop(page, 'B1')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('k');
  await expect(stop(page, 'A2')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('n');
  await expect(stop(page, 'C1')).toHaveAttribute('aria-current', 'step');
});

test('Changes vs main shows every hunk again, and the choice is kept on reload', async ({ page }) => {
  const review = await openReview(page, { mutate: reReview });
  await scopeSelect(page).click();
  await page.getByRole('option', { name: 'Changes vs main' }).click();
  await expect(railFlow(page, 'Not in a flow')).toBeVisible();
  await expectPoll(() => review.reviewer().scope === 'all');
  await page.reload();
  await expect(scopeSelect(page)).toHaveText(/Changes vs main/);
  await expect(railFlow(page, 'Not in a flow')).toBeVisible();
  await railFlow(page, 'Show the forecast').click();
  await expect(stop(page, 'A1')).toBeVisible();
});

test('a changed hunk says what changed in its file, also with Changes vs main, and a moved file says where from', async ({ page }) => {
  await openReview(page, { mutate: reReview, reviewer: { scope: 'all' } });
  await page.goto(page.url().replace(/\/?$/, '/A2'));
  const note = page.locator('[data-since-note]');
  await expect(note).toHaveText(/Since your last review: The TTL is one hour now\./);
  await expectAligned(page, note.locator('.iconify'), note.locator('b'));
  await page.goto(page.url().replace(/\/A2$/, '/A1'));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(note).toHaveCount(0);
  await page.goto(page.url().replace(/\/A1$/, '/C1'));
  await expect(note).toHaveText(/The file moved to the new folder\. \(moved from src\/old\/legacy\.ts\)/);
});

test('a link to a hunk outside the filter still opens it, on the map too', async ({ page }) => {
  await openReview(page, { mutate: reReview });
  await page.goto(page.url().replace(/\/?$/, '/A1'));
  await expect(stop(page, 'A1')).toHaveAttribute('aria-current', 'step');
  await expect(stop(page, 'A3')).toHaveCount(0);
  await page.keyboard.press('j');
  await expect(stop(page, 'A2')).toHaveAttribute('aria-current', 'step');
});

test('there is no filter without a file list, on a first review, or after a newer review of yours', async ({ page }) => {
  const cases = [
    (data) => { reReview(data); delete data.changesSince.files; },
    (data) => { reReview(data); data.reviews = data.reviews.filter((entry) => entry.author !== data.viewer.login); },
    (data) => { reReview(data); data.reviews.push({ id: 504, author: data.viewer.login, state: 'COMMENTED', commitId: 'bbb222', submittedAt: '2026-10-22T09:00:00Z', url: '', body: 'Again.' }); },
  ];
  for (const mutate of cases) {
    await openReview(page, { mutate });
    await expect(railFlow(page, 'Not in a flow')).toBeVisible();
    await expect(scopeSelect(page)).toHaveCount(0);
  }
});
