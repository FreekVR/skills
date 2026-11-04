'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseDiff, mergeHunks, checkFlows, parseWatchArgs } = require('../scripts/review-data.js');
const { execFileSync, spawnSync, spawn } = require('child_process');
const { reviewDir, writeSession, listReviews, watchEvents, watchReview, stackStatus, setWaiting, readWaiting, agentStatus, readPreparing, setPreparing } = require('../scripts/reviews.js');

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
  assert.deepStrictEqual(checkFlows(review), { missing: ['c'], unknown: ['z'], withoutWhy: ['cache:z'], stack: [], criteria: [] });
});

test('checkFlows passes when every hunk is placed, also in several flows', () => {
  const review = {
    hunks: [{ id: 'a' }, { id: 'b' }],
    flows: [
      { id: 'read', steps: [{ hunkId: 'a', why: 'Data enters.' }, { hunkId: 'b', why: 'Data is shown.' }] },
      { id: 'write', steps: [{ hunkId: 'a', why: 'Data is saved.' }] },
    ],
  };
  assert.deepStrictEqual(checkFlows(review), { missing: [], unknown: [], withoutWhy: [], stack: [], criteria: [] });
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

function idleDir(t, session) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (session) fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session));
  return dir;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lastEventAtOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')).lastEventAt;

// A limit of 0.01 minutes is 600 ms; each step waits at least 300 ms.
const LIMIT = 0.01;

test('watchReview calls onIdle when no event came for the idle limit, and sets lastEventAt at the start', async (t) => {
  const dir = idleDir(t, { watcherPid: 1 });
  let idle = 0;
  t.after(watchReview(dir, () => {}, () => {}, 20, { idleMinutes: LIMIT, onIdle: () => idle++ }));
  assert.ok(lastEventAtOf(dir));
  await sleep(300);
  assert.strictEqual(idle, 0);
  await sleep(600);
  assert.strictEqual(idle, 1);
});

test('watchReview does not reset the idle timer on a check event', async (t) => {
  const dir = idleDir(t, { watcherPid: 1 });
  let idle = 0;
  t.after(watchReview(dir, () => {}, () => {}, 20, { idleMinutes: LIMIT, onIdle: () => idle++ }));
  const started = lastEventAtOf(dir);
  await sleep(300);
  fs.appendFileSync(path.join(dir, 'events.jsonl'), '{"type":"check"}\n');
  await sleep(600);
  assert.strictEqual(lastEventAtOf(dir), started);
  assert.strictEqual(idle, 1);
});

test('watchReview resets the idle timer on another event', async (t) => {
  const dir = idleDir(t, { watcherPid: 1 });
  let idle = 0;
  t.after(watchReview(dir, () => {}, () => {}, 20, { idleMinutes: LIMIT, onIdle: () => idle++ }));
  const started = lastEventAtOf(dir);
  await sleep(400);
  fs.appendFileSync(path.join(dir, 'events.jsonl'), '{"type":"ask"}\n');
  await sleep(400);
  assert.notStrictEqual(lastEventAtOf(dir), started);
  assert.strictEqual(idle, 0);
});

test('watchReview counts a paused review as idle', async (t) => {
  const dir = idleDir(t, { watcherPid: 1 });
  fs.writeFileSync(path.join(dir, 'paused'), '');
  let idle = 0;
  t.after(watchReview(dir, () => {}, () => {}, 20, { idleMinutes: LIMIT, onIdle: () => idle++ }));
  await sleep(900);
  assert.strictEqual(idle, 1);
});

test('watchReview counts a held event as activity when it arrives', async (t) => {
  const dir = idleDir(t, { watcherPid: 1 });
  fs.writeFileSync(path.join(dir, 'paused'), '');
  let idle = 0;
  t.after(watchReview(dir, () => {}, () => {}, 20, { idleMinutes: LIMIT, onIdle: () => idle++ }));
  await sleep(400);
  fs.appendFileSync(path.join(dir, 'events.jsonl'), '{"type":"ask"}\n');
  await sleep(400);
  assert.strictEqual(idle, 0);
  await sleep(500);
  assert.strictEqual(idle, 1);
});

test('watchReview with restart prints the events written while no watch ran, and is not idle then', async (t) => {
  const old = new Date(Date.now() - 5 * 60000).toISOString();
  const dir = idleDir(t, { watcherPid: null, lastEventAt: old, eventsOffset: 0 });
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"type":"check"}\n{"type":"ask","n":1}\n');
  const lines = [];
  let idle = 0;
  t.after(watchReview(dir, (line) => lines.push(line), () => {}, 20, { restart: true, onIdle: () => idle++ }));
  assert.deepStrictEqual(lines, ['{"type":"check"}', '{"type":"ask","n":1}']);
  assert.strictEqual(idle, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')).eventsOffset, fs.statSync(path.join(dir, 'events.jsonl')).size);
});

