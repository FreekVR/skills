'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js
// Needs the built server in .output (npm run build).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const SCRIPTS = path.join(__dirname, '..', 'scripts');

function stateHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-server-'));
  const dir = path.join(home, 'guided-pr-review', 'acme', 'shop', '7');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify({ pr: { title: 'Add a cache' }, hunks: [] }));
  return { home, dir };
}

async function until(check) {
  for (let tries = 0; tries < 100 && !(await check()); tries++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(await check());
}

const agentConnected = async (url) => (await (await fetch(`${url}api/reviews`)).json())[0].agentConnected;

function launch(home) {
  const output = execFileSync(process.execPath, [path.join(SCRIPTS, 'review-server.js')], { env: { ...process.env, XDG_STATE_HOME: home } });
  return String(output).match(/READY (\S+)/)[1];
}

function stopServer(home) {
  const record = JSON.parse(fs.readFileSync(path.join(home, 'guided-pr-review', 'server.json'), 'utf8'));
  process.kill(record.pid);
  return record.pid;
}

test('starts one server for all reviews, reuses it, and starts a new one after it stopped', async (t) => {
  const { home } = stateHome();
  const url = launch(home);
  t.after(() => {
    try { stopServer(home); } catch { /* already stopped */ }
    fs.rmSync(home, { recursive: true, force: true });
  });
  assert.strictEqual(launch(home), url);
  const reviews = await (await fetch(`${url}api/reviews`)).json();
  assert.deepStrictEqual(reviews.map((review) => review.title), ['Add a cache']);

  const pid = stopServer(home);
  await until(async () => !(await fetch(`${url}api/server`).catch(() => null)));
  launch(home);
  assert.notStrictEqual(JSON.parse(fs.readFileSync(path.join(home, 'guided-pr-review', 'server.json'), 'utf8')).pid, pid);
});

test('the watch prints each event the page sends, and the review shows an agent while it runs', async (t) => {
  const { home, dir } = stateHome();
  const url = launch(home);
  t.after(() => {
    stopServer(home);
    fs.rmSync(home, { recursive: true, force: true });
  });
  const watch = spawn(process.execPath, [path.join(SCRIPTS, 'review-data.js'), 'watch', dir], { env: { ...process.env, XDG_STATE_HOME: home } });
  t.after(() => watch.kill());
  const printed = new Promise((resolve) => watch.stdout.on('data', (chunk) => resolve(String(chunk))));
  await until(() => agentConnected(url));
  const { id } = await (await fetch(`${url}api/reviews/acme/shop/7/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Guided-Review': '1' }, body: JSON.stringify({ type: 'ask', question: 'Why?' }) })).json();
  const line = await printed;
  assert.match(line, /^EVENT /);
  assert.deepStrictEqual(JSON.parse(line.slice(6)), { type: 'ask', question: 'Why?', id, at: JSON.parse(line.slice(6)).at });

  watch.kill();
  await until(async () => !(await agentConnected(url)));
});
