'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ownDiff } = require('../scripts/own-diff.js');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-diff-'));
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  const commit = (file, content, subject) => {
    fs.writeFileSync(path.join(dir, file), content);
    git('add', file);
    git('commit', '-q', '-m', subject);
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  return { dir, git, commit };
}

test("ownDiff gives the PR's own changes before a rebase, without the lower PR's changes", () => {
  const { dir, git, commit } = makeRepo();
  try {
    commit('base.txt', 'base\n', 'base');
    git('checkout', '-q', '-b', 'lower');
    commit('lower.txt', 'lower\n', 'lower: add');
    git('checkout', '-q', '-b', 'upper');
    commit('upper.txt', 'one\n', 'upper: add file');
    commit('upper.txt', 'one\ntwo\n', 'upper: tweak');
    const oldHead = git('rev-parse', 'HEAD');

    git('checkout', '-q', 'lower');
    commit('lower.txt', 'lower\nmore\n', 'lower: more');
    git('commit', '-q', '--amend', '-m', 'lower: add and more');
    git('checkout', '-q', 'upper');
    git('rebase', '-q', 'lower');

    const diff = ownDiff(dir, oldHead, 'upper: add file');
    assert.ok(diff.includes('+++ b/upper.txt'));
    assert.ok(!diff.includes('lower.txt'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ownDiff throws when no commit before the old head has the subject', () => {
  const { dir, git, commit } = makeRepo();
  try {
    commit('base.txt', 'base\n', 'base');
    const oldHead = git('rev-parse', 'HEAD');
    assert.throws(() => ownDiff(dir, oldHead, 'missing subject'), /no commit with subject missing subject/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ownDiff throws when more than one commit has the subject', () => {
  const { dir, git, commit } = makeRepo();
  try {
    commit('base.txt', 'base\n', 'base');
    commit('a.txt', 'a\n', 'same subject');
    commit('b.txt', 'b\n', 'same subject');
    assert.throws(() => ownDiff(dir, git('rev-parse', 'HEAD'), 'same subject'), /subject matches more than one commit: [0-9a-f]{7}, [0-9a-f]{7}/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
