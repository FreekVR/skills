'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, expectPoll } = require('./helpers.js');

// Each comment, finding and remark folds away with a button; reviewer.json keeps the choice.
const fold = (note) => note.locator('[data-fold-button]');
const set = (id, fields) => (data) => { Object.assign([...data.reviewComments, ...data.ownRemarks, ...data.findings].find((item) => item.id === id), fields); };

test('a comment collapses and expands with its button, and a reload keeps the choice', async ({ page }) => {
  const review = await openReview(page);
  await openHunk(page, 'Show the forecast', /^A1 /);
  const note = page.locator('#note-c1');
  const body = note.getByText('Good idea, later.');
  await expect(body).toBeVisible();
  await fold(note).click();
  await expect(fold(note)).toHaveAttribute('aria-expanded', 'false');
  await expect(body).toBeHidden();
  // The line above the body stays in view.
  await expect(note.getByRole('link', { name: '@other-reviewer' })).toBeVisible();
  await expectPoll(() => review.reviewer().collapsed?.c1 === true);
  await page.reload();
  await expect(fold(page.locator('#note-c1'))).toHaveAttribute('aria-expanded', 'false');
  await fold(page.locator('#note-c1')).click();
  await expect(page.locator('#note-c1').getByText('Good idea, later.')).toBeVisible();
  await expectPoll(() => review.reviewer().collapsed?.c1 === false);
});

test('a comment its author resolved starts collapsed and shows that it is resolved', async ({ page }) => {
  await openReview(page, { mutate: set('c1', { resolved: true, resolvedBy: 'other-reviewer', fix: { verdict: 'fixed', note: 'Line 11 reads the setting.' } }) });
  await openHunk(page, 'Show the forecast', /^A1 /);
  const note = page.locator('#note-c1');
  await expect(fold(note)).toHaveAttribute('aria-expanded', 'false');
  await expect(note.getByText('Resolved by @other-reviewer')).toBeVisible();
  await expect(note.getByText('Good idea, later.')).toBeHidden();
});

test('a comment its author resolved stays open while the AI calls it not fixed', async ({ page }) => {
  await openReview(page, { mutate: set('c1', { resolved: true, resolvedBy: 'other-reviewer' }) });
  await openHunk(page, 'Show the forecast', /^A1 /);
  await expect(fold(page.locator('#note-c1'))).toHaveAttribute('aria-expanded', 'true');
});

test('choosing Resolve on your comment collapses it at once', async ({ page }) => {
  await openReview(page, { mutate: set('gh-1', { fix: { verdict: 'fixed', note: 'Line 3 changed.' } }), reviewer: { collapsed: { 'gh-1': false } } });
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  const note = page.locator('#note-gh-1');
  await expect(fold(note)).toHaveAttribute('aria-expanded', 'true');
  await note.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(fold(note)).toHaveAttribute('aria-expanded', 'false');
});

test('dismissing a finding collapses it at once', async ({ page }) => {
  const review = await openReview(page);
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText('Dismissed · not in your review')).toBeVisible();
  await expect(page.getByText('The TTL is 60 seconds, not one hour.')).toBeHidden();
  await expectPoll(() => review.reviewer().collapsed?.f1 === true);
});

test('a collapsed dismissed finding says it is not in your review', async ({ page }) => {
  await openReview(page, { reviewer: { decisions: { f1: 'dismissed' }, collapsed: { f1: true } } });
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  await expect(page.getByText('Dismissed · not in your review')).toBeVisible();
  await expect(page.getByText('The TTL is 60 seconds, not one hour.')).toBeHidden();
});

test('notes on the same line stand apart', async ({ page }) => {
  await openReview(page, { mutate: set('f1', { line: 3 }) });
  await openHunk(page, 'Store the forecast', /^B1 src\/cache\.ts/);
  const second = page.locator('.station-diff tr.note + tr.note td').first();
  await expect(second).toHaveCSS('border-top-width', '6px');
});
