'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js
// Copies app/utils next to a package.json that marks it as a module, as collapse.test.js does.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

let review;
let generated;
let pageState;
let panels;
let posting;

test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-utils-'));
  const source = path.join(__dirname, '..', 'app', 'utils');
  for (const file of fs.readdirSync(source)) fs.copyFileSync(path.join(source, file), path.join(dir, file));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  globalThis.reactive = (value) => value;
  // setGeneratedVerdict saves the reviewer state; the stub keeps the save off the network.
  globalThis.$fetch = async () => ({});
  review = await import(pathToFileURL(path.join(dir, 'review.js')));
  generated = await import(pathToFileURL(path.join(dir, 'generated.js')));
  panels = await import(pathToFileURL(path.join(dir, 'panels.js')));
  posting = await import(pathToFileURL(path.join(dir, 'posting.js')));
  pageState = (await import(pathToFileURL(path.join(dir, 'state.js')))).state;
  test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
});

const hunk = (id, file) => ({ id, file, newStart: 1 });
const data = (extra = {}) => ({
  hunks: [hunk('h1', 'src/a.js'), hunk('h2', 'pnpm-lock.yaml'), hunk('h3', 'src/gen.js')],
  flows: [{ id: 'f1', name: 'Flow', steps: [{ hunkId: 'h1', why: 'x' }, { hunkId: 'h3', why: 'y' }] }],
  generated: { files: [{ path: 'pnpm-lock.yaml', reason: 'name' }, { path: 'src/gen.js', reason: 'header' }], summary: '', sourceHunkIds: [] },
  ...extra,
});
const load = (json, reviewer = {}) => {
  review.setReview(json);
  pageState.reviewer = { ...review.emptyReviewer(), ...reviewer };
};

test('a generated hunk without its own verdict has the group verdict', () => {
  load(data(), { generatedVerdict: 'approved' });
  assert.strictEqual(review.verdictOf('h2'), 'approved');
  assert.strictEqual(review.verdictOf('h1'), undefined);
});

test('a shared hunk keeps its own verdict, and the group counts as the worst', () => {
  load(data(), { generatedVerdict: 'approved', hunkVerdicts: { h3: 'changes' } });
  assert.strictEqual(review.verdictOf('h3'), 'changes');
  assert.strictEqual(generated.groupVerdict(), 'approved');
  assert.strictEqual(generated.groupCountsAs(), 'changes');
});

test('the group counts as nothing until the reviewer gave a verdict', () => {
  load(data(), { hunkVerdicts: { h3: 'changes' } });
  assert.strictEqual(generated.groupCountsAs(), null);
  assert.strictEqual(review.verdictOf('h2'), null);
});

test('generatedFiles lists the hunk and the flow steps of each file', () => {
  load(data());
  const [lock, gen] = generated.generatedFiles();
  assert.strictEqual(lock.hunkId, 'h2');
  assert.deepStrictEqual(lock.shared, []);
  assert.strictEqual(gen.hunkId, 'h3');
  assert.deepStrictEqual(gen.shared.map(({ line, index }) => [line.id, index]), [['f1', 1]]);
});

test('generatedFilesInOrder lists files with findings, then shared files, then by path', () => {
  const json = data();
  json.hunks.push(hunk('h4', 'gen/z.js'), hunk('h5', 'gen/a.js'));
  json.generated.files.push({ path: 'gen/z.js', reason: 'header' }, { path: 'gen/a.js', reason: 'header' });
  json.findings = [{ id: 'x', hunkId: 'h4', severity: 'minor', body: '' }];
  load(json);
  assert.deepStrictEqual(generated.generatedFilesInOrder().map((file) => file.path), ['gen/z.js', 'src/gen.js', 'gen/a.js', 'pnpm-lock.yaml']);
});

test('countsAsLabel names what the group counts as', () => {
  load(data(), { generatedVerdict: 'approved', hunkVerdicts: { h3: 'changes' } });
  assert.strictEqual(generated.countsAsLabel(), 'Counts as request changes');
  load(data());
  assert.strictEqual(generated.countsAsLabel(), null);
});

test('reasonLabel shows the detail for a generator list', () => {
  assert.strictEqual(generated.reasonLabel({ reason: 'header' }), 'Header says generated');
  assert.strictEqual(generated.reasonLabel({ reason: 'generator-list', detail: 'listed in x' }), 'listed in x');
});

test('directory layout leaves generated hunks that are no flow step out of the files line', () => {
  const [line] = review.buildLines(data({ layout: 'directory' }));
  assert.deepStrictEqual(line.stops.map((stop) => stop.hunkId), ['h1', 'h3']);
});

test('without a generated key nothing changes', () => {
  const json = data({ layout: 'directory' });
  delete json.generated;
  load(json);
  assert.strictEqual(generated.hasGenerated(), false);
  assert.strictEqual(review.buildLines(json)[0].stops.length, 3);
  assert.strictEqual(review.verdictOf('h2'), undefined);
});