test('watchReview without restart starts at the end of events.jsonl and saves the offset it reads to', async (t) => {
  const dir = idleDir(t, { watcherPid: 1 });
  const file = path.join(dir, 'events.jsonl');
  fs.writeFileSync(file, '{"type":"ask","n":1}\n');
  const lines = [];
  t.after(watchReview(dir, (line) => lines.push(line), () => {}, 20));
  fs.appendFileSync(file, '{"type":"ask","n":2}\n');
  await sleep(300);
  assert.deepStrictEqual(lines, ['{"type":"ask","n":2}']);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')).eventsOffset, fs.statSync(file).size);
});

test('watchReview is idle at once when lastEventAt is older than the limit, and runs on when it is recent', (t) => {
  const old = idleDir(t, { watcherPid: 1, lastEventAt: new Date(Date.now() - 31 * 60000).toISOString() });
  let idle = 0;
  t.after(watchReview(old, () => {}, () => {}, 20, { onIdle: () => idle++ }));
  assert.strictEqual(idle, 1);
  const recentAt = new Date(Date.now() - 5 * 60000).toISOString();
  const recent = idleDir(t, { watcherPid: 1, lastEventAt: recentAt });
  let idleRecent = 0;
  t.after(watchReview(recent, () => {}, () => {}, 20, { onIdle: () => idleRecent++ }));
  assert.strictEqual(idleRecent, 0);
  assert.strictEqual(lastEventAtOf(recent), recentAt);
});

test('writeSession keeps lastEventAt and eventsOffset of the session it replaces only on a restart', (t) => {
  const kept = { lastEventAt: '2026-01-01T00:00:00.000Z', eventsOffset: 12 };
  const dir = idleDir(t, { watcherPid: 1, ...kept });
  const fresh = writeSession(dir, null, 2);
  assert.deepStrictEqual([fresh.lastEventAt, fresh.eventsOffset], [undefined, undefined]);
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(kept));
  const restarted = writeSession(dir, null, 2, true);
  assert.deepStrictEqual([restarted.lastEventAt, restarted.eventsOffset], [kept.lastEventAt, kept.eventsOffset]);
});

test('parseWatchArgs reads the worktree, idle-minutes and restart flags', () => {
  assert.deepStrictEqual(parseWatchArgs(['d', '--idle-minutes', '2', '--restart', '--worktree', '/w']), { dir: 'd', worktree: '/w', idleMinutes: 2, restart: true });
  assert.deepStrictEqual(parseWatchArgs(['d']), { dir: 'd', worktree: null, idleMinutes: undefined, restart: false });
  assert.strictEqual(parseWatchArgs(['d', '--idle-minutes', 'x']), null);
  assert.strictEqual(parseWatchArgs(['d', '--other', '1']), null);
});

test('watch --restart prints IDLE and exits 0 when the last event is older than --idle-minutes', (t) => {
  const dir = idleDir(t, { watcherPid: null, lastEventAt: new Date(Date.now() - 5 * 60000).toISOString() });
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-data.js'), 'watch', dir, '--idle-minutes', '1', '--restart'], { encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout.trim(), 'IDLE');
});

