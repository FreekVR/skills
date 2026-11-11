'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, eventOf, expectPoll } = require('./helpers.js');
const { H } = require('./fixture.js');

let review;

test('shows the file path, the status and the function of the hunk', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  const main = page.getByRole('main');
  await expect(main.getByText('src/cache.ts').first()).toBeVisible();
  await expect(page.getByRole('banner').getByText('modified')).toBeVisible();
  await expect(page.getByRole('banner').getByText('export class Cache {').first()).toBeVisible();
});

// The map scrolls sideways; the legend sits above it, so the scroll bar is the bottom edge of the header.
test('shows the legend above the flow map', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  const legend = await page.getByRole('banner').getByText('Legend').boundingBox();
  const map = await page.getByRole('navigation', { name: /^Hunks in/ }).boundingBox();
  expect(legend.y).toBeLessThan(map.y);
});

test('shows where a renamed file came from', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Moved and added files', /^C1 /);
  await expect(page.getByRole('banner').getByText('renamed from src/old/legacy.ts')).toBeVisible();
});

test('shows old and new line numbers in the diff', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  const removed = page.getByRole('row').filter({ hasText: 'const TTL = 60;' });
  await expect(removed.getByRole('cell').nth(0)).toHaveText('2');
  const added = page.getByRole('row').filter({ hasText: 'const TTL = 60 * 1000;' });
  await expect(added.getByRole('cell').nth(1)).toHaveText('2');
  const context = page.getByRole('row').filter({ hasText: 'const MAX = 10;' });
  await expect(context.getByRole('cell').nth(0)).toHaveText('3');
  await expect(context.getByRole('cell').nth(1)).toHaveText('3');
});

test('shows the gap in a whole-file hunk', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Store the forecast', /^B2 package-lock\.json/);
  await expect(page.getByText('unchanged lines skipped, continues at line 40')).toBeVisible();
});

test('shows the text for a binary file', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Moved and added files', /^C2 docs\/logo\.png/);
  await expect(page.getByText('This is a binary file. Open it on GitHub to compare.')).toBeVisible();
});

test('shows the explanation, and asks for a longer one', async ({ page }) => {
  const review = await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await expect(page.getByText('The cache keeps forecasts longer.')).toBeVisible();
  await page.getByRole('button', { name: 'Explain more' }).click();
  expect((await eventOf(review, 'explain')).hunkId).toBe(H.cache);
  review.update((data) => { data.hunks.find((hunk) => hunk.id === H.cache).explanationMore = 'The longer story about the TTL.'; });
  // The longer explanation opens by itself when it arrives.
  await expect(page.getByText('The longer story about the TTL.')).toBeVisible();
});

