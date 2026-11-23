'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview, expectAligned } = require('./helpers.js');
const { H } = require('./fixture.js');

const GEN = { api: 'bbbbbbbbbbb1', model: 'bbbbbbbbbbb2', sql: 'bbbbbbbbbbb3' };

// Adds the group of generated files: three files with a hunk each, and the lockfile, which is also a step of a flow.
function withGenerated(data) {
  const hunk = (id, file) => ({ id, file, status: 'added', oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, context: '', lines: ['+generated'], explanation: 'Generated.' });
  data.hunks.push(hunk(GEN.api, 'src/api/generated/WeatherApi.ts'), hunk(GEN.model, 'src/api/generated/models/Forecast.ts'), hunk(GEN.sql, 'scripts/schema.sql'));
  data.generated = {
    files: [
      { path: 'src/api/generated/WeatherApi.ts', reason: 'header' },
      { path: 'src/api/generated/models/Forecast.ts', reason: 'header' },
      { path: 'scripts/schema.sql', reason: 'confirmed' },
      { path: 'package-lock.json', reason: 'name' },
    ],
    summary: 'The client is generated from the spec.',
    sourceHunkIds: [],
  };
  data.findings.push({ id: 'g1', hunkId: GEN.api, line: 1, side: 'RIGHT', severity: 'minor', title: 'Generated call differs', body: 'The generated call changed.', rule: 'correctness' });
}

const heading = (page) => page.getByRole('heading', { level: 1 });

async function openAt(page, path, options = {}) {
  const review = await openReview(page, { mutate: withGenerated, ...options });
  await page.goto(review.url + path);
  await page.getByRole('main').waitFor();
  return review;
}

test('the address /generated opens the group page', async ({ page }) => {
  await openAt(page, '/generated');
  await expect(heading(page)).toHaveText('Generated files');
  await expect(page).toHaveURL(/\/generated$/);
});

test('j from the last stop of the last flow opens the group, then X1; k from X1 opens the group', async ({ page }) => {
  await openAt(page, '/C2');
  await page.keyboard.press('j');
  await expect(heading(page)).toHaveText('Generated files');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/\/X1$/);
  await page.keyboard.press('k');
  await expect(heading(page)).toHaveText('Generated files');
  await page.keyboard.press('k');
  await expect(page).toHaveURL(/\/C2$/);
});

test('a verdict on the last unseen stop opens the group while it has no verdict', async ({ page }) => {
  const seen = [H.client, H.cache, H.card, H.rename, H.logo, H.lock, GEN.api, GEN.model, GEN.sql];
  await openAt(page, '/X1', { reviewer: { seen } });
  await page.keyboard.press('a');
  await expect(heading(page)).toHaveText('Generated files');
});

test('n with every stop seen opens the group while it has no verdict', async ({ page }) => {
  await openAt(page, '/A1', { reviewer: { seen: [H.client, H.cache, H.card, H.rename, H.logo, H.lock, H.format] } });
  await page.keyboard.press('n');
  await expect(heading(page)).toHaveText('Generated files');
});

test('the group opens in the directory layout too', async ({ page }) => {
  await openAt(page, '/generated', { mutate: (data) => { withGenerated(data); data.layout = 'directory'; } });
  await expect(heading(page)).toHaveText('Generated files');
  await page.keyboard.press('k');
  await expect(page).toHaveURL(/\/F\d+$/);
  await page.keyboard.press('j');
  await expect(heading(page)).toHaveText('Generated files');
});

test('opening the group page alone leaves its hunks unseen', async ({ page }) => {
  const review = await openAt(page, '/generated');
  await expect(heading(page)).toHaveText('Generated files');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/\/X1$/);
  await review.saved((reviewer) => (reviewer.seen || []).includes(H.format));
  expect(review.reviewer().seen).not.toContain(GEN.api);
  expect(review.reviewer().seen).not.toContain(GEN.model);
  expect(review.reviewer().seen).not.toContain(GEN.sql);
});

