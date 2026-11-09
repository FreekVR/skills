'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { sourceHash } = require('../scripts/build-stamp.js');

const SKILL = path.join(__dirname, '..');

// A copy of the skill's scripts in a fresh folder, so a test can add, change or leave out files there.
function copyOfScripts(t, extra = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(SKILL, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  for (const item of extra) fs.cpSync(path.join(SKILL, item), path.join(root, item), { recursive: true });
  return root;
}

const stampState = (root) => spawnSync(process.execPath, [path.join(root, 'scripts', 'build-stamp.js')], { encoding: 'utf8' });

test('build-stamp says the build is missing, outdated or ok, and outdated again after a source changes', (t) => {
  const root = copyOfScripts(t);
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'page.vue'), '<template>one</template>');
  const missing = stampState(root);
  assert.deepStrictEqual([missing.stdout.trim(), missing.status], ['missing', 1]);
  fs.mkdirSync(path.join(root, '.output', 'server'), { recursive: true });
  fs.writeFileSync(path.join(root, '.output', 'server', 'index.mjs'), '');
  assert.strictEqual(stampState(root).stdout.trim(), 'outdated');
  spawnSync(process.execPath, [path.join(root, 'scripts', 'build-stamp.js'), 'write']);
  const ok = stampState(root);
  assert.deepStrictEqual([ok.stdout.trim(), ok.status], ['ok', 0]);
  fs.writeFileSync(path.join(root, 'app', '.DS_Store'), 'not a source');
  assert.strictEqual(stampState(root).stdout.trim(), 'ok');
  fs.writeFileSync(path.join(root, 'app', 'page.vue'), '<template>two</template>');
  assert.strictEqual(stampState(root).stdout.trim(), 'outdated');
});

test('the committed page shell is built from the current sources', () => {
  const firstLine = fs.readFileSync(path.join(SKILL, 'assets', 'review-page.html'), 'utf8').split('\n', 1)[0];
  assert.strictEqual(firstLine, `<!-- sources: ${sourceHash()} -->`, 'run pnpm build and commit assets/review-page.html');
});

test('static writes the review page from the committed shell, without a build', (t) => {
  const root = copyOfScripts(t, ['assets']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-pr-review-static-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // The title holds a marker's text, as the diff of the script that fills the markers does.
  const review = { pr: { owner: 'example-org', repo: 'sample-widget', number: 17, title: 'Costs $1 & <more> __GUIDED_REVIEW_PATH__' }, hunks: [] };
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(review));
  const out = path.join(dir, 'review.html');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'review-data.js'), 'static', dir, out], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  const page = fs.readFileSync(out, 'utf8');
  assert.ok(page.includes('window.__NUXT__={path:"/example-org/sample-widget/17"}'));
  assert.ok(page.includes('"title":"Costs $1 & \\u003cmore> __GUIDED_REVIEW_PATH__"'));
  assert.ok(!page.includes('__GUIDED_REVIEW_DATA__') && !page.includes('{path:__GUIDED_REVIEW_PATH__}'));
});