test.describe('a finding', () => {
  test.beforeEach(async ({ page }) => {
    review = await openReview(page);
    await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
    await expect(page.getByText('TTL is in milliseconds')).toBeVisible();
    await expect(page.getByText('The TTL is 60 seconds, not one hour.')).toBeVisible();
  });

  test('can be accepted', async ({ page }) => {
    await page.getByRole('button', { name: 'Include in my review' }).click();
    await expectPoll(() => review.reviewer().decisions?.f1 === 'accepted');
  });

  test('can get another severity', async ({ page }) => {
    await page.getByRole('combobox', { name: /^Severity/ }).selectOption('nit');
    await expectPoll(() => review.reviewer().severities?.f1 === 'nit');
  });

  test('stays readable at every severity', async ({ page }) => {
    const select = page.getByRole('combobox', { name: /^Severity/ });
    for (const severity of ['medium', 'major']) {
      await select.selectOption(severity);
      // These levels draw light text on a dark fill; without the fill the text has the page colour.
      await expect(select).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
  });

  test('takes the colour of the chosen severity on its edge', async ({ page }) => {
    const select = page.getByRole('combobox', { name: /^Severity/ });
    const note = select.locator('xpath=ancestor::div[contains(@class, "border-r-8")][1]');
    await select.selectOption('medium');
    const fill = await select.evaluate((element) => getComputedStyle(element).backgroundColor);
    await expect(note).toHaveCSS('border-right-color', fill);
  });

  test('starts with the AI finding tag and shows no state icon while it is open', async ({ page }) => {
    const note = page.getByRole('combobox', { name: /^Severity/ }).locator('xpath=ancestor::div[contains(@class, "border-r-8")][1]');
    await expect(note.locator('div').first()).toHaveText(/^AI finding\s*TTL is in milliseconds/);
    await expect(note.locator('[data-note-state]')).toHaveCount(0);
  });

  test('shows its state as an icon whose label slides out on hover', async ({ page }) => {
    await page.getByRole('button', { name: 'Include in my review' }).click();
    const icon = page.getByRole('img', { name: /^In your review, not posted/ });
    await expect(icon).toBeVisible();
    await icon.hover();
    await expect(icon.getByText('In your review, not posted')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText('Dismissed · not in your review')).toBeVisible();
  });

  test('can be dismissed', async ({ page }) => {
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expectPoll(() => review.reviewer().decisions?.f1 === 'dismissed');
  });
});

const postedF1 = {
  mutate: (data) => { data.posts = [{ eventId: 'e1', status: 'posted' }]; },
  reviewer: { sent: [{ id: 'e1', type: 'post', kind: 'final', contents: [{ id: 'f1', body: 'The TTL is 60 seconds, not one hour.' }] }] },
};

test('a posted finding shows that it is on GitHub, also after you dismiss it', async ({ page }) => {
  await openReview(page, { ...postedF1, reviewer: { ...postedF1.reviewer, decisions: { f1: 'accepted' } } });
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await expect(page.getByRole('img', { name: 'On GitHub' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  // The finding folds away, and the folded note keeps the GitHub state in view.
  await expect(page.getByRole('img', { name: 'On GitHub' })).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'On GitHub' })).toBeVisible();
});

test('a remark shows its GitHub state as an icon', async ({ page }) => {
  await openReview(page, { reviewer: { remarks: [{ id: 'r1', hunkId: H.cache, line: 3, side: 'RIGHT', severity: 'minor', body: 'My own remark.' }] } });
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await expect(page.getByRole('img', { name: /^In your review, not posted/ })).toBeVisible();
});

test('shows the comment of someone else with reply, fix line and opinion', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Show the forecast', /^A1 src\/api\/weatherClient\.ts/);
  const main = page.getByRole('main');
  await expect(main.getByText('Should days come from the settings?')).toBeVisible();
  await expect(main.getByText('Good idea, later.')).toBeVisible();
  await expect(main.getByText('AI on the code: not fixed yet.')).toBeVisible();
  await expect(main.getByText('Line 11 still has the constant.')).toBeVisible();
  await expect(main.getByText('AI on this comment: agrees.')).toBeVisible();
  await expect(main.getByText('A setting avoids a deploy for a change.')).toBeVisible();
});

test('copies a comment of someone else as a remark at the lowest severity', async ({ page }) => {
  const review = await openReview(page);
  await openHunk(page, 'Show the forecast', /^A1 src\/api\/weatherClient\.ts/);
  await page.getByRole('button', { name: 'Copy to my review' }).click();
  await expect(page.getByLabel('Severity')).toHaveValue('nit');
  await expect(page.getByLabel('Remark text')).toHaveValue(/Should days come from the settings\?/);
  await page.getByRole('button', { name: 'Add remark' }).click();
  await expectPoll(() => (review.reviewer().remarks || []).find((remark) => remark.copiedFrom === 'c1'));
  expect((review.reviewer().remarks || []).find((remark) => remark.copiedFrom === 'c1')).toMatchObject({ hunkId: H.client, severity: 'nit' });
});

