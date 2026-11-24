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
  const finding = main.getByRole('row').nth(1).getByText('1 finding');
  // The tag is the first child of the span, and its own text is not the text to line up with: that is the count after it.
  const [tag, count] = await finding.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element.lastChild);
    return [element.firstElementChild.getBoundingClientRect(), range.getClientRects()[0]].map(({ y, height }) => ({ y, height }));
  });
  expect(Math.abs((tag.y + tag.height / 2) - (count.y + count.height / 2))).toBeLessThanOrEqual(1);
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

const rail = (page) => page.getByRole('complementary', { name: 'Review navigation' });
const ALL_SEEN = [...HANDWRITTEN_SEEN, H.lock, GEN.api, GEN.model, GEN.sql];

test('the rail has a Generated files row after the flows and before Not in a flow, with the file count', async ({ page }) => {
  await openAt(page, '/');
  const rows = rail(page).getByRole('listitem');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(3)).toContainText('Generated files');
  await expect(rows.nth(3)).toContainText('4 files');
  await expect(rows.nth(3).getByTitle(/^(All hunks approved|Changes requested|Reviewed with comments)$/)).toHaveCount(0);
  await expect(rows.nth(4)).toContainText('Not in a flow');
  await rows.nth(3).getByRole('button').click();
  await expect(heading(page)).toHaveText('Generated files');
});

test('the rail row shows a disc in the colour of what the group counts as, after the count', async ({ page }) => {
  await openAt(page, '/', { reviewer: RAISED });
  const row = rail(page).getByRole('listitem').nth(3);
  await expect(row).toContainText('4 files');
  const disc = row.getByTitle('Changes requested');
  await expect(disc).toHaveClass(/bg-error/);
  const [count, box] = await Promise.all([row.getByText('4 files').boundingBox(), disc.boundingBox()]);
  expect(box.x).toBeGreaterThan(count.x + count.width - 1);
});

test('Home has a Generated files tile on its own row that opens the group', async ({ page }) => {
  await openAt(page, '/');
  const main = page.getByRole('banner');
  const tile = main.getByRole('button', { name: /^Generated files/ });
  await expect(tile).toContainText('4 files · 1 finding · one verdict');
  const [other, own] = await Promise.all([main.getByRole('button', { name: /^Not in a flow/ }).boundingBox(), tile.boundingBox()]);
  expect(own.y).toBeGreaterThanOrEqual(other.y + other.height);
  await tile.click();
  await expect(heading(page)).toHaveText('Generated files');
});

test('the Home tile says what the group counts as once it has a verdict', async ({ page }) => {
  await openAt(page, '/', { reviewer: RAISED });
  await expect(page.getByRole('banner').getByRole('button', { name: /^Generated files/ })).toContainText('Counts as request changes');
});

test('Submit review lists the group as one line until it has a verdict', async ({ page }) => {
  await openAt(page, '/submit', { reviewer: { seen: HANDWRITTEN_SEEN } });
  await page.getByText('Hunks and flows you have seen').click();
  const coverage = page.locator('#term-coverage');
  await expect(coverage).toContainText('Generated files');
  await expect(coverage).toContainText('no verdict yet · 4 files');
  await expect(coverage).not.toContainText('WeatherApi.ts');
  await coverage.getByRole('button', { name: 'Open the group' }).click();
  await expect(heading(page)).toHaveText('Generated files');
});

test('Submit review leaves the group out once it has a verdict, and lists it again when an update adds a changed hunk', async ({ page }) => {
  const review = await openAt(page, '/submit', { reviewer: { seen: ALL_SEEN, generatedVerdict: 'approved' } });
  await page.getByText('Hunks and flows you have seen').click();
  const coverage = page.locator('#term-coverage');
  await expect(coverage).toContainText('You have seen every hunk.');
  await expect(coverage.getByRole('button', { name: 'Open the group' })).toHaveCount(0);
  review.update((data) => { data.hunks.find((hunk) => hunk.id === GEN.api).id = 'bbbbbbbbbbb9'; });
  await expect(coverage.getByRole('button', { name: 'Open the group' })).toBeVisible();
  await expect(coverage).toContainText('not all seen · 4 files');
  await expect(coverage).not.toContainText('no verdict yet');
  // The group keeps its verdict, and the changed hunk is not seen.
  await expect(rail(page).getByRole('listitem').nth(3).getByTitle('All hunks approved')).toBeVisible();
  expect(review.reviewer().generatedVerdict).toBe('approved');
  expect(review.reviewer().seen).not.toContain('bbbbbbbbbbb9');
});

