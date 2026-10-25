'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createHandler } = require('../scripts/serve.js');

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-'));
  fs.writeFileSync(path.join(dir, 'review.json'), '{"pr":{"number":1}}');
  const logged = [];
  const server = http.createServer(createHandler(dir, (line) => logged.push(line)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { dir, logged, base, close: () => server.close() };
}

test('serves review.json and an empty reviewer state before the first save', async (t) => {
  const server = await startServer();
  t.after(server.close);
  assert.deepStrictEqual(await (await fetch(`${server.base}/review.json`)).json(), { pr: { number: 1 } });
  assert.deepStrictEqual(await (await fetch(`${server.base}/reviewer.json`)).json(), {});
});

test('stores the reviewer state the artifact sends', async (t) => {
  const server = await startServer();
  t.after(server.close);
  const state = { seen: ['abc'] };
  const put = await fetch(`${server.base}/reviewer.json`, { method: 'PUT', body: JSON.stringify(state) });
  assert.strictEqual(put.status, 204);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(server.dir, 'reviewer.json'), 'utf8')), state);
});

test('rejects reviewer state that is not JSON and keeps the old file', async (t) => {
  const server = await startServer();
  t.after(server.close);
  await fetch(`${server.base}/reviewer.json`, { method: 'PUT', body: '{"seen":[]}' });
  const put = await fetch(`${server.base}/reviewer.json`, { method: 'PUT', body: '{broken' });
  assert.strictEqual(put.status, 400);
  assert.strictEqual(fs.readFileSync(path.join(server.dir, 'reviewer.json'), 'utf8'), '{"seen":[]}');
});

test('appends each event to events.jsonl and prints it for the agent', async (t) => {
  const server = await startServer();
  t.after(server.close);
  const response = await fetch(`${server.base}/events`, {
    method: 'POST',
    body: JSON.stringify({ type: 'ask', hunkId: 'abc', question: 'Why seconds?' }),
  });
  const { id } = await response.json();
  const stored = JSON.parse(fs.readFileSync(path.join(server.dir, 'events.jsonl'), 'utf8'));
  assert.strictEqual(stored.id, id);
  assert.strictEqual(stored.question, 'Why seconds?');
  assert.deepStrictEqual(server.logged, [`EVENT ${JSON.stringify(stored)}`]);
});

function writeReview(server, pr) {
  const hunks = [{ id: 'h1', file: 'src/cache.ts', status: 'modified', lines: [] }, { id: 'h2', file: 'src/old.ts', status: 'removed', lines: [] }];
  fs.writeFileSync(path.join(server.dir, 'review.json'), JSON.stringify({ pr, hunks }));
}

test('serves a changed file from the saved files of a small PR', async (t) => {
  const server = await startServer();
  t.after(server.close);
  writeReview(server, { number: 1 });
  fs.mkdirSync(path.join(server.dir, 'files', 'src'), { recursive: true });
  fs.writeFileSync(path.join(server.dir, 'files', 'src', 'cache.ts'), 'export const cache = 1;\n');
  const response = await fetch(`${server.base}/file?path=src%2Fcache.ts`);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(await response.text(), 'export const cache = 1;\n');
});

test('serves a changed file from the local clone of a big PR', async (t) => {
  const server = await startServer();
  t.after(server.close);
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-clone-'));
  fs.mkdirSync(path.join(clone, 'src'));
  fs.writeFileSync(path.join(clone, 'src', 'cache.ts'), 'from the clone\n');
  writeReview(server, { number: 1, localPath: clone });
  assert.strictEqual(await (await fetch(`${server.base}/file?path=src%2Fcache.ts`)).text(), 'from the clone\n');
});

test('serves only files that the pull request changes and that still exist', async (t) => {
  const server = await startServer();
  t.after(server.close);
  writeReview(server, { number: 1 });
  for (const asked of ['..%2Freview.json', 'src%2Fold.ts', 'src%2Fother.ts']) {
    assert.strictEqual((await fetch(`${server.base}/file?path=${asked}`)).status, 404);
  }
});

test('opens a folder only for a changed file of a local clone, and only from the review page', async (t) => {
  const server = await startServer();
  t.after(server.close);
  writeReview(server, { number: 1 });
  const open = (headers, body) => fetch(`${server.base}/open`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.strictEqual((await open({}, { path: 'src/cache.ts' })).status, 403);
  assert.strictEqual((await open({ 'X-Guided-Review': '1' }, { path: 'src/cache.ts' })).status, 404);
});