test.describe('your posted comment', () => {
  test.beforeEach(async ({ page }) => {
    review = await openReview(page);
    await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
    const main = page.getByRole('main');
    await expect(main.getByText('Is MAX still right?')).toBeVisible();
    await expect(main.getByText('AI on the code: not fixed yet.')).toBeVisible();
    await expect(main.getByText('No commit changed line 3.')).toBeVisible();
    await expect(main.getByText('AI on your comment: disagrees.')).toBeVisible();
    await expect(main.getByText('MAX does not depend on the TTL.')).toBeVisible();
  });

  test('can be resolved', async ({ page }) => {
    await page.getByRole('button', { name: 'Resolve', exact: true }).click();
    await expectPoll(() => review.reviewer().threadCalls?.['T-gh1'] === 'resolve');
  });

  test('can be left open', async ({ page }) => {
    await page.getByRole('button', { name: 'Leave open', exact: true }).click();
    await expectPoll(() => review.reviewer().threadCalls?.['T-gh1'] === 'open');
  });
});

test('shows the opinion on your pending comment until you edit its text', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Show the forecast', /^A3 src\/components\/ForecastCard\.tsx/);
  const main = page.getByRole('main');
  await expect(main.getByText('Add a docblock.')).toBeVisible();
  await expect(main.getByText('AI on your comment: agrees.')).toBeVisible();
  await expect(main.getByText('Exported components need one.')).toBeVisible();
  await main.getByRole('button', { name: 'Edit', exact: true }).click();
  await main.getByLabel('Edit your remark').fill('Add a short docblock.');
  await main.getByRole('button', { name: 'Save remark' }).click();
  await expect(main.getByText('Add a short docblock.')).toBeVisible();
  await expect(main.getByText('Exported components need one.')).toBeHidden();
});

test('marks a severity the AI set on your pending comment until you change it', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { Object.assign(data.ownRemarks[1], { severity: 'medium', severitySource: 'ai' }); } });
  await openHunk(page, 'Show the forecast', /^A3 src\/components\/ForecastCard\.tsx/);
  const main = page.getByRole('main');
  await expect(main.getByText('AI set the severity')).toBeVisible();
  await expectPoll(() => (review.reviewer().remarks || []).find((remark) => remark.id === 'gh-2')?.severity === 'medium');
  expect((review.reviewer().remarks || []).find((remark) => remark.id === 'gh-2')).toMatchObject({ severitySource: 'ai' });
  await main.getByRole('button', { name: 'Edit', exact: true }).click();
  await main.locator('label', { hasText: 'Severity' }).locator('select').selectOption('nit');
  await main.getByRole('button', { name: 'Save remark' }).click();
  await expect(main.getByText('AI set the severity')).toBeHidden();
  await expectPoll(() => (review.reviewer().remarks || []).find((remark) => remark.id === 'gh-2')?.severity === 'nit');
  expect((review.reviewer().remarks || []).find((remark) => remark.id === 'gh-2').severitySource).toBeUndefined();
});

test('marks a severity the AI set on your posted comment', async ({ page }) => {
  await openReview(page, { mutate: (data) => { data.ownRemarks[0].severitySource = 'ai'; } });
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await expect(page.getByRole('main').getByText('AI set the severity')).toBeVisible();
});

test('shows no mark when you set the severity', async ({ page }) => {
  await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await expect(page.getByRole('main').getByText('Is MAX still right?')).toBeVisible();
  await expect(page.getByText('AI set the severity')).toHaveCount(0);
});

test('gives a pending comment without a severity the lowest one', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { delete data.ownRemarks[1].severity; } });
  await expectPoll(() => (review.reviewer().remarks || []).find((remark) => remark.id === 'gh-2'));
  expect((review.reviewer().remarks || []).find((remark) => remark.id === 'gh-2').severity).toBe('nit');
});