test('the coverage item is not done while every hunk is seen but the group has no verdict', async ({ page }) => {
  await openAt(page, '/submit', { reviewer: { seen: ALL_SEEN } });
  const summary = page.locator('#term-coverage summary');
  await expect(summary).not.toContainText('Done:');
  await summary.click();
  await expect(page.locator('#term-coverage').getByRole('button', { name: 'Open the group' })).toBeVisible();
});

test('without a generated key the rail, Home and Submit review show no group', async ({ page }) => {
  const review = await openAt(page, '/', { mutate: () => {} });
  await expect(rail(page).getByRole('listitem')).toHaveCount(4);
  await expect(page.getByRole('banner').getByRole('button', { name: /^Generated files/ })).toHaveCount(0);
  await page.goto(`${review.url}/submit`);
  await page.getByText('Hunks and flows you have seen').click();
  await expect(page.locator('#term-coverage')).not.toContainText('Generated files');
});

test('the icons of the group on Home, in the rail and on Submit review line up with their text', async ({ page }) => {
  const review = await openAt(page, '/', { reviewer: RAISED });
  const row = rail(page).getByRole('listitem').nth(3);
  await expectAligned(page, row.getByTitle('Generated files'), row.getByText('Generated files'));
  await expectAligned(page, row.getByTitle('Changes requested'), row.getByText('4 files'));
  const tile = page.getByRole('banner').getByRole('button', { name: /^Generated files/ });
  // The tile's text is two lines, so the bullet centres on both lines together, as it does on the flow tiles.
  const [bullet, text] = await Promise.all([tile.getByTitle('Generated files').boundingBox(), tile.locator('span.grid').boundingBox()]);
  expect(Math.abs((bullet.y + bullet.height / 2) - (text.y + text.height / 2))).toBeLessThanOrEqual(1);
  const [cog, square] = await Promise.all([tile.getByTitle('Generated files').locator('.iconify').boundingBox(), tile.getByTitle('Generated files').locator('svg').first().boundingBox()]);
  expect(Math.abs((cog.y + cog.height / 2) - (square.y + square.height / 2))).toBeLessThanOrEqual(1);
  await page.goto(`${review.url}/submit`);
  await page.getByText('Hunks and flows you have seen').click();
  const entry = page.locator('#term-coverage p', { hasText: 'Generated files' });
  await expect(entry).toBeVisible();
  await expectAligned(page, entry.getByTitle('Generated files'), entry.locator('b'));
});

test('a generated hunk in a flow shows the Generated tag, a cog on its map stop and a line that opens the group', async ({ page }) => {
  await openAt(page, '/B2');
  const band = page.getByRole('banner');
  await expect(band.locator('[data-generated-tag]')).toHaveText('Generated');
  await expect(band.locator('[data-generated-mark]')).toHaveCount(1);
  const note = page.locator('[data-generated-note]');
  await expect(note).toContainText('A tool writes this file (Lockfile or snapshot name)');
  await expect(note).toContainText('one of the 4 files in Generated files');
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request changes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comment' })).toBeVisible();
  await note.getByRole('button', { name: 'Open the group' }).click();
  await expect(heading(page)).toHaveText('Generated files');
});

test('the generated line, tag and map mark line up with their text', async ({ page }) => {
  await openAt(page, '/B2');
  const band = page.getByRole('banner');
  const tag = band.locator('[data-generated-tag]');
  await expectAligned(page, tag.getByTitle('Generated files'), tag.locator('span').last());
  const note = page.locator('[data-generated-note]');
  await expectAligned(page, note.getByTitle('Generated files'), note.locator('b').first());
  const [mark, tick] = await Promise.all([band.locator('[data-generated-mark]').boundingBox(), band.locator('[data-tick]').nth(1).boundingBox()]);
  expect(Math.abs((mark.y + mark.height / 2) - (tick.y + tick.height / 2))).toBeLessThanOrEqual(1);
  const [cog, square] = await Promise.all([band.locator('[data-generated-mark] .iconify').boundingBox(), band.locator('[data-generated-mark] svg').first().boundingBox()]);
  expect(Math.abs((cog.y + cog.height / 2) - (square.y + square.height / 2))).toBeLessThanOrEqual(1);
});

