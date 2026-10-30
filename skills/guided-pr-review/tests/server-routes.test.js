'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js
// Needs the built server in .output (npm run build).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-routes-'));
const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-clone-'));
const hunks = [{ id: 'h1', file: 'src/cache.ts', status: 'modified', lines: [] }, { id: 'h2', file: 'src/old.ts', status: 'removed', lines: [] }];
let base;

// The review page sends this header with every change; another web page cannot.
const send = (url, method, body, headers = { 'X-Guided-Review': '1' }) => fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body });

function review(name, pr) {
  const dir = path.join(home, 'guided-pr-review', 'acme', 'shop', name);
  fs.mkdirSync(path.join(dir, 'files', 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify({ pr, hunks }));
  return dir;
}

const small = review('7', { number: 7 });
review('8', { number: 8, localPath: clone });
fs.writeFileSync(path.join(small, 'files', 'src', 'cache.ts'), 'export const cache = 1;\n');
fs.mkdirSync(path.join(clone, 'src'));
fs.writeFileSync(path.join(clone, 'src', 'cache.ts'), 'from the clone\n');

test.before(() => {
  const output = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-server.js')], { env: { ...process.env, XDG_STATE_HOME: home } });
  base = `${String(output).match(/READY (\S+)/)[1]}api/reviews/acme/shop`;
});

test.after(() => {
  process.kill(JSON.parse(fs.readFileSync(path.join(home, 'guided-pr-review', 'server.json'), 'utf8')).pid);
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(clone, { recursive: true, force: true });
});

test('serves review.json and an empty reviewer state before the first save', async () => {
  assert.deepStrictEqual((await (await fetch(`${base}/7/review`)).json()).pr, { number: 7 });
  assert.deepStrictEqual(await (await fetch(`${base}/7/reviewer`)).json(), {});
});

test('answers 404 for a review that does not exist or a path that walks out of the state directory', async () => {
  for (const asked of ['9/review', '..%2F..%2F7/review']) assert.strictEqual((await fetch(`${base}/${asked}`)).status, 404);
  assert.strictEqual((await fetch(`${base.replace('/acme/', '/..%2F/')}/7/review`)).status, 404);
});

test('stores the reviewer state the page sends, and keeps it when the new state is not JSON', async () => {
  const state = { seen: ['abc'] };
  assert.strictEqual((await send(`${base}/7/reviewer`, 'PUT', JSON.stringify(state))).status, 204);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(small, 'reviewer.json'), 'utf8')), state);
  assert.strictEqual((await send(`${base}/7/reviewer`, 'PUT', '{broken')).status, 400);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(small, 'reviewer.json'), 'utf8')), state);
});

test('appends each event to events.jsonl with an id and a time', async () => {
  const response = await send(`${base}/7/events`, 'POST', JSON.stringify({ type: 'ask', hunkId: 'h1', question: 'Why seconds?' }));
  const { id } = await response.json();
  const stored = fs.readFileSync(path.join(small, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).pop();
  assert.strictEqual(stored.id, id);
  assert.strictEqual(stored.question, 'Why seconds?');
  assert.ok(stored.at);
});

test('serves a changed file from the saved files of a small PR and from the local clone of a big PR', async () => {
  assert.strictEqual(await (await fetch(`${base}/7/file?path=src%2Fcache.ts`)).text(), 'export const cache = 1;\n');
  assert.strictEqual(await (await fetch(`${base}/8/file?path=src%2Fcache.ts`)).text(), 'from the clone\n');
});

test('serves only files that the pull request changes and that still exist', async () => {
  for (const asked of ['..%2Freview.json', 'src%2Fold.ts', 'src%2Fother.ts']) {
    assert.strictEqual((await fetch(`${base}/7/file?path=${asked}`)).status, 404);
  }
});

test('opens a folder only for a changed file of a local clone', async () => {
  assert.strictEqual((await send(`${base}/7/open`, 'POST', JSON.stringify({ path: 'src/cache.ts' }))).status, 404);
});

test('accepts a change only from the review page, on a local host name, and not too large', async () => {
  const before = fs.existsSync(path.join(small, 'events.jsonl')) ? fs.readFileSync(path.join(small, 'events.jsonl'), 'utf8') : '';
  assert.strictEqual((await send(`${base}/7/events`, 'POST', '{"type":"ask"}', {})).status, 403);
  assert.strictEqual((await send(`${base}/8/open`, 'POST', JSON.stringify({ path: 'src/cache.ts' }), {})).status, 403);
  assert.strictEqual((await send(`${base}/7/events`, 'POST', JSON.stringify({ big: 'x'.repeat(6 * 1024 * 1024) }))).status, 413);
  const rebound = await new Promise((resolve) => require('http').get(`${base}/7/review`, { headers: { Host: 'attacker.example' } }, resolve));
  assert.strictEqual(rebound.statusCode, 403);
  assert.strictEqual(fs.existsSync(path.join(small, 'events.jsonl')) ? fs.readFileSync(path.join(small, 'events.jsonl'), 'utf8') : '', before);
});
