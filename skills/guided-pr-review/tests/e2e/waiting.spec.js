'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');

const question = 'Which review angles should I run for #16?';
const overlay = (page) => page.getByRole('dialog', { name: 'The agent is waiting for your answer in the chat' });
const wait = (review, since) => fs.writeFileSync(path.join(review.dir, 'waiting'), JSON.stringify({ question, since }));

test('shows an overlay with the question while the agent waits for an answer in the chat', async ({ page }) => {
  const review = await openReview(page);
  await expect(overlay(page)).toBeHidden();
  wait(review, '2026-11-04T10:00:00Z');
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toContainText(question);
  await expect(overlay(page)).toContainText('Answer it in the chat where the agent runs.');
  fs.rmSync(path.join(review.dir, 'waiting'));
  await expect(overlay(page)).toBeHidden();
});

test('the reviewer can close the overlay, and a new question opens it again', async ({ page }) => {
  const review = await openReview(page);
  wait(review, '2026-11-04T10:00:00Z');
  await expect(overlay(page)).toBeVisible();
  await overlay(page).getByRole('button', { name: 'Read the review meanwhile' }).click();
  await expect(overlay(page)).toBeHidden();
  // The same question stays closed through the next polls.
  await page.waitForResponse((response) => response.url().endsWith('/waiting'));
  await expect(overlay(page)).toBeHidden();
  wait(review, '2026-11-04T10:05:00Z');
  await expect(overlay(page)).toBeVisible();
});

test('the page works when the waiting request fails', async ({ page }) => {
  await page.route('**/waiting', (route) => route.fulfill({ status: 500 }));
  const failed = page.waitForResponse((response) => response.url().endsWith('/waiting'));
  await openReview(page);
  await failed;
  await expect(page.getByRole('main')).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  // A second failing poll shows no notice either.
  await page.waitForResponse((response) => response.url().endsWith('/waiting'));
  await expect(page.getByText('Cannot reach the agent')).toBeHidden();
});