test('isGenerated is true for the hunks of the generated files only', () => {
  load(data());
  assert.deepStrictEqual(['h1', 'h2', 'h3'].map(generated.isGenerated), [false, true, true]);
});

test('reading the group verdict marks nothing seen', () => {
  load(data(), { generatedVerdict: 'approved' });
  pageState.seen = new Set();
  generated.groupVerdict();
  assert.deepStrictEqual(pageState.reviewer.seen, []);
  assert.strictEqual(pageState.seen.size, 0);
});

test('setGeneratedVerdict sets the verdict and marks every generated hunk seen in the group line', () => {
  load(data());
  pageState.seen = new Set();
  pageState.static = true;
  generated.setGeneratedVerdict('approved');
  assert.strictEqual(pageState.reviewer.generatedVerdict, 'approved');
  // The move to the next unseen hunk opens h1, so only the generated hunks are checked.
  assert.strictEqual(pageState.reviewer.seenIn.h2, '__generated');
  assert.strictEqual(pageState.reviewer.seenIn.h3, '__generated');
  assert.ok(pageState.seen.has('h2') && pageState.seen.has('h3'));
});

test('groupSeverities lists what stands on the generated hunks only', () => {
  load(data(), { remarks: [{ hunkId: 'h2', severity: 'major' }, { hunkId: 'h1', severity: 'nit' }] });
  assert.deepStrictEqual(generated.groupSeverities(), ['major']);
});

test('Submit review counts a group verdict on the generated hunks', () => {
  load(data(), { generatedVerdict: 'changes', hunkVerdicts: { h1: 'approved' } });
  const check = panels.hunkVerdictsCheck();
  assert.strictEqual(check.done, true);
  assert.strictEqual(check.approved, 1);
  assert.deepStrictEqual(check.changes.map((item) => item.id), ['h2', 'h3']);
});

test('a generated list without hunks in the diff is no group', () => {
  load(data({ generated: { files: [{ path: 'gone.lock', reason: 'name' }], summary: '', sourceHunkIds: [] } }), { generatedVerdict: 'approved' });
  assert.strictEqual(generated.hasGenerated(), false);
  assert.strictEqual(generated.groupCountsAs(), null);
});

test('the group counts as its own verdict when every generated hunk has a milder verdict of its own', () => {
  load(data(), { generatedVerdict: 'changes', hunkVerdicts: { h2: 'approved', h3: 'approved' } });
  assert.strictEqual(generated.groupCountsAs(), 'changes');
  assert.strictEqual(generated.countsAsLabel(), 'Counts as request changes');
});

test('the proposed verdict includes the group verdict when every hunk has its own verdict', () => {
  load(data(), { generatedVerdict: 'changes', hunkVerdicts: { h1: 'approved', h2: 'approved', h3: 'approved' } });
  assert.strictEqual(posting.proposedVerdict(), 'REQUEST_CHANGES');
  load(data(), { generatedVerdict: 'approved', hunkVerdicts: { h1: 'approved', h2: 'approved', h3: 'approved' } });
  assert.strictEqual(posting.proposedVerdict(), 'APPROVE');
});

test('a group verdict from before an update that removed the group no longer counts', () => {
  load(data({ generated: { files: [{ path: 'gone.lock', reason: 'name' }], summary: '', sourceHunkIds: [] } }), { generatedVerdict: 'changes', hunkVerdicts: { h1: 'approved', h2: 'approved', h3: 'approved' } });
  assert.strictEqual(generated.groupVerdict(), null);
  assert.strictEqual(posting.proposedVerdict(), 'APPROVE');
});

test('a PR of only generated hunks has no files line, with or without flows', () => {
  const only = { hunks: [hunk('h2', 'pnpm-lock.yaml')], generated: { files: [{ path: 'pnpm-lock.yaml', reason: 'name' }], summary: '', sourceHunkIds: [] } };
  assert.deepStrictEqual(review.buildLines(only), []);
  assert.deepStrictEqual(review.buildLines({ ...only, layout: 'directory' }), []);
});

test('the line about a hunk seen before names the group', () => {
  load(data(), { seenIn: { h2: '__generated', h1: 'f1' } });
  pageState.view = { kind: 'station', line: 'f1', index: 0 };
  assert.strictEqual(panels.seenBefore('h2'), 'You saw this hunk in Generated files already.');
  assert.strictEqual(panels.seenBefore('h1'), '');
  pageState.reviewer.seenIn.h1 = 'other';
  assert.strictEqual(panels.seenBefore('h1'), 'You saw this hunk in another flow already.');
});

test('the worst open finding on a generated hunk without a stop names Generated files', () => {
  load(data({ findings: [{ id: 'x', hunkId: 'h2', severity: 'minor', title: 'Lock drift', body: '' }] }));
  const finding = panels.homeChecks().attention.find((item) => item.id === 'findings');
  assert.strictEqual(finding.line, 'Worst: Lock drift (Generated files, minor)');
});