test('a stop that is not generated shows no tag or line, and only the generated stop has a mark on the map', async ({ page }) => {
  await openAt(page, '/B1');
  await expect(page.locator('[data-generated-tag], [data-generated-note], [data-group-hint]')).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('button', { name: /^B2 package-lock.json/ }).locator('[data-generated-mark]')).toHaveCount(1);
  await expect(page.getByRole('banner').getByRole('button', { name: /^B1 / }).locator('[data-generated-mark]')).toHaveCount(0);
});

test('a shared stop more severe than the approved group says the group counts as that verdict, and leaves the group verdict alone', async ({ page }) => {
  const review = await openAt(page, '/B2', { reviewer: RAISED });
  const hint = page.locator('[data-group-hint]');
  await expect(hint).toHaveText('Counts as request changes for the group');
  await expectAligned(page, hint.locator('.iconify'), hint.locator('span:not(.iconify)'));
  expect(review.reviewer().generatedVerdict).toBe('approved');
});

test('the hint shows for a group verdict of comment and a stop on request changes', async ({ page }) => {
  await openAt(page, '/B2', { reviewer: { generatedVerdict: 'comment', hunkVerdicts: { [H.lock]: 'changes' } } });
  await expect(page.locator('[data-group-hint]')).toHaveText('Counts as request changes for the group');
});

test('the hint is absent while the group has no verdict, and when the stop is not more severe', async ({ page }) => {
  await openAt(page, '/B2', { reviewer: { hunkVerdicts: { [H.lock]: 'changes' } } });
  await expect(page.getByRole('button', { name: 'Request changes' })).toBeVisible();
  await expect(page.locator('[data-group-hint]')).toHaveCount(0);
});

test('the hint is absent when the stop is not more severe than the group', async ({ page }) => {
  await openAt(page, '/B2', { reviewer: { generatedVerdict: 'comment', hunkVerdicts: { [H.lock]: 'approved' } } });
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await expect(page.locator('[data-group-hint]')).toHaveCount(0);
});

// A PR that changes only generated files.
function onlyGenerated(data) {
  withGenerated(data);
  data.hunks = data.hunks.filter((hunk) => Object.values(GEN).includes(hunk.id));
  data.flows = [];
  data.notInAnyFlow = [];
  data.reviewComments = [];
  data.ownRemarks = [];
  data.findings = data.findings.filter((finding) => finding.hunkId === GEN.api);
  data.generated.files.pop();
}

test('a PR of only generated files has no All files line, and j, the rail and Submit review work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openAt(page, '/', { mutate: onlyGenerated });
  await expect(page.getByRole('main')).not.toContainText('All files');
  await expect(rail(page)).not.toContainText('All files');
  await expect(rail(page).getByRole('listitem')).toHaveCount(1);
  await page.keyboard.press('j');
  await expect(heading(page)).toHaveText('Generated files');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/\/submit$/);
  await expect(heading(page)).toHaveText(/Submit review|Post a new review/);
  await page.keyboard.press('k');
  await expect(heading(page)).toHaveText('Generated files');
  expect(errors).toEqual([]);
});

test('Submit review links a generated file with no stop to the file dialog', async ({ page }) => {
  await openAt(page, '/submit', { reviewer: { seen: HANDWRITTEN_SEEN } });
  await page.getByText('Your verdicts per hunk').click();
  await page.locator('#term-hunk-verdicts').getByRole('button', { name: 'src/api/generated/WeatherApi.ts' }).click();
  await expect(page.getByRole('dialog').getByRole('region', { name: 'Diff of src/api/generated/WeatherApi.ts' })).toBeVisible();
});

test('n opens the group while it has a verdict but a hunk of it is unseen', async ({ page }) => {
  await openAt(page, '/A1', { reviewer: { seen: [...HANDWRITTEN_SEEN, H.lock, GEN.model, GEN.sql], generatedVerdict: 'approved' } });
  await page.keyboard.press('n');
  await expect(heading(page)).toHaveText('Generated files');
});

