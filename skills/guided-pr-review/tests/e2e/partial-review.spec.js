'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');
const { review: fixture } = require('./fixture.js');

// Vue reports an error in a render to the console, not as a page error.
const collectErrors = (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
};

// The agent writes review.json as soon as it has the PR and its hunks, and adds the rest as it goes.
const onlyPrAndHunks = (data) => {
  for (const key of Object.keys(data)) if (key !== 'pr' && key !== 'hunks') delete data[key];
};

test('a review.json with only the PR and its hunks opens Home with the preparing banner, and later flows show without a reload', async ({ page }) => {
  const errors = collectErrors(page);
  const review = await openReview(page, { mutate: onlyPrAndHunks });
  fs.writeFileSync(path.join(review.dir, 'preparing'), JSON.stringify({ step: 'finding the flows', since: new Date().toISOString() }));
  await expect(page.getByText('The agent is still preparing this review.')).toBeVisible();
  await expect(page.getByText('Now: finding the flows.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();

  await page.evaluate(() => { window.sameDocument = true; });
  const full = fixture();
  review.update((data) => Object.assign(data, { flows: full.flows, notInAnyFlow: full.notInAnyFlow, context: full.context, findings: full.findings, conventions: full.conventions }));
  await expect(page.getByRole('button', { name: /Show the forecast/ }).first()).toBeVisible();
  expect(await page.evaluate(() => window.sameDocument)).toBe(true);
  expect(errors).toEqual([]);
});

test('a review.json with an empty list of flows and no findings opens a hunk', async ({ page }) => {
  const errors = collectErrors(page);
  await openReview(page, { mutate: (data) => { onlyPrAndHunks(data); data.flows = []; } });
  await page.keyboard.press('j');
  await expect(page.getByRole('navigation', { name: /^Hunks in / })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [name, partial] of [['an empty object', {}], ['only a PR title', { pr: { title: 'Show the forecast' } }]]) {
  test(`a review.json with ${name} shows the preparing screen, and completing it shows the review without a reload`, async ({ page }) => {
    const errors = collectErrors(page);
    const review = await openReview(page);
    fs.writeFileSync(path.join(review.dir, 'preparing'), JSON.stringify({ step: 'reading the diff', since: new Date().toISOString() }));
    fs.writeFileSync(path.join(review.dir, 'review.json'), JSON.stringify(partial));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'The agent is preparing this review' })).toBeVisible();

    await page.evaluate(() => { window.sameDocument = true; });
    const full = fixture();
    review.update((data) => Object.assign(data, full));
    await expect(page.getByRole('heading', { name: 'The agent is preparing this review' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.sameDocument)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('a review.json that loses its PR after the page booted keeps the review on screen', async ({ page }) => {
  const errors = collectErrors(page);
  const review = await openReview(page);
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  fs.writeFileSync(path.join(review.dir, 'review.json'), JSON.stringify({}));
  await page.waitForTimeout(4000);
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
