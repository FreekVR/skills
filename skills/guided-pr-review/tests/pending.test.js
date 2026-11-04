'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js
// The page code in app/utils is an ES module that expects Nuxt's auto-imported `reactive`. The test copies it
// next to a package.json that marks it as a module, so Node loads it as it is.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

let posting;
let pageState;

test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-utils-'));
  const source = path.join(__dirname, '..', 'app', 'utils');
  for (const file of fs.readdirSync(source)) fs.copyFileSync(path.join(source, file), path.join(dir, file));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  globalThis.reactive = (value) => value;
  posting = await import(pathToFileURL(path.join(dir, 'posting.js')));
  pageState = (await import(pathToFileURL(path.join(dir, 'state.js')))).state;
  test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
});

// Sets the page state: the events the reviewer sent, and what the agent wrote back.
function setup({ sent, review = {}, stackStatus = [], agent = null }) {
  pageState.reviewer = { sent };
  pageState.review = { answers: [], posts: [], refreshes: [], ...review };
  pageState.hunks = new Map((review.hunks || []).map((hunk) => [hunk.id, hunk]));
  pageState.stackStatus = stackStatus;
  pageState.agent = agent;
  return () => posting.waitingRequests().map((request) => request.id);
}

test('an ask and a summarize wait until an answer names their event', () => {
  const waiting = setup({ sent: [{ id: 'e1', type: 'ask', hunkId: 'h1' }, { id: 'e2', type: 'summarize' }] });
  assert.deepStrictEqual(waiting(), ['e1', 'e2']);
  pageState.review.answers.push({ eventId: 'e1' });
  assert.deepStrictEqual(waiting(), ['e2']);
  pageState.review.answers.push({ eventId: 'e2' });
  assert.deepStrictEqual(waiting(), []);
});

test('an explain waits while its hunk has no explanationMore', () => {
  const waiting = setup({ sent: [{ id: 'e1', type: 'explain', hunkId: 'h1' }], review: { hunks: [{ id: 'h1' }] } });
  assert.deepStrictEqual(waiting(), ['e1']);
  pageState.hunks.get('h1').explanationMore = 'More about this hunk.';
  assert.deepStrictEqual(waiting(), []);
});

test('an explain for a hunk that is not in the review does not wait', () => {
  const waiting = setup({ sent: [{ id: 'e1', type: 'explain', hunkId: 'gone' }], review: { hunks: [{ id: 'h1' }] } });
  assert.deepStrictEqual(waiting(), []);
});

test('a post waits until posts has an entry for its event', () => {
  const waiting = setup({ sent: [{ id: 'e1', type: 'post', kind: 'draft' }] });
  assert.deepStrictEqual(waiting(), ['e1']);
  pageState.review.posts.push({ eventId: 'other', status: 'posted' });
  assert.deepStrictEqual(waiting(), ['e1']);
  pageState.review.posts.push({ eventId: 'e1', status: 'posted' });
  assert.deepStrictEqual(waiting(), []);
});

test('a refresh still waits when refreshes has an entry for another event', () => {
  const waiting = setup({ sent: [{ id: 'e1', type: 'refresh' }], review: { pr: { headSha: 'a' }, remote: { headSha: 'b' }, refreshes: [{ eventId: 'other' }] } });
  assert.deepStrictEqual(waiting(), ['e1']);
  pageState.review.refreshes.push({ eventId: 'e1' });
  assert.deepStrictEqual(waiting(), []);
});

test('only the last refresh waits, and only while GitHub has newer commits and no result', () => {
  const waiting = setup({ sent: [{ id: 'e1', type: 'refresh' }, { id: 'e2', type: 'refresh' }], review: { pr: { headSha: 'a' }, remote: { headSha: 'a' } } });
  assert.deepStrictEqual(waiting(), []);
  pageState.review.remote.headSha = 'b';
  assert.deepStrictEqual(waiting(), ['e2']);
  pageState.review.refreshes.push({ eventId: 'e2' });
  assert.deepStrictEqual(waiting(), []);
});

test('a start-review waits while the stack status has no review for that PR', () => {
  const waiting = setup({ sent: [{ id: 'e1', type: 'start-review', number: 16 }], stackStatus: [{ number: 16, hasReview: false }] });
  assert.deepStrictEqual(waiting(), ['e1']);
  pageState.stackStatus = [{ number: 16, hasReview: true }];
  assert.deepStrictEqual(waiting(), []);
});

test('a check and a finish never wait', () => {
  const waiting = setup({ sent: [{ id: 'e1', type: 'check' }, { id: 'e2', type: 'finish' }] });
  assert.deepStrictEqual(waiting(), []);
});

test('the agent counts as working until the page has an answer, then follows the answer', () => {
  setup({ sent: [] });
  assert.strictEqual(posting.agentState(), 'working');
  pageState.agent = { connected: false, paused: false, waiting: null };
  assert.strictEqual(posting.agentState(), 'none');
  pageState.agent = { connected: true, paused: true, waiting: null };
  assert.strictEqual(posting.agentState(), 'paused');
  pageState.agent = { connected: true, paused: false, waiting: null };
  assert.strictEqual(posting.agentState(), 'working');
});
