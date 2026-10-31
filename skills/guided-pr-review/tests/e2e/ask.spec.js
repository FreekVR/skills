'use strict';
const { test, expect } = require('@playwright/test');
const { openReview, openHunk, eventOf, expectPoll } = require('./helpers.js');
const { H } = require('./fixture.js');


test('asks a question, shows the answer and turns it into a remark', async ({ page }) => {
  const review = await openReview(page);
  await openHunk(page, 'Show the forecast', /^A1 /);

  await page.getByRole('button', { name: 'Ask the agent about this hunk' }).click();
  await page.getByLabel('Question about this hunk').fill('Why three days?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const asked = await eventOf(review, 'ask');
  expect(asked).toMatchObject({ hunkId: H.client, question: 'Why three days?' });

  review.update((data) => { data.answers.push({ eventId: asked.id, hunkId: H.client, question: 'Why three days?', answer: 'The ticket asks for three days.' }); });
  await expect(page.getByText('The ticket asks for three days.')).toBeVisible();

  await page.getByRole('button', { name: 'Turn into a remark' }).click();
  await expect(page.getByLabel('Remark text')).toHaveValue('The ticket asks for three days.');
  await page.getByRole('button', { name: 'Add remark' }).click();
  await expectPoll(() => review.remark('The ticket asks for three days.'));
  expect(review.remark('The ticket asks for three days.')).toMatchObject({ hunkId: H.client, aiSuggested: true });
});