test('shows the whole file', async ({ page }) => {
  const review = await openReview(page);
  fs.mkdirSync(path.join(review.dir, 'files', 'src'), { recursive: true });
  fs.writeFileSync(path.join(review.dir, 'files', 'src', 'cache.ts'), 'export const NAME = "cache";\nconst TTL = 60 * 1000;\nconst MAX = 10;\nconst LAST = "end of file";\n');
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await page.getByRole('button', { name: 'Whole file' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'src/cache.ts' })).toBeVisible();
  await expect(dialog.getByText('const LAST = "end of file";')).toBeVisible();
});

// A deleted file: the format hunk, with every line removed.
const deleteFormat = (data) => {
  Object.assign(data.hunks.find((hunk) => hunk.id === H.format), { status: 'removed', oldStart: 1, oldLines: 2, newStart: 0, newLines: 0, lines: ['-export const unit = "C";', '-export const round = Math.round;'] });
};

test('a deleted file shows only its diff head until you show its lines', async ({ page }) => {
  const review = await openReview(page, { mutate: deleteFormat });
  await page.goto(`${review.url}/X1`);
  const lines = page.getByRole('region', { name: 'Diff of src/utils/format.ts' });
  await expect(page.getByText('src/utils/format.ts', { exact: true }).last()).toBeVisible();
  await expect(lines).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the deleted lines' }).click();
  await expect(lines).toBeVisible();
  await expect(lines.getByText('export const round = Math.round;')).toBeVisible();
  await page.getByRole('button', { name: 'Hide the deleted lines' }).click();
  await expect(lines).toHaveCount(0);
});

test('a file that is not deleted shows its lines without a button', async ({ page }) => {
  const review = await openReview(page);
  await page.goto(`${review.url}/X1`);
  await expect(page.getByRole('region', { name: 'Diff of src/utils/format.ts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show the deleted lines' })).toHaveCount(0);
});

for (const [name, at, mutate, label] of [
  ['modified', 'B1', undefined, 'Modified file'],
  ['added', 'A3', undefined, 'New file'],
  ['renamed', 'C1', undefined, 'Renamed from src/old/legacy.ts'],
  ['deleted', 'X1', deleteFormat, 'Deleted file'],
]) {
  test(`the diff head of a ${name} file has its status icon with a tooltip, in line with the file name`, async ({ page }) => {
    const review = await openReview(page, { mutate });
    await page.goto(`${review.url}/${at}`);
    const icon = page.getByRole('main').getByRole('img', { name: label });
    await expect(icon).toBeVisible();
    // The band settles its layout after the page opens, so a first hover can miss; move away and hover again.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await icon.hover();
      await expect(page.getByRole('tooltip')).toHaveText(label, { timeout: 1500 });
    }).toPass();
    const iconBox = await icon.locator('.iconify').boundingBox();
    const name = await icon.locator('xpath=following-sibling::span[1]').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const first = range.getClientRects()[0];
      return { y: first.y, height: first.height };
    });
    expect(Math.abs((iconBox.y + iconBox.height / 2) - (name.y + name.height / 2))).toBeLessThanOrEqual(1);
  });
}

test('a comment link into a deleted file shows its lines', async ({ page }) => {
  await openReview(page, {
    mutate: (data) => {
      deleteFormat(data);
      Object.assign(data.reviewComments.find((comment) => comment.id === 'c1'), { hunkId: H.format, path: 'src/utils/format.ts', line: 2, side: 'LEFT' });
    },
  });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await page.getByRole('button', { name: 'Show this comment in the flow Not in a flow' }).click();
  await expect(page.getByRole('region', { name: 'Diff of src/utils/format.ts' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Should days come from the settings?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide the deleted lines' })).toBeVisible();
});

test('an outdated comment says that its code changed since', async ({ page }) => {
  const review = await openReview(page, { mutate: (data) => { data.reviewComments.find((comment) => comment.id === 'c1').outdated = true; } });
  await page.goto(`${review.url}/A1`);
  await expect(page.getByRole('main').getByText('outdated: the code changed since')).toBeVisible();
});
