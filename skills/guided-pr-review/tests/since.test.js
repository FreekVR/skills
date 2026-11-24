'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js
// Copies app/utils next to a package.json that marks it as a module, as generated.test.js does.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

let review;
let since;
let navigation;
let panels;
let pageState;

test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-utils-'));
  const source = path.join(__dirname, '..', 'app', 'utils');
  for (const file of fs.readdirSync(source)) fs.copyFileSync(path.join(source, file), path.join(dir, file));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  globalThis.reactive = (value) => value;
  // setScope saves the reviewer state; the stub keeps the save off the network.
  globalThis.$fetch = async () => ({});
  review = await import(pathToFileURL(path.join(dir, 'review.js')));
  since = await import(pathToFileURL(path.join(dir, 'since.js')));
  navigation = await import(pathToFileURL(path.join(dir, 'navigation.js')));
  panels = await import(pathToFileURL(path.join(dir, 'panels.js')));
  pageState = (await import(pathToFileURL(path.join(dir, 'state.js')))).state;
  // Set after the imports, which only listen to window events when it exists. go() puts the view in the address bar.
  globalThis.window = { location: { pathname: '' } };
  globalThis.navigateTo = () => {};
  test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
});

const hunk = (id, file) => ({ id, file, newStart: 1 });
const data = (extra = {}) => ({
  pr: { owner: 'example-org', repo: 'sample-widget', number: 17, headSha: 'head2' },
  viewer: { login: 'me' },
  reviews: [
    { id: 1, author: 'me', state: 'APPROVED', commitId: 'old1', submittedAt: '2026-11-01T09:00:00Z' },
    { id: 2, author: 'me', state: 'COMMENTED', commitId: 'head1', submittedAt: '2026-11-02T09:00:00Z' },
    { id: 3, author: 'someone-else', state: 'APPROVED', commitId: 'other', submittedAt: '2026-11-03T09:00:00Z' },
  ],
  hunks: [hunk('h1', 'src/a.js'), hunk('h2', 'src/b.js'), hunk('h3', 'src/c.js')],
  flows: [{ id: 'f1', name: 'Flow', steps: [{ hunkId: 'h1', why: 'x' }, { hunkId: 'h2', why: 'y' }, { hunkId: 'h3', why: 'z' }] }],
  changesSince: { from: 'head1', to: 'head2', summary: '- Two files.', files: [{ path: 'src/b.js', summary: 'B changed.' }, { path: 'src/c.js', previousPath: 'c.js', summary: 'Moved.' }] },
  ...extra,
});
const load = (json, reviewer = {}) => {
  review.setReview(json);
  pageState.reviewer = { ...review.emptyReviewer(), ...reviewer };
  pageState.view = { kind: 'home' };
};

test('newestOwnReview takes the viewer\'s newest review in any state, not one by someone else', () => {
  load(data());
  assert.strictEqual(panels.newestOwnReview().id, 2);
});

test('the scope is on by default and keeps only the hunks in the changed files', () => {
  load(data());
  assert.strictEqual(since.scopeActive(), true);
  assert.deepStrictEqual(['h1', 'h2', 'h3'].filter(since.inScope), ['h2', 'h3']);
});

test('the scope all shows every hunk, and the file change still shows', () => {
  load(data(), { scope: 'all' });
  assert.strictEqual(since.scopeActive(), false);
  assert.deepStrictEqual(['h1', 'h2', 'h3'].filter(since.inScope), ['h1', 'h2', 'h3']);
  assert.strictEqual(since.fileChange('h3').previousPath, 'c.js');
  assert.strictEqual(since.fileChange('h1'), null);
});

test('without files there is no scope', () => {
  load(data({ changesSince: { from: 'head1', to: 'head2', summary: '- Changes.' } }));
  assert.strictEqual(since.scopeActive(), false);
  assert.strictEqual(since.inScope('h1'), true);
});

test('a list from before a newer own review gives no scope', () => {
  load(data({ changesSince: { ...data().changesSince, from: 'old1' } }));
  assert.strictEqual(since.scopeActive(), false);
  assert.strictEqual(since.fileChange('h2'), null);
});

test('a list for another head commit gives no scope', () => {
  load(data({ changesSince: { ...data().changesSince, to: 'head1b' } }));
  assert.strictEqual(since.scopeActive(), false);
});

test('setScope keeps the choice in the reviewer state', () => {
  load(data());
  since.setScope('all');
  assert.strictEqual(pageState.reviewer.scope, 'all');
  assert.strictEqual(since.scopeActive(), false);
});

test('stepping skips the hunks outside the scope, and the stops keep their index', () => {
  load(data());
  navigation.nextUnseen();
  assert.deepStrictEqual([pageState.view.line, pageState.view.index], ['f1', 1]);
  navigation.step(1);
  assert.deepStrictEqual([pageState.view.line, pageState.view.index], ['f1', 2]);
  navigation.step(-1);
  navigation.step(-1);
  assert.deepStrictEqual([pageState.view.line, pageState.view.index], ['f1', 1]);
});

test('opening a flow starts at its first unseen hunk in the scope', () => {
  load(data());
  navigation.openFlow('f1');
  assert.strictEqual(pageState.view.index, 1);
});

test('a flow with no hunk in the scope is not shown', () => {
  load(data({ flows: [...data().flows, { id: 'f2', name: 'Other', steps: [{ hunkId: 'h1', why: 'x' }] }] }));
  assert.deepStrictEqual(since.shownLines().map((line) => line.id), ['f1']);
  assert.deepStrictEqual(since.shownStops(review.lineById('f1')).map((stop) => stop.index), [1, 2]);
});
