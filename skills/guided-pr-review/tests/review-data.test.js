'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseDiff, mergeHunks, checkFlows } = require('../scripts/review-data.js');
const { execFileSync, spawnSync } = require('child_process');
const { reviewDir, writeSession, listReviews, watchEvents, watchReview, stackStatus, setWaiting, readWaiting } = require('../scripts/reviews.js');

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
  assert.deepStrictEqual(checkFlows(review), { missing: ['c'], unknown: ['z'], withoutWhy: ['cache:z'], stack: [] });
});

test('checkFlows passes when every hunk is placed, also in several flows', () => {
  const review = {
    hunks: [{ id: 'a' }, { id: 'b' }],
    flows: [
      { id: 'read', steps: [{ hunkId: 'a', why: 'Data enters.' }, { hunkId: 'b', why: 'Data is shown.' }] },
      { id: 'write', steps: [{ hunkId: 'a', why: 'Data is saved.' }] },
    ],
  };
  assert.deepStrictEqual(checkFlows(review), { missing: [], unknown: [], withoutWhy: [], stack: [] });
});

test('check rejects a stack field that a single PR should not have', () => {
  const pr = (number) => ({ number, title: `PR ${number}`, url: '', state: 'open', draft: false, head: 'h', base: 'b' });
  const base = { pr: { number: 15 }, hunks: [], flows: [] };
  const one = checkFlows({ ...base, stack: { prs: [pr(15)] } }).stack;
  const empty = checkFlows({ ...base, stack: { prs: [pr(15), pr(16)], coverage: [], outsideTickets: [] } }).stack;
  const foreign = checkFlows({ ...base, stack: { prs: [pr(16), pr(17)] } }).stack;
  assert.ok(one.length === 1 && one[0].includes('fewer than 2'));
  assert.strictEqual(empty.length, 2);
  assert.ok(foreign.length === 1 && foreign[0].includes('15'));
  assert.deepStrictEqual(checkFlows({ ...base, stack: { prs: [pr(15), pr(16)] } }).stack, []);
  assert.deepStrictEqual(checkFlows(base).stack, []);
  assert.deepStrictEqual(checkFlows({ ...base, stack: { number: 1 } }).stack, ['stack has fewer than 2 PRs, leave the stack field out']);
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

test('writeSession records the agent session, the directory it runs from and the worktree', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-'));
  const before = process.env.CLAUDE_CODE_SESSION_ID;
  t.after(() => { if (before === undefined) delete process.env.CLAUDE_CODE_SESSION_ID; else process.env.CLAUDE_CODE_SESSION_ID = before; });
  process.env.CLAUDE_CODE_SESSION_ID = 'abc-123';
  writeSession(dir, '/clones/shop-pr-7');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')), { sessionId: 'abc-123', cwd: process.cwd(), worktree: '/clones/shop-pr-7', watcherPid: null });
  delete process.env.CLAUDE_CODE_SESSION_ID;
  assert.deepStrictEqual(writeSession(dir, null, 42), { sessionId: null, cwd: process.cwd(), worktree: null, watcherPid: 42 });
});

test('listReviews lists each review directory with a review.json, whether an agent watches it, and whether it is paused', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-root-'));
  const write = (dir, file, content) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, file), JSON.stringify(content));
  };
  write('acme/shop/7', 'review.json', { pr: { title: 'Add a cache' }, remote: { state: 'merged' } });
  write('acme/shop/7', 'session.json', { sessionId: 's1', cwd: '/work', worktree: null, watcherPid: process.pid });
  write('acme/shop/7', 'paused', '');
  write('acme/shop/8', 'review.json', { pr: { title: 'Fix the cache' } });
  write('acme/shop/8', 'session.json', { sessionId: null, cwd: '/work', worktree: '/clones/shop-pr-8' });
  write('acme/shop/9', 'reviewer.json', {});
  write('acme/api/1', 'review.json', { pr: { title: 'Old review' } });
  assert.deepStrictEqual(listReviews(root).map(({ dir, ...review }) => review), [
    { owner: 'acme', repo: 'api', number: 1, title: 'Old review', state: 'open', session: null, agentConnected: false, paused: false },
    { owner: 'acme', repo: 'shop', number: 7, title: 'Add a cache', state: 'merged', session: { sessionId: 's1', cwd: '/work', worktree: null, watcherPid: process.pid }, agentConnected: true, paused: true },
    { owner: 'acme', repo: 'shop', number: 8, title: 'Fix the cache', state: 'open', session: { sessionId: null, cwd: '/work', worktree: '/clones/shop-pr-8' }, agentConnected: false, paused: false },
  ]);
});

