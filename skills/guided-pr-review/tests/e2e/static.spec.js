'use strict';
// The static page: one HTML file, opened from file:// with no review server and no agent.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { review: fixture } = require('./fixture.js');

const ROOT = path.join(__dirname, '..', '..');
const summaryBox = (page) => page.getByRole('textbox', { name: 'Review summary' });

async function openStatic(page) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-static-'));
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(fixture()));
  const out = path.join(dir, 'review.html');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'review-data.js'), 'static', dir, out]);
  page.on('close', () => fs.rmSync(dir, { recursive: true, force: true }));
  await page.goto(`file://${out}`);
  await page.getByRole('main').waitFor();
}

test('shows the flows and Home, without the agent features', async ({ page }) => {
  await openStatic(page);
  await expect(page.getByRole('button', { name: 'Ask the agent about this hunk' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explain more' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Post as draft/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('banner').getByRole('heading', { name: 'feat: add three-day forecast' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: /Show the forecast/ })).toBeVisible();
});

test('keeps the reviewer state in the browser after a reload', async ({ page }) => {
  await openStatic(page);
  await page.keyboard.press('s');
  await summaryBox(page).fill('Looks fine to me.');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('guided-pr-review:example-org/sample-widget#17'))).toContain('Looks fine to me.');
  await page.reload();
  await page.getByRole('main').waitFor();
  await page.keyboard.press('s');
  await expect(summaryBox(page)).toHaveValue('Looks fine to me.');
});

test('Submit review shows the gh command that posts the review', async ({ page }) => {
  await openStatic(page);
  // The page saves its state as it opens; wait for that save, so it cannot overwrite the state set below on the reload.
  await page.waitForFunction(() => localStorage.getItem('guided-pr-review:example-org/sample-widget#17'));
  await page.evaluate(() => localStorage.setItem('guided-pr-review:example-org/sample-widget#17', JSON.stringify({ summary: "It's fine." })));
  await page.reload();
  await page.getByRole('main').waitFor();
  await page.keyboard.press('s');
  await page.getByRole('group', { name: 'Verdict' }).getByRole('button', { name: /^Comment/ }).click();
  await expect(page.getByRole('button', { name: /^Post review/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Write a summary from your remarks' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy the gh command' }).click();
  const command = page.locator('pre code');
  await expect(command).toContainText("| gh api --method POST repos/example-org/sample-widget/pulls/17/reviews --input -");
  // The ' in the summary is closed, escaped and opened again for the shell.
  await expect(command).toContainText(`"body":"It'\\''s fine.`);
  await expect(command).toContainText('"event":"COMMENT"');
});