for (const [key, verdict] of [['a', 'approved'], ['r', 'changes'], ['c', 'comment']]) {
  test(`${key} on the group page gives the group the verdict ${verdict}, marks its hunks seen and opens Submit review`, async ({ page }) => {
    const review = await openAt(page, '/generated', { reviewer: { seen: [H.client, H.cache, H.card, H.rename, H.logo, H.format] } });
    await page.keyboard.press(key);
    await expect(page).toHaveURL(/\/submit$/);
    await review.saved((reviewer) => reviewer.generatedVerdict === verdict);
    expect(review.reviewer().seen).toEqual(expect.arrayContaining([GEN.api, GEN.model, GEN.sql, H.lock]));
  });
}

// Every handwritten hunk seen, so a verdict on the group goes on to Submit review.
const HANDWRITTEN_SEEN = [H.client, H.cache, H.card, H.rename, H.logo, H.format];
// The group has a verdict, and B2, its shared hunk, a more severe one.
const RAISED = { generatedVerdict: 'approved', hunkVerdicts: { [H.lock]: 'changes' } };

test('the band counts the files made by tools', async ({ page }) => {
  await openAt(page, '/generated');
  const band = page.getByRole('banner');
  await expect(band).toContainText('4 files made by tools');
  await expect(band).not.toContainText('Counts as');
});

test('the band and the verdict say what the group counts as once a shared hunk is more severe', async ({ page }) => {
  await openAt(page, '/generated', { reviewer: RAISED });
  await expect(page.getByRole('banner')).toContainText('Counts as request changes');
  await expect(page.getByRole('main')).toContainText('Counts as request changes, because of your verdict on B2 package-lock.json in Store the forecast.');
});

