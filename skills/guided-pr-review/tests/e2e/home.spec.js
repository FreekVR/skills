'use strict';
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');

async function openHome(page, options) {
  const review = await openReview(page, options);
  await page.getByRole('button', { name: 'Home' }).click();
  return review;
}

test('shows the PR title, author, description and AI summary', async ({ page }) => {
  await openHome(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'feat: add three-day forecast' })).toBeVisible();
  await expect(main.getByText('by sample-author')).toBeVisible();
  await expect(main.getByText('The PR fetches a three-day forecast and shows it in a card.')).toBeVisible();
  await main.getByText('PR description').click();
  await expect(main.getByText('forecast card.')).toBeVisible();
});

test('shows unmet criteria and folds the met ones', async ({ page }) => {
  await openHome(page);
  const main = page.getByRole('main');
  await expect(main.getByText('1 of 2 criteria not met').first()).toBeVisible();
  await expect(main.getByText('Caches the forecast for one hour.')).toBeVisible();
  await expect(main.getByText('Shows three days with min and max temperature.')).toBeHidden();
  await main.getByText('Show the 1 met criterion').click();
  await expect(main.getByText('Shows three days with min and max temperature.')).toBeVisible();
});

test('folds the criteria panel when every criterion is met', async ({ page }) => {
  await openHome(page, { mutate: (data) => { data.context.tickets[0].acceptanceCriteria[1].verdict = 'met'; } });
  const main = page.getByRole('main');
  await expect(main.getByText('All 2 criteria met').first()).toBeVisible();
  await expect(main.getByText('Caches the forecast for one hour.')).toBeHidden();
  await expect(main.getByText('Shows three days with min and max temperature.')).toBeHidden();
  await main.getByText('Show the 2 criteria').click();
  await expect(main.getByText('Shows three days with min and max temperature.')).toBeVisible();
  await expect(main.getByText('Caches the forecast for one hour.')).toBeVisible();
});

test('counts the AI findings per severity, on the whole PR and in the flows', async ({ page }) => {
  await openHome(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'What the AI found' })).toBeVisible();
  await expect(main.getByText('1 major', { exact: true })).toBeVisible();
  await expect(main.getByText('1 medium', { exact: true })).toBeVisible();
  await expect(main.getByText('1 nit', { exact: true })).toBeVisible();
  await expect(main.getByText('1 on the whole PR')).toBeVisible();
  await expect(main.getByText('2 in the flows')).toBeVisible();
  await expect(main.getByText('No test for the card').first()).toBeVisible();
});

test('shows the comment outside the diff, the test coverage and what the AI did not read', async ({ page }) => {
  await openHome(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Comments outside the diff' })).toBeVisible();
  await expect(main.getByText('The README does not mention the card.')).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Test coverage' })).toBeVisible();
  await expect(main.getByText('Line coverage 81%, the new card has no test.')).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Not read by the AI' })).toBeVisible();
  await expect(main.getByText('Confluence: no tool can read Confluence')).toBeVisible();
});

test('folds the tickets and linked pull requests', async ({ page }) => {
  await openHome(page);
  const main = page.getByRole('main');
  await expect(main.getByText('Adds the endpoint this PR calls.')).toBeHidden();
  await main.getByText('1 ticket · 1 linked pull request').click();
  await expect(main.getByText('Adds the endpoint this PR calls.')).toBeVisible();
  await expect(main.getByRole('link', { name: 'WX-42', exact: true })).toBeVisible();
});

test('lists the flows with findings and seen counts, and your review so far', async ({ page }) => {
  await openHome(page);
  const main = page.getByRole('main');
  const flow = (name) => main.getByRole('button', { name: new RegExp(`^${name} .`) });
  await expect(flow('Show the forecast')).toContainText('2 findings');
  await expect(flow('Show the forecast')).toContainText('0/3 seen');
  await expect(flow('Store the forecast')).toContainText('1 finding');
  await expect(flow('Store the forecast')).toContainText('0/2 seen');
  await expect(flow('Moved and added files')).toContainText('0/2 seen');
  await expect(flow('Not in a flow')).toContainText('0/1 seen');
  await expect(main.getByRole('heading', { name: /Your review so far/ })).toBeVisible();
  await expect(main.getByText('Hunks seen', { exact: true })).toBeVisible();
  await expect(main.getByText('0 of 7', { exact: true })).toBeVisible();
  await expect(main.getByText('1 · 0 on GitHub, 1 local only')).toBeVisible();
});
