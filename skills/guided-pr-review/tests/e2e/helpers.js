'use strict';
// Starts the review server on a copy of the fixture, so each test owns its review directory.
// REVIEW_TARGET picks the server: "legacy" (scripts/serve.js) now, "nuxt" after the migration.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { expect } = require('@playwright/test');
const { review: fixture } = require('./fixture.js');

const ROOT = path.join(__dirname, '..', '..');

async function startServer(dir, stateHome) {
  if ((process.env.REVIEW_TARGET || 'legacy') !== 'legacy') throw new Error(`Unknown REVIEW_TARGET ${process.env.REVIEW_TARGET}`);
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.js'), dir], { env: { ...process.env, XDG_STATE_HOME: stateHome } });
  const url = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      const ready = String(chunk).match(/READY (\S+)/);
      if (ready) resolve(ready[1]);
    });
    child.on('exit', (code) => reject(new Error(`serve.js exited with ${code}`)));
  });
  return { url, stop: () => child.kill() };
}

// mutate changes the fixture before the page opens; reviewer is the saved reviewer state, if any.
async function openReview(page, { mutate, reviewer, others = [] } = {}) {
  const stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-e2e-'));
  const write = (data) => {
    const dir = path.join(stateHome, 'guided-pr-review', data.pr.owner, data.pr.repo, String(data.pr.number));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(data));
    return dir;
  };
  const data = fixture();
  if (mutate) mutate(data);
  const dir = write(data);
  if (reviewer) fs.writeFileSync(path.join(dir, 'reviewer.json'), JSON.stringify(reviewer));
  for (const other of others) write(other);
  const server = await startServer(dir, stateHome);
  page.on('close', () => {
    server.stop();
    fs.rmSync(stateHome, { recursive: true, force: true });
  });
  await page.goto(server.url);
  await page.getByRole('main').waitFor();

  const file = (name) => path.join(dir, name);
  const review = {
    dir,
    stateHome,
    url: server.url,
    stop: server.stop,
    events: () => (fs.existsSync(file('events.jsonl')) ? fs.readFileSync(file('events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []),
    // The page saves reviewer.json a moment after the first change, so until then it is empty.
    reviewer: () => (fs.existsSync(file('reviewer.json')) ? JSON.parse(fs.readFileSync(file('reviewer.json'), 'utf8')) : {}),
    // Plays the agent: changes review.json the way the agent would after an event.
    update: (change) => {
      const current = JSON.parse(fs.readFileSync(file('review.json'), 'utf8'));
      change(current);
      // Through a temporary file, so the page never loads a half-written review.json.
      fs.writeFileSync(file('review.json.tmp'), JSON.stringify(current));
      fs.renameSync(file('review.json.tmp'), file('review.json'));
    },
    write,
    remark: (body) => (review.reviewer().remarks || []).find((remark) => remark.body === body),
    // Waits until the saved reviewer state passes the check.
    saved: (check) => expectPoll(() => check(review.reviewer())),
  };
  return review;
}

// Waits until the page sent an event of this type, and returns the last one.
async function eventOf(review, type) {
  let found;
  await expectPoll(() => (found = review.events().filter((event) => event.type === type).pop()));
  return found;
}

// Returns the value the check found, so a caller can use it.
async function expectPoll(check) {
  await expect.poll(check).toBeTruthy();
  return check();
}

async function openHunk(page, flow, stop) {
  await page.getByRole('button', { name: flow }).first().click();
  await page.getByRole('navigation', { name: /^Hunks in / }).getByRole('button', { name: stop }).click();
}

module.exports = { openReview, openHunk, startServer, eventOf, expectPoll };
