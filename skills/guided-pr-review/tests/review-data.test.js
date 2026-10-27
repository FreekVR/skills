'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { reviewDir, parseDiff, mergeHunks, checkFlows } = require('../scripts/review-data.js');

const DIFF = `diff --git a/src/cache.ts b/src/cache.ts
index 1111111..2222222 100644
--- a/src/cache.ts
+++ b/src/cache.ts
@@ -1,3 +1,3 @@ export class Cache {
-const TTL = 60;
+const TTL = 60 * 1000;
 const MAX = 10;
@@ -20 +20,2 @@ function evict() {
+  log('evicted');
   return;
diff --git a/docs/logo.png b/docs/logo.png
new file mode 100644
index 0000000..3333333
Binary files /dev/null and b/docs/logo.png differ
diff --git a/src/old.ts b/src/new.ts
similarity index 100%
rename from src/old.ts
rename to src/new.ts
`;

test('parseDiff returns one entry per hunk with line ranges', () => {
  const hunks = parseDiff(DIFF);
  const cache = hunks.filter((hunk) => hunk.file === 'src/cache.ts');
  assert.strictEqual(cache.length, 2);
  assert.deepStrictEqual(
    [cache[0].oldStart, cache[0].oldLines, cache[0].newStart, cache[0].newLines],
    [1, 3, 1, 3],
  );
  assert.deepStrictEqual([cache[1].oldLines, cache[1].newLines], [1, 2]);
  assert.strictEqual(cache[0].context, 'export class Cache {');
  assert.deepStrictEqual(cache[1].lines, ["+  log('evicted');", '   return;']);
});

test('parseDiff joins the hunks of a file passed as whole into one hunk, with a header line at each gap', () => {
  const hunks = parseDiff(DIFF, new Set(['src/cache.ts']));
  const cache = hunks.filter((hunk) => hunk.file === 'src/cache.ts');
  assert.strictEqual(cache.length, 1);
  assert.deepStrictEqual(
    [cache[0].oldStart, cache[0].oldLines, cache[0].newStart, cache[0].newLines],
    [1, 20, 1, 21],
  );
  assert.deepStrictEqual(cache[0].lines, [
    '-const TTL = 60;', '+const TTL = 60 * 1000;', ' const MAX = 10;',
    '@@ -20 +20,2 @@ function evict() {', "+  log('evicted');", '   return;',
  ]);
  assert.strictEqual(hunks.filter((hunk) => hunk.file !== 'src/cache.ts').length, 2);
});

test('parseDiff keeps changes without hunks: binary files and pure renames', () => {
  const hunks = parseDiff(DIFF);
  const logo = hunks.find((hunk) => hunk.file === 'docs/logo.png');
  const rename = hunks.find((hunk) => hunk.file === 'src/new.ts');
  assert.strictEqual(logo.status, 'added');
  assert.strictEqual(logo.binary, true);
  assert.strictEqual(rename.status, 'renamed');
  assert.strictEqual(rename.oldFile, 'src/old.ts');
});

test('hunk IDs survive a line shift but change with the content', () => {
  const original = parseDiff(DIFF)[0].id;
  const shifted = parseDiff(DIFF.replace('@@ -1,3 +1,3 @@', '@@ -5,3 +5,3 @@'))[0].id;
  const edited = parseDiff(DIFF.replace('60 * 1000', '60_000'))[0].id;
  assert.strictEqual(shifted, original);
  assert.notStrictEqual(edited, original);
});

test('identical hunks in one file get distinct IDs', () => {
  const hunk = '@@ -1 +1 @@\n-a\n+b\n';
  const diff = `diff --git a/x b/x\n--- a/x\n+++ b/x\n${hunk}${hunk.replace('-1 +1', '-9 +9')}`;
  const [first, second] = parseDiff(diff);
  assert.notStrictEqual(first.id, second.id);
});

test('checkFlows reports hunks that are not placed and IDs that are not hunks', () => {
  const review = {
    hunks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    flows: [{ id: 'cache', steps: [{ hunkId: 'a', why: 'Start here.' }, { hunkId: 'z', why: '' }] }],
    notInAnyFlow: ['b'],
  };
  assert.deepStrictEqual(checkFlows(review), { missing: ['c'], unknown: ['z'], withoutWhy: ['cache:z'] });
});

test('checkFlows passes when every hunk is placed, also in several flows', () => {
  const review = {
    hunks: [{ id: 'a' }, { id: 'b' }],
    flows: [
      { id: 'read', steps: [{ hunkId: 'a', why: 'Data enters.' }, { hunkId: 'b', why: 'Data is shown.' }] },
      { id: 'write', steps: [{ hunkId: 'a', why: 'Data is saved.' }] },
    ],
  };
  assert.deepStrictEqual(checkFlows(review), { missing: [], unknown: [], withoutWhy: [] });
});

test('reviewDir uses XDG_STATE_HOME with one folder per repository and PR', (t) => {
  const previous = process.env.XDG_STATE_HOME;
  t.after(() => { if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous; });
  process.env.XDG_STATE_HOME = '/state';
  assert.strictEqual(reviewDir('acme/widget', 17), path.join('/state', 'guided-pr-review', 'acme', 'widget', '17'));
});

test('reviewDir rejects input that is not <owner>/<repo> and a PR number', () => {
  assert.throws(() => reviewDir('widget', 17));
  assert.throws(() => reviewDir('acme/widget', 'abc'));
});

test('mergeHunks keeps explanations of unchanged hunks only', () => {
  const previous = [{ id: 'a', explanation: 'old a', explanationMore: 'more a' }, { id: 'gone', explanation: 'x' }];
  const merged = mergeHunks([{ id: 'a', lines: [] }, { id: 'b', lines: [] }], previous);
  assert.deepStrictEqual(merged, [
    { id: 'a', lines: [], explanation: 'old a', explanationMore: 'more a' },
    { id: 'b', lines: [] },
  ]);
});
