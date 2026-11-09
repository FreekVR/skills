'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js
// Copies app/utils next to a package.json that marks it as a module, as pending.test.js does.

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

const collapsed = (comment, { threadCalls = {}, choice } = {}) => {
  pageState.review = { viewer: { login: 'me' } };
  pageState.reviewer = { threadCalls, collapsed: choice === undefined ? {} : { [comment.id]: choice } };
  return posting.isCollapsed(comment.id, comment);
};

test('a comment its author resolved starts collapsed', () => {
  assert.strictEqual(collapsed({ id: 'c', author: 'ann', resolved: true, resolvedBy: 'ann' }), true);
});

test('your own comment, which has no author, starts collapsed when you resolved it', () => {
  assert.strictEqual(collapsed({ id: 'c', resolved: true, resolvedBy: 'me' }), true);
  assert.strictEqual(collapsed({ id: 'c', resolved: true, resolvedBy: 'ann' }), false);
});

test('a comment someone else resolved starts open', () => {
  assert.strictEqual(collapsed({ id: 'c', author: 'ann', resolved: true, resolvedBy: 'bob' }), false);
});

test('a comment the AI calls not fixed or is unsure about starts open, also when its author resolved it', () => {
  for (const verdict of ['not-fixed', 'unclear']) {
    assert.strictEqual(collapsed({ id: 'c', author: 'ann', resolved: true, resolvedBy: 'ann', fix: { verdict } }), false);
    assert.strictEqual(collapsed({ id: 'c', threadId: 'T', resolved: false, fix: { verdict } }, { threadCalls: { T: 'resolve' } }), false);
  }
  assert.strictEqual(collapsed({ id: 'c', author: 'ann', resolved: true, resolvedBy: 'ann', fix: { verdict: 'fixed' } }), true);
});

test('an open comment the reviewer chose to resolve collapses, one left open does not', () => {
  assert.strictEqual(collapsed({ id: 'c', threadId: 'T', resolved: false }, { threadCalls: { T: 'resolve' } }), true);
  assert.strictEqual(collapsed({ id: 'c', threadId: 'T', resolved: false }, { threadCalls: { T: 'open' } }), false);
});

test("the reviewer's own choice beats the default", () => {
  assert.strictEqual(collapsed({ id: 'c', author: 'ann', resolved: true, resolvedBy: 'ann' }, { choice: false }), false);
  assert.strictEqual(collapsed({ id: 'c', author: 'ann', resolved: false }, { choice: true }), true);
});