test('listReviews leaves out a review whose review.json is broken, and reads a broken session.json as missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-root-'));
  const write = (dir, file, content) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, file), content);
  };
  write('acme/shop/7', 'review.json', '{"pr":');
  write('acme/shop/8', 'review.json', JSON.stringify({ pr: { title: 'Fix the cache' } }));
  write('acme/shop/8', 'session.json', '{"sessionId":');
  assert.deepStrictEqual(listReviews(root).map(({ dir, ...review }) => review), [
    { owner: 'acme', repo: 'shop', number: 8, title: 'Fix the cache', state: 'open', session: null, agentConnected: false, paused: false },
  ]);
});

test('watchEvents passes on each line added after the watch started, also a line written in two parts', async (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-')), 'events.jsonl');
  fs.writeFileSync(file, '{"old":true}\n');
  const lines = [];
  const stop = watchEvents(file, (line) => lines.push(line), 20);
  t.after(stop);
  fs.appendFileSync(file, '{"type":"ask"}\n{"type":');
  await new Promise((resolve) => setTimeout(resolve, 80));
  fs.appendFileSync(file, '"check"}\n');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepStrictEqual(lines, ['{"type":"ask"}', '{"type":"check"}']);
});

test('watchReview holds events while the review is paused, drops check events, and prints the rest in order on play', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-'));
  const file = path.join(dir, 'events.jsonl');
  const pause = (paused) => (paused ? fs.writeFileSync(path.join(dir, 'paused'), '') : fs.rmSync(path.join(dir, 'paused'), { force: true }));
  const wait = () => new Promise((resolve) => setTimeout(resolve, 80));
  const lines = [];
  const states = [];
  pause(false);
  const stop = watchReview(dir, (line) => lines.push(line), (paused) => states.push(paused ? 'PAUSED' : 'RESUMED'), 20);
  t.after(stop);
  fs.appendFileSync(file, '{"type":"ask","n":1}\n');
  await wait();
  pause(true);
  fs.appendFileSync(file, '{"type":"check"}\n{"type":"ask","n":2}\n{"type":"post","n":3}\n');
  await wait();
  assert.deepStrictEqual(lines, ['{"type":"ask","n":1}']);
  pause(false);
  await wait();
  fs.appendFileSync(file, '{"type":"check"}\n');
  await wait();
  assert.deepStrictEqual(lines, ['{"type":"ask","n":1}', '{"type":"ask","n":2}', '{"type":"post","n":3}', '{"type":"check"}']);
  assert.deepStrictEqual(states, ['PAUSED', 'RESUMED']);
});

test('watchReview says at once that a review is paused when the watch starts during a pause', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-'));
  fs.writeFileSync(path.join(dir, 'paused'), '');
  const states = [];
  const stop = watchReview(dir, () => {}, (paused) => states.push(paused), 20);
  t.after(stop);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepStrictEqual(states, [true]);
});

function stackRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-stack-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dirOf = (number) => path.join(root, 'example-org', 'sample-widget', String(number));
  const write = (number, name, content) => {
    fs.mkdirSync(dirOf(number), { recursive: true });
    fs.writeFileSync(path.join(dirOf(number), name), typeof content === 'string' ? content : JSON.stringify(content));
  };
  return { root, dirOf, write };
}

