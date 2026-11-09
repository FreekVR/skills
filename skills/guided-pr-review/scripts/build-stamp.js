#!/usr/bin/env node
'use strict';
// Tells whether the local build of the review page fits the sources of this version of the skill.
//
//   node scripts/build-stamp.js          Print "ok", "missing" or "outdated"; exit 0 only for "ok".
//   node scripts/build-stamp.js write    Record the sources of the build that just ran, in .output/build.json.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STAMP = path.join(ROOT, '.output', 'build.json');
// Everything the build reads. A change to any of these needs a new build.
const SOURCES = ['app', 'server', 'public', 'scripts/reviews.js', 'nuxt.config.ts', 'package.json', 'pnpm-lock.yaml'];

// Hidden files, such as the .DS_Store that macOS writes, are no part of the build.
function filesOf(relative) {
  const full = path.join(ROOT, relative);
  if (!fs.existsSync(full)) return [];
  if (!fs.statSync(full).isDirectory()) return [relative];
  return fs.readdirSync(full, { recursive: true })
    .filter((name) => !name.split(path.sep).some((part) => part.startsWith('.')))
    .map((name) => path.join(relative, name))
    .filter((file) => fs.statSync(path.join(ROOT, file)).isFile())
    .sort();
}

// Get one hash of the paths and contents of every source file.
function sourceHash() {
  const hash = crypto.createHash('sha256');
  for (const file of SOURCES.flatMap(filesOf)) {
    hash.update(file.split(path.sep).join('/')).update('\0').update(fs.readFileSync(path.join(ROOT, file))).update('\0');
  }
  return hash.digest('hex');
}

// Get whether the build is there and fits the sources: ok, missing or outdated.
function buildState() {
  if (!fs.existsSync(path.join(ROOT, '.output', 'server', 'index.mjs'))) return 'missing';
  let stamp = null;
  try { stamp = JSON.parse(fs.readFileSync(STAMP, 'utf8')); } catch { /* no stamp counts as outdated */ }
  return stamp?.sourceHash === sourceHash() ? 'ok' : 'outdated';
}

// Record the sources of the build that just ran.
function writeStamp() {
  fs.writeFileSync(STAMP, JSON.stringify({ sourceHash: sourceHash() }) + '\n');
}

module.exports = { sourceHash, buildState };

if (require.main === module) {
  if (process.argv[2] === 'write') {
    writeStamp();
  } else {
    const state = buildState();
    console.log(state);
    process.exitCode = state === 'ok' ? 0 : 1;
  }
}