test('watch without --restart ignores an old lastEventAt and runs', async (t) => {
  const dir = idleDir(t, { watcherPid: null, lastEventAt: new Date(Date.now() - 5 * 60000).toISOString() });
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-data.js'), 'watch', dir, '--idle-minutes', '1'], { stdio: 'ignore' });
  t.after(() => child.kill());
  await sleep(600);
  assert.strictEqual(child.exitCode, null);
  assert.ok(Date.now() - new Date(lastEventAtOf(dir)).getTime() < 60000);
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

test('agentStatus reports a live agent, a dead one, a pause and a waiting question', (t) => {
  const { dirOf: dir, write } = stackRoot(t);
  write(1, 'review.json', {});
  assert.deepStrictEqual(agentStatus(dir(1)), { session: null, connected: false, paused: false, waiting: null, preparing: null });
  write(2, 'session.json', { sessionId: 'sample-session', cwd: '/sample/dir', watcherPid: process.pid });
  assert.strictEqual(agentStatus(dir(2)).connected, true);
  assert.deepStrictEqual(agentStatus(dir(2)).session, { sessionId: 'sample-session', cwd: '/sample/dir' });
  const dead = spawnSync(process.execPath, ['-e', '']);
  write(3, 'session.json', { watcherPid: dead.pid });
  assert.strictEqual(agentStatus(dir(3)).connected, false);
  write(4, 'paused', '');
  assert.strictEqual(agentStatus(dir(4)).paused, true);
  write(5, 'review.json', {});
  setWaiting([dir(5)], 'Which angles?');
  assert.strictEqual(agentStatus(dir(5)).waiting.question, 'Which angles?');
});

test('agentStatus of a review that waits for its agent reports the agent of the review the start came from', (t) => {
  const { dirOf, write } = stackRoot(t);
  write(15, 'session.json', { sessionId: 'session-15', cwd: '/work', watcherPid: process.pid });
  write(15, 'paused', '');
  write(16, 'preparing', { step: 'Waiting for the agent to start', since: '2026-11-04T10:00:00Z', from: 15 });
  const status = agentStatus(dirOf(16));
  assert.deepStrictEqual([status.connected, status.paused, status.session], [true, true, { sessionId: 'session-15', cwd: '/work' }]);
  assert.strictEqual(status.preparing.from, 15);
  write(17, 'preparing', { step: 'Waiting for the agent to start', from: 15 });
  write(17, 'session.json', { sessionId: 'session-17', cwd: '/other', watcherPid: process.pid });
  assert.deepStrictEqual([agentStatus(dirOf(17)).paused, agentStatus(dirOf(17)).session.sessionId], [false, 'session-17']);
  write(18, 'preparing', { step: 'Waiting for the agent to start', from: 19 });
  assert.deepStrictEqual([agentStatus(dirOf(18)).connected, agentStatus(dirOf(18)).session], [false, null]);
});

test('setPreparing keeps the review the start came from', (t) => {
  const { dirOf, write } = stackRoot(t);
  write(16, 'preparing', { step: 'Waiting for the agent to start', since: '2026-11-04T10:00:00Z', from: 15 });
  setPreparing(dirOf(16), 'reading the PR');
  assert.deepStrictEqual([readPreparing(dirOf(16)).step, readPreparing(dirOf(16)).from], ['reading the PR', 15]);
});

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

test('readPreparing reads the step, treats an empty file as preparing without a step and a missing file as not preparing', (t) => {
  const { dirOf, write } = stackRoot(t);
  write(14, 'review.json', {});
  assert.strictEqual(readPreparing(dirOf(14)), null);
  write(15, 'preparing', '');
  assert.deepStrictEqual(readPreparing(dirOf(15)), { step: null, since: null });
  write(16, 'preparing', { step: 'running the AI reviews', since: '2026-11-04T10:00:00Z' });
  assert.deepStrictEqual(readPreparing(dirOf(16)), { step: 'running the AI reviews', since: '2026-11-04T10:00:00Z' });
  assert.deepStrictEqual(agentStatus(dirOf(16)).preparing, { step: 'running the AI reviews', since: '2026-11-04T10:00:00Z' });
});

test('preparing and prepared set and remove the marker from the command line', (t) => {
  const { dirOf, write } = stackRoot(t);
  write(14, 'review.json', {});
  const run = (...args) => execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-data.js'), ...args]);
  run('preparing', dirOf(14), 'running the AI reviews');
  assert.strictEqual(readPreparing(dirOf(14)).step, 'running the AI reviews');
  assert.ok(readPreparing(dirOf(14)).since);
  run('prepared', dirOf(14));
  assert.strictEqual(readPreparing(dirOf(14)), null);
});

test('preparing and prepared print usage and exit 2 for an empty step or a missing directory', (t) => {
  const { dirOf, write } = stackRoot(t);
  write(14, 'review.json', {});
  const run = (...args) => spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-data.js'), ...args], { encoding: 'utf8' });
  for (const args of [['preparing', dirOf(14), ''], ['preparing', dirOf(99), 'step'], ['preparing', dirOf(14)], ['prepared', dirOf(99)], ['prepared']]) {
    const result = run(...args);
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /Usage/);
  }
});

test('check wants one finding for the whole PR for each criterion that is not met, and none for another verdict', () => {
  const criterion = (id, verdict) => ({ id, verdict });
  const finding = (id, extra = {}) => ({ hunkId: null, rule: 'acceptance-criteria', title: `${id} Caches nothing`, ...extra });
  const review = (criteria, findings) => ({ hunks: [], context: { tickets: [{ acceptanceCriteria: criteria }] }, findings });
  assert.deepStrictEqual(checkFlows({ hunks: [] }).criteria, []);
  assert.deepStrictEqual(checkFlows(review([criterion('WX-42#1', 'met')], [])).criteria, []);
  assert.deepStrictEqual(checkFlows(review([criterion('WX-42#2', 'not-met')], [finding('WX-42#2')])).criteria, []);
  assert.deepStrictEqual(checkFlows(review([criterion('WX-42#2', 'not-met')], [])).criteria, ['WX-42#2 is not met but has no finding for the whole PR']);
  // A finding on a hunk, or with another rule, does not count.
  assert.strictEqual(checkFlows(review([criterion('WX-42#2', 'not-met')], [finding('WX-42#2', { hunkId: 'a' })])).criteria.length, 1);
  assert.strictEqual(checkFlows(review([criterion('WX-42#2', 'not-met')], [finding('WX-42#2', { rule: 'other' })])).criteria.length, 1);
  assert.deepStrictEqual(checkFlows(review([criterion('WX-42#1', 'met'), criterion('WX-42#10', 'not-met')], [finding('WX-42#10')])).criteria, []);
  assert.deepStrictEqual(checkFlows(review([criterion('WX-42#1', 'not-met'), criterion('WX-42#10', 'not-met')], [finding('WX-42#10')])).criteria, ['WX-42#1 is not met but has no finding for the whole PR']);
  assert.deepStrictEqual(checkFlows(review([criterion('WX-42#2', 'not-met')], [{ rule: 'acceptance-criteria', title: 'WX-42#2 Caches nothing' }])).criteria, []);
  assert.deepStrictEqual(checkFlows(review([criterion('WX-42#1', 'met'), criterion('WX-42#3', 'elsewhere')], [finding('WX-42#1'), finding('WX-42#3')])).criteria, ['WX-42#1 has a finding but is met', 'WX-42#3 has a finding but is elsewhere']);
});

test('check exits 1 and prints the criteria problems', (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-check-')), 'review.json');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  fs.writeFileSync(file, JSON.stringify({ hunks: [], findings: [], context: { tickets: [{ acceptanceCriteria: [{ id: 'WX-42#2', verdict: 'not-met' }] }] } }));
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-data.js'), 'check', file], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /criteria: WX-42#2 is not met but has no finding for the whole PR/);
});

function runReviewData(t, files, ...args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-diff-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'review-data.js'), ...args.map((arg) => arg.replace(/^@/, dir + path.sep))], { encoding: 'utf8' });
  return { ...result, dir };
}