test("stackStatus reports each PR's review directory", (t) => {
  const { root, write } = stackRoot(t);
  const hunks = (n) => Array.from({ length: n }, (_, i) => ({ id: `h${i + 1}` }));
  write(14, 'review.json', { pr: { headSha: 'new' }, hunks: hunks(3), posts: [{ eventId: 'e1', status: 'posted' }] });
  write(14, 'reviewer.json', { sent: [{ id: 'e1', type: 'post', kind: 'final', headSha: 'new' }] });
  write(15, 'review.json', { pr: { headSha: 'a' }, hunks: hunks(2) });
  write(15, 'reviewer.json', { seen: ['h1', 'removed'], remarks: [{ id: 'r1' }, { id: 'r2' }] });
  write(16, 'preparing', '');
  const status = stackStatus('example-org', 'sample-widget', [14, 15, 16, 17], root);
  const expected = [
    { number: 14, page: '/example-org/sample-widget/14', hasReview: true, posted: true, hunks: 3 },
    { number: 15, hasReview: true, seen: 1, remarks: 2, posted: false },
    { number: 16, hasReview: false, preparing: true },
    { number: 17, hasReview: false, preparing: false },
  ];
  expected.forEach((entry, index) => assert.deepStrictEqual(Object.fromEntries(Object.keys(entry).map((key) => [key, status[index][key]])), entry));
});

test('stackStatus skips a number that is not a PR number', (t) => {
  const { root } = stackRoot(t);
  assert.deepStrictEqual(stackStatus('example-org', 'sample-widget', ['../../../other', 14], root).map((entry) => entry.number), [14]);
});

test('waiting and answered print usage and exit 2 for an empty question or a missing directory', (t) => {
  const { dirOf, write } = stackRoot(t);
  write(14, 'review.json', {});
  const run = (...args) => spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-data.js'), ...args], { encoding: 'utf8' });
  for (const args of [['waiting', '', dirOf(14)], ['waiting', 'Q?', dirOf(99)], ['answered', dirOf(99)]]) {
    const result = run(...args);
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /Usage/);
  }
});

test('stackStatus does not count a review posted before the latest commits', (t) => {
  const { root, write } = stackRoot(t);
  write(14, 'review.json', { pr: { headSha: 'new' }, hunks: [], posts: [{ eventId: 'e1', status: 'posted' }] });
  write(14, 'reviewer.json', { sent: [{ id: 'e1', type: 'post', kind: 'final', headSha: 'old' }] });
  assert.strictEqual(stackStatus('example-org', 'sample-widget', [14], root)[0].posted, false);
});

test("stackStatus gives each criterion's verdict", (t) => {
  const { root, write } = stackRoot(t);
  write(16, 'review.json', { hunks: [], context: { tickets: [{ acceptanceCriteria: [{ id: 'WX-42#3', verdict: 'met' }] }] } });
  assert.deepStrictEqual(stackStatus('example-org', 'sample-widget', [16], root)[0].criteria, { 'WX-42#3': 'met' });
});

test('setWaiting writes and removes the marker in every review', (t) => {
  const { dirOf, write } = stackRoot(t);
  write(14, 'review.json', {});
  write(15, 'review.json', {});
  const dirs = [dirOf(14), dirOf(15)];
  setWaiting(dirs, 'Which angles?');
  dirs.forEach((dir) => assert.strictEqual(readWaiting(dir).question, 'Which angles?'));
  setWaiting(dirs, null);
  dirs.forEach((dir) => assert.strictEqual(readWaiting(dir), null));
});

test('watch refuses a review that another live process watches', (t) => {
  const { dirOf, write } = stackRoot(t);
  write(14, 'review.json', {});
  writeSession(dirOf(14), null, process.pid);
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-data.js'), 'watch', dirOf(14)], { encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(result.status, 4);
  assert.match(result.stdout + result.stderr, /held:/);
});

test('waiting and answered set and remove the marker from the command line', (t) => {
  const { dirOf, write } = stackRoot(t);
  write(14, 'review.json', {});
  const run = (...args) => execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-data.js'), ...args]);
  run('waiting', 'Which angles?', dirOf(14));
  assert.strictEqual(readWaiting(dirOf(14)).question, 'Which angles?');
  run('answered', dirOf(14));
  assert.strictEqual(readWaiting(dirOf(14)), null);
});
