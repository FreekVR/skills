'use strict';
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');

const COMMIT = 'https://github.com/example-org/sample-widget/commit/';
const main = (page) => page.getByRole('main');
const openHome = async (page, mutate) => {
  await openReview(page, { mutate });
  await page.getByRole('button', { name: 'Home' }).click();
};

test('links commit IDs and pull requests in the AI summary, but not in code', async ({ page }) => {
  await openHome(page, (data) => { data.context.summary = 'Builds on example-org/sample-api#8 and 1458b11. See `9f8e7d6c5b4a`, not deadbeef or 2026110.'; });
  await expect(main(page).getByRole('link', { name: 'example-org/sample-api#8' }).first()).toHaveAttribute('href', 'https://github.com/example-org/sample-api/pull/8');
  await expect(main(page).getByRole('link', { name: '1458b11', exact: true })).toHaveAttribute('href', `${COMMIT}1458b11`);
  await expect(main(page).getByText('9f8e7d6c5b4a', { exact: true })).toBeVisible();
  for (const name of ['9f8e7d6c5b4a', 'deadbeef', '2026110']) await expect(main(page).getByRole('link', { name, exact: true })).toHaveCount(0);
});

test('does not link hex inside a UUID, a file name or a URL, but does at the end of a sentence', async ({ page }) => {
  await openHome(page, (data) => { data.context.coverage.summary = 'Run e012a3d5-8c63-416e on abcdef1.js from https://example.test/abc1234/x, fixed in 1458b11.'; });
  await expect(main(page).getByRole('link', { name: '1458b11', exact: true })).toHaveAttribute('href', `${COMMIT}1458b11`);
  for (const name of ['e012a3d5', 'abcdef1', 'abc1234']) await expect(main(page).getByRole('link', { name, exact: true })).toHaveCount(0);
});

test('links commit IDs in plain AI text', async ({ page }) => {
  await openHome(page, (data) => { data.context.coverage.summary = 'Coverage from the run on 1458b11.'; });
  await expect(main(page).getByRole('link', { name: '1458b11', exact: true })).toHaveAttribute('href', `${COMMIT}1458b11`);
});

test('links commit IDs and pull requests in comments from GitHub', async ({ page }) => {
  await openReview(page, { mutate: (data) => { data.reviewComments[1].body = 'Fixed in 1458b11, see #12.'; } });
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await expect(main(page).getByRole('link', { name: '1458b11', exact: true })).toHaveAttribute('href', `${COMMIT}1458b11`);
  await expect(main(page).getByRole('link', { name: '#12', exact: true })).toHaveAttribute('href', 'https://github.com/example-org/sample-widget/issues/12');
});

test('links the commit of the page and of each review', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: /Existing reviews/ }).click();
  await expect(main(page).getByRole('link', { name: 'aaa111', exact: true }).first()).toHaveAttribute('href', `${COMMIT}aaa111`);
  await expect(main(page).getByRole('link', { name: '9f8e7d6', exact: true })).toHaveAttribute('href', `${COMMIT}9f8e7d6c5b4a`);
});

test('links both commits of what changed since your last review', async ({ page }) => {
  await openHome(page, (data) => { data.changesSince = { from: '9f8e7d6c5b4a', to: 'aaa111', summary: 'Days come from the settings now.' }; });
  const panel = main(page).getByRole('region', { name: 'Changed since your last review' });
  await expect(panel.getByRole('link', { name: '9f8e7d6', exact: true })).toHaveAttribute('href', `${COMMIT}9f8e7d6c5b4a`);
  await expect(panel.getByRole('link', { name: 'aaa111', exact: true })).toHaveAttribute('href', `${COMMIT}aaa111`);
});

test('links the PR next to its title in the navigation and, on a phone, in the header', async ({ page }) => {
  await openReview(page);
  const pr = 'https://github.com/example-org/sample-widget/pull/17';
  const nav = page.getByRole('complementary', { name: 'Review navigation' });
  await expect(nav.getByRole('link', { name: 'example-org/sample-widget#17' })).toHaveAttribute('href', pr);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.getByRole('banner').getByRole('link', { name: 'example-org/sample-widget#17' })).toHaveAttribute('href', pr);
});