test('the summary shows generated.summary without Explain more, and a link that opens each source hunk', async ({ page }) => {
  await openAt(page, '/generated', { mutate: (data) => { withGenerated(data); data.generated.sourceHunkIds = [H.client]; } });
  const main = page.getByRole('main');
  await expect(main.getByText('The client is generated from the spec.')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Explain more' })).toHaveCount(0);
  await main.getByRole('button', { name: 'A1 src/api/weatherClient.ts' }).click();
  await expect(page).toHaveURL(/\/A1$/);
});

test('findings on generated hunks show as notes you can include, and no other findings', async ({ page }) => {
  await openAt(page, '/generated');
  const main = page.getByRole('main');
  await expect(main.getByText('Generated call differs')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Include in my review' })).toHaveCount(1);
  await expect(main.getByText('TTL is in milliseconds')).toHaveCount(0);
});

test('the file list says why each file counts as generated, with its changes, findings and shared stop', async ({ page }) => {
  await openAt(page, '/generated', { reviewer: { hunkVerdicts: { [H.lock]: 'changes' } } });
  const table = page.getByRole('main').getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Why it counts as generated' })).toBeVisible();
  const rows = table.getByRole('row');
  await expect(rows).toHaveCount(5);
  // Files with findings first, then shared files, then by path.
  await expect(rows.nth(1)).toContainText('src/api/generated/WeatherApi.ts');
  await expect(rows.nth(1)).toContainText('Header says generated');
  await expect(rows.nth(1)).toContainText('+1 −0');
  await expect(rows.nth(1)).toContainText('1 finding');
  await expect(rows.nth(2)).toContainText('package-lock.json');
  await expect(rows.nth(2)).toContainText('Lockfile or snapshot name');
  await expect(rows.nth(2)).toContainText('+2 −2');
  await expect(rows.nth(2)).toContainText('B2');
  await expect(rows.nth(2)).toContainText('You requested changes');
  await expect(rows.nth(3)).toContainText('scripts/schema.sql');
  await expect(rows.nth(3)).toContainText('You confirmed');
  await expect(rows.nth(4)).toContainText('src/api/generated/models/Forecast.ts');
  await rows.nth(2).getByRole('button', { name: /B2/ }).click();
  await expect(page).toHaveURL(/\/B2$/);
});

test('a row opens its file in the dialog with its findings, previous and next walk the list, and Escape closes it', async ({ page }) => {
  const review = await openAt(page, '/generated');
  await page.getByRole('main').getByRole('table').getByRole('button', { name: 'src/api/generated/WeatherApi.ts' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'src/api/generated/WeatherApi.ts' })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Diff of src/api/generated/WeatherApi.ts' })).toBeVisible();
  await expect(dialog.getByText('Generated call differs')).toBeVisible();
  await expect(dialog.getByText('1 of 4')).toBeVisible();
  await expect(dialog.getByRole('group', { name: /^Your verdict/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Previous file' })).toBeDisabled();
  await expect(dialog.getByText('Header says generated')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Whole file' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Next file' }).click();
  await expect(dialog.getByRole('heading', { name: 'package-lock.json' })).toBeVisible();
  await expect(dialog.getByText('2 of 4')).toBeVisible();
  await expect(dialog.getByText('Lockfile or snapshot name')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Open B2 in Store the forecast' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Previous file' }).click();
  await expect(dialog.getByRole('heading', { name: 'src/api/generated/WeatherApi.ts' })).toBeVisible();
  // Opening a file counts as seeing its hunk.
  await review.saved((reviewer) => [GEN.api, H.lock].every((id) => (reviewer.seen || []).includes(id)));
  expect(review.reviewer().seen).not.toContain(GEN.model);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(heading(page)).toHaveText('Generated files');
});

test('Open B2 in the file dialog closes the dialog and opens that stop', async ({ page }) => {
  await openAt(page, '/generated');
  await page.getByRole('main').getByRole('table').getByRole('button', { name: 'package-lock.json' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open B2 in Store the forecast' }).click();
  await expect(page).toHaveURL(/\/B2$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the file dialog shows the diff of a deleted and of a binary generated file', async ({ page }) => {
  await openAt(page, '/generated', { mutate: (data) => {
    withGenerated(data);
    Object.assign(data.hunks.find((hunk) => hunk.id === GEN.sql), { status: 'removed', oldStart: 1, oldLines: 1, newStart: 0, newLines: 0, lines: ['-create table forecast;'] });
    Object.assign(data.hunks.find((hunk) => hunk.id === GEN.model), { binary: true, lines: [] });
  } });
  const table = page.getByRole('main').getByRole('table');
  await table.getByRole('button', { name: 'scripts/schema.sql' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Show the deleted lines' }).click();
  await expect(dialog.getByRole('region', { name: 'Diff of scripts/schema.sql' }).getByText('create table forecast;')).toBeVisible();
  await page.keyboard.press('Escape');
  await table.getByRole('button', { name: 'src/api/generated/models/Forecast.ts' }).click();
  await expect(dialog.getByText('This is a binary file. Open it on GitHub to compare.')).toBeVisible();
});

test('at phone width the file list keeps its words whole', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAt(page, '/generated');
  const row = page.getByRole('main').getByRole('table').getByRole('row').nth(1);
  const lineCount = (locator, text) => locator.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent.includes(wanted)) {
        const range = document.createRange();
        range.setStart(node, node.textContent.indexOf(wanted));
        range.setEnd(node, node.textContent.indexOf(wanted) + wanted.length);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
      }
    }
    return 0;
  }, text);
  expect(await lineCount(row, 'Header says generated')).toBe(1);
  expect(await lineCount(row, 'WeatherApi.ts')).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// The close button stays at the top right, on the title row, also on a phone.
async function expectCloseOnTitleRow(dialog) {
  const [title, close, box] = await Promise.all([dialog.getByRole('heading').boundingBox(), dialog.getByRole('button', { name: /^Close/ }).boundingBox(), dialog.boundingBox()]);
  const centre = close.y + close.height / 2;
  expect(centre).toBeGreaterThanOrEqual(title.y);
  expect(centre).toBeLessThanOrEqual(title.y + title.height);
  expect(box.x + box.width - (close.x + close.width)).toBeLessThanOrEqual(24);
}

test('at phone width both file dialogs keep the close button on the title row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const review = await openAt(page, '/generated');
  await page.getByRole('main').getByRole('table').getByRole('button', { name: 'package-lock.json' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await expectCloseOnTitleRow(dialog);
  // Previous, the count and next stay together on one row.
  const centres = await Promise.all([dialog.getByRole('button', { name: 'Previous file' }), dialog.getByText('2 of 4'), dialog.getByRole('button', { name: 'Next file' })]
    .map(async (part) => { const box = await part.boundingBox(); return box.y + box.height / 2; }));
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  fs.mkdirSync(path.join(review.dir, 'files', 'src'), { recursive: true });
  fs.writeFileSync(path.join(review.dir, 'files', 'src', 'cache.ts'), 'export const NAME = "cache";\n');
  await page.goto(`${review.url}/B1`);
  await page.getByRole('main').getByRole('button', { name: 'Whole file' }).click();
  await dialog.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await expectCloseOnTitleRow(dialog);
});

test('a, r and c do nothing while the file dialog is open on the group page', async ({ page }) => {
  const review = await openAt(page, '/generated', { reviewer: { seen: HANDWRITTEN_SEEN } });
  await page.getByRole('main').getByRole('table').getByRole('button', { name: 'scripts/schema.sql' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  for (const key of ['a', 'r', 'c']) await page.keyboard.press(key);
  await review.saved((reviewer) => (reviewer.seen || []).includes(GEN.sql));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/generated$/);
  expect(review.reviewer().generatedVerdict).toBeFalsy();
});

test('the verdict buttons on the group page suggest from the findings, set the group verdict and go on', async ({ page }) => {
  const review = await openAt(page, '/generated', { reviewer: { seen: HANDWRITTEN_SEEN } });
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Your verdict on all 4 files' })).toBeVisible();
  const buttons = main.getByRole('group', { name: /^Your verdict on all 4 files/ });
  await expect(buttons.getByRole('button', { name: /Request changes/ })).toHaveAttribute('title', /^Suggested for these files\./);
  await buttons.getByRole('button', { name: /Comment/ }).click();
  await expect(page).toHaveURL(/\/submit$/);
  await review.saved((reviewer) => reviewer.generatedVerdict === 'comment');
  expect(review.reviewer().hunkVerdicts || {}).toEqual({});
});

test('a hunk\'s Whole file dialog still shows the whole file', async ({ page }) => {
  const review = await openAt(page, '/B1');
  fs.mkdirSync(path.join(review.dir, 'files', 'src'), { recursive: true });
  fs.writeFileSync(path.join(review.dir, 'files', 'src', 'cache.ts'), 'export const NAME = "cache";\nconst TTL = 60 * 1000;\nconst MAX = 10;\nconst LAST = "end of file";\n');
  await page.getByRole('main').getByRole('button', { name: 'Whole file' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'src/cache.ts' })).toBeVisible();
  await expect(dialog.getByText('const LAST = "end of file";')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Next file' })).toHaveCount(0);
});

test('every icon next to text on the group page lines up with that text', async ({ page }) => {
  await openAt(page, '/generated', { reviewer: RAISED });
  const band = page.getByRole('banner');
  const bullet = band.getByTitle('Generated files');
  await expectAligned(page, bullet, heading(page));
  // The cog sits in the middle of its square.
  const [cog, square] = await Promise.all([bullet.locator('.iconify').boundingBox(), bullet.locator('svg').first().boundingBox()]);
  expect(Math.abs((cog.y + cog.height / 2) - (square.y + square.height / 2))).toBeLessThanOrEqual(1);
  await expectAligned(page, band.locator('[data-counts-as] .iconify'), band.locator('[data-counts-as] > span').last());
  const main = page.getByRole('main');
  await expectAligned(page, main.locator('[data-counts-as] .iconify'), main.locator('[data-counts-as] > span').last());
  const shared = main.getByRole('row').nth(2).getByRole('button', { name: /B2/ });
  await expectAligned(page, shared.getByTitle('Store the forecast'), shared.getByText('B2'));
  await expectAligned(page, shared.locator('.iconify').last(), shared.getByText('B2'));
  await main.getByRole('table').getByRole('button', { name: 'package-lock.json' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await expectAligned(page, dialog.getByRole('heading').getByTitle('Generated files'), dialog.getByRole('heading'));
  await expectAligned(page, dialog.getByRole('button', { name: 'Next file' }).locator('.iconify'), dialog.getByText('2 of 4'));
  await expectAligned(page, dialog.getByRole('button', { name: 'Previous file' }).locator('.iconify'), dialog.getByText('2 of 4'));
});