test('show new comments opens the file of a comment on a generated file with no stop', async ({ page }) => {
  const review = await openAt(page, '/', { reviewer: { knownComments: ['c1', 'c2'] } });
  review.update((data) => data.reviewComments.push({ id: 'c3', reviewId: 501, threadId: 'T-c3', author: 'other-reviewer', hunkId: GEN.api, path: 'src/api/generated/WeatherApi.ts', line: 1, side: 'RIGHT', body: 'Is this regenerated?', diffHunk: '', resolved: false, replies: [] }));
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('region', { name: 'Diff of src/api/generated/WeatherApi.ts' })).toBeVisible();
});

test('copying a comment on a generated file with no stop opens the remark form in the file dialog', async ({ page }) => {
  const comment = { id: 'c3', reviewId: 501, threadId: 'T-c3', author: 'other-reviewer', hunkId: GEN.api, path: 'src/api/generated/WeatherApi.ts', line: 1, side: 'RIGHT', body: 'Is this regenerated?', diffHunk: '@@ -0,0 +1 @@\n+generated', resolved: false, replies: [] };
  await openAt(page, '/reviews', { mutate: (data) => { withGenerated(data); data.reviewComments = [comment]; }, reviewer: { knownComments: ['c3'] } });
  await page.getByRole('button', { name: 'Copy to my review' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('region', { name: 'Diff of src/api/generated/WeatherApi.ts' })).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveValue(/> @other-reviewer: Is this regenerated\?/);
});

test('an update that removes the group while its page is open opens Home', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const review = await openAt(page, '/generated');
  review.update((data) => { delete data.generated; });
  await expect(page).not.toHaveURL(/\/generated$/);
  await expect(heading(page)).toHaveText('Home');
  await page.keyboard.press('a');
  expect(errors).toEqual([]);
});

test('a group of one file says this file, in the verdict, the note on its stop and once the review is posted', async ({ page }) => {
  const oneFile = (data) => { withGenerated(data); data.generated.files = [{ path: 'package-lock.json', reason: 'name' }]; };
  const review = await openAt(page, '/generated', { mutate: oneFile });
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Your verdict on this file' })).toBeVisible();
  await expect(main.getByRole('group', { name: /^Your verdict on this file\./ })).toBeVisible();
  await page.goto(review.url + '/B2');
  await expect(page.locator('[data-generated-note]')).toContainText('It is also the one file in Generated files');
  await page.goto(review.url + '/generated');
  await main.getByRole('group').getByRole('button', { name: 'Approve' }).click();
  await review.saved((reviewer) => reviewer.generatedVerdict === 'approved');
});

test('once the review is posted the group page says the verdict with approved, not approve', async ({ page }) => {
  const posted = { sent: [{ id: 'p1', type: 'post', kind: 'final' }], generatedVerdict: 'approved' };
  await openAt(page, '/generated', { reviewer: posted, mutate: (data) => { withGenerated(data); data.posts = [{ eventId: 'p1', kind: 'final', status: 'posted', message: 'ok', url: 'https://github.com/example-org/sample-widget/pull/17#pullrequestreview-10', reviewId: 10 }]; } });
  await expect(page.getByRole('main')).toContainText('Your verdict on all 4 files: approved · review posted');
});

test('the Worst line on Home names Generated files for a finding on a generated file with no stop', async ({ page }) => {
  await openAt(page, '/', { mutate: (data) => { withGenerated(data); data.findings = data.findings.filter((finding) => finding.id === 'g1'); } });
  await expect(page.getByRole('main')).toContainText('Worst: Generated call differs (Generated files, minor)');
});

test('the group page says Generated files when you saw a stop there first, and the verdict counts the group verdict', async ({ page }) => {
  await openAt(page, '/B2', { reviewer: { seen: [H.lock], seenIn: { [H.lock]: '__generated' } } });
  await expect(page.getByRole('main')).toContainText('You saw this hunk in Generated files already.');
});

test('the band says request changes when the group has that verdict and every file has an approval of its own', async ({ page }) => {
  await openAt(page, '/generated', { reviewer: { generatedVerdict: 'changes', hunkVerdicts: { [H.lock]: 'approved', [GEN.api]: 'approved', [GEN.model]: 'approved', [GEN.sql]: 'approved' } } });
  await expect(page.getByRole('banner')).toContainText('Counts as request changes');
});