test('check --diff passes when review.json holds exactly the hunks of the diff', (t) => {
  const hunks = runReviewData(t, { 'pr.diff': DIFF }, 'hunks', '@pr.diff', '@review.json');
  assert.strictEqual(hunks.status, 0);
  const review = JSON.parse(fs.readFileSync(path.join(hunks.dir, 'review.json'), 'utf8'));
  review.notInAnyFlow = review.hunks.map((hunk) => hunk.id);
  const result = runReviewData(t, { 'pr.diff': DIFF, 'review.json': JSON.stringify(review) }, 'check', '@review.json', '--diff', '@pr.diff');
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /^ok/m);
});

test('check --diff reports a hunk that review.json dropped and a hunk that is not in the diff', (t) => {
  const hunks = parseDiff(DIFF);
  const dropped = hunks[0];
  const review = { hunks: [...hunks.slice(1), { id: 'zzzzzzzz', file: 'src/extra.ts' }], notInAnyFlow: [...hunks.slice(1).map((hunk) => hunk.id), 'zzzzzzzz'] };
  const result = runReviewData(t, { 'pr.diff': DIFF, 'review.json': JSON.stringify(review) }, 'check', '@review.json', '--diff', '@pr.diff');
  assert.strictEqual(result.status, 1);
  assert.ok(result.stdout.includes(`diff: hunk ${dropped.id} of ${dropped.file} is not in review.json`));
  assert.ok(result.stdout.includes('diff: hunk zzzzzzzz is not in the diff'));
});

test('hunks writes the --whole files, and check --diff reads them so a whole file keeps one ID', (t) => {
  const hunks = runReviewData(t, { 'pr.diff': DIFF }, 'hunks', '@pr.diff', '@review.json', '--whole', 'src/cache.ts');
  const review = JSON.parse(fs.readFileSync(path.join(hunks.dir, 'review.json'), 'utf8'));
  assert.deepStrictEqual(review.wholeFiles, ['src/cache.ts']);
  assert.strictEqual(review.hunks.filter((hunk) => hunk.file === 'src/cache.ts').length, 1);
  review.notInAnyFlow = review.hunks.map((hunk) => hunk.id);
  const result = runReviewData(t, { 'pr.diff': DIFF, 'review.json': JSON.stringify(review) }, 'check', '@review.json', '--diff', '@pr.diff');
  assert.strictEqual(result.status, 0);
  delete review.wholeFiles;
  const without = runReviewData(t, { 'pr.diff': DIFF, 'review.json': JSON.stringify(review) }, 'check', '@review.json', '--diff', '@pr.diff');
  assert.strictEqual(without.status, 1);
});
