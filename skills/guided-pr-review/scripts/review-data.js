#!/usr/bin/env node
// Usage:
//   node review-data.js dir <owner>/<repo> <pr-number>   Create and print the review directory.
//   node review-data.js hunks <diff-file> <review-file> [--whole <path>]...
//                                                        Write the hunks of a unified diff into review.json, keeping
//                                                        the explanations of hunks that did not change. Each file
//                                                        passed with --whole becomes one hunk.
//   node review-data.js check <review-file>              Check that every hunk is in a flow or in "notInAnyFlow".
//   node review-data.js stack <owner>/<repo> <pr-number> Print the stack of a PR as JSON, or "null" when it is in no stack.
//                                                        Exit 3 and print the split when the branches above it split.
//   node review-data.js list                             Print the reviews that are not deleted, with their page URL
//                                                        while the review server runs.
//   node review-data.js watch <review-dir> [--worktree <path>]
//                                                        Record this session in session.json, then print each new
//                                                        event in events.jsonl as an "EVENT <json>" line until stopped.
//                                                        While the review is paused, it prints only "PAUSED" when the
//                                                        pause starts and "RESUMED" when it ends.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { fromGitHubStack, fromBranches } = require('./stack.js');

const { stateRoot, reviewDir, writeSession, readJson, isRunning, watchReview, listReviews } = require('./reviews.js');

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function parseDiff(text, whole = new Set()) {
  const hunks = [];
  let file = null;
  let current = null;

  const finishFile = () => {
    // A rename, mode change or binary file has no hunk, but it is still a change the reviewer must see.
    if (file && !file.hasHunks) {
      hunks.push({ file: file.path, oldFile: file.oldPath, status: file.status, binary: file.binary, lines: [] });
    }
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      finishFile();
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      file = { oldPath: match[1], path: match[2], status: 'modified', hasHunks: false, binary: false };
      current = null;
    } else if (!file) {
      continue;
    } else if (line.startsWith('new file mode')) {
      file.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      file.status = 'deleted';
    } else if (line.startsWith('rename from ')) {
      file.status = 'renamed';
    } else if (line.startsWith('Binary files ')) {
      file.binary = true;
    } else if (HUNK_HEADER.test(line)) {
      const [, oldStart, oldLines, newStart, newLines, context] = HUNK_HEADER.exec(line);
      current = {
        file: file.path,
        oldFile: file.oldPath,
        status: file.status,
        oldStart: Number(oldStart),
        oldLines: oldLines === undefined ? 1 : Number(oldLines),
        newStart: Number(newStart),
        newLines: newLines === undefined ? 1 : Number(newLines),
        context: context.trim(),
        header: line,
        lines: [],
      };
      file.hasHunks = true;
      hunks.push(current);
    } else if (current && /^[ +\-\\]/.test(line)) {
      current.lines.push(line);
    }
  }
  finishFile();
  return assignIds(joinWhole(hunks, whole).map(({ header, ...hunk }) => hunk));
}

// A file the reviewer checks as one unit keeps one hunk. Each later hunk's header stays in the lines,
// so the review page can number the lines after a gap.
function joinWhole(hunks, whole) {
  const joined = new Map();
  return hunks.filter((hunk) => {
    if (!whole.has(hunk.file) || !hunk.header) return true;
    const first = joined.get(hunk.file);
    if (!first) {
      joined.set(hunk.file, hunk);
      return true;
    }
    first.lines.push(hunk.header, ...hunk.lines);
    first.oldLines = hunk.oldStart + hunk.oldLines - first.oldStart;
    first.newLines = hunk.newStart + hunk.newLines - first.newStart;
    return false;
  });
}


// The ID depends on the file and the changed content only, so a hunk keeps its ID when other hunks
// move it to another line number, and gets a new ID when its own content changes.
function assignIds(hunks) {
  const seen = new Map();
  return hunks.map((hunk) => {
    const content = [hunk.file, hunk.status, ...hunk.lines].join('\n');
    const base = crypto.createHash('sha1').update(content).digest('hex').slice(0, 12);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return { id: count === 0 ? base : `${base}-${count}`, ...hunk };
  });
}

// An unchanged hunk keeps its ID (see assignIds), so it also keeps its explanation across a resume.
function mergeHunks(hunks, previous) {
  const old = new Map(previous.map((hunk) => [hunk.id, hunk]));
  return hunks.map((hunk) => {
    const kept = old.get(hunk.id);
    return kept ? { ...hunk, explanation: kept.explanation, explanationMore: kept.explanationMore } : hunk;
  });
}

function count(hunk, sign) { return hunk.lines.filter((line) => line[0] === sign).length; }

function checkStack(review) {
  const { stack } = review;
  if (!stack) return [];
  const problems = [];
  const { prs } = stack;
  if (prs.length < 2) problems.push('stack has fewer than 2 PRs, leave the stack field out');
  if (prs.length >= 2 && !prs.some((pr) => Number(pr.number) === Number(review.pr?.number))) problems.push(`stack.prs does not hold PR ${review.pr?.number}`);
  for (const field of ['coverage', 'outsideTickets']) {
    if (stack[field] && !stack[field].length) problems.push(`stack.${field} is empty, leave it out`);
  }
  return problems;
}

function checkFlows(review) {
  const hunkIds = new Set(review.hunks.map((hunk) => hunk.id));
  const placed = new Set(review.notInAnyFlow || []);
  const withoutWhy = [];
  for (const flow of review.flows || []) {
    for (const step of flow.steps) {
      placed.add(step.hunkId);
      if (!step.why || !step.why.trim()) withoutWhy.push(`${flow.id}:${step.hunkId}`);
    }
  }
  return {
    stack: checkStack(review),
    missing: [...hunkIds].filter((id) => !placed.has(id)),
    unknown: [...placed].filter((id) => !hunkIds.has(id)),
    withoutWhy,
  };
}

function gh(...args) {
  return JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function readStack(repository, number) {
  const pull = gh(`repos/${repository}/pulls/${number}`);
  if (pull.stack) {
    const stack = gh(`repos/${repository}/stacks/${pull.stack.number}`);
    const pulls = stack.pull_requests.map((pr) => (pr.number === pull.number ? pull : gh(`repos/${repository}/pulls/${pr.number}`)));
    return fromGitHubStack(stack, pulls);
  }
  return fromBranches(Number(number), gh('--paginate', '--slurp', `repos/${repository}/pulls?state=open&per_page=100`).flat());
}

function main([command, ...args]) {
  if (command === 'dir' && args.length === 2) {
    const [repository, number] = args;
    const dir = reviewDir(repository, number);
    fs.mkdirSync(dir, { recursive: true });
    console.log(dir);
    return 0;
  }
  const [diffFile, reviewFile, ...options] = args;
  const whole = new Set();
  while (options[0] === '--whole' && options[1]) whole.add(options.splice(0, 2)[1]);
  if (command === 'hunks' && reviewFile && !options.length) {
    const review = fs.existsSync(reviewFile) ? JSON.parse(fs.readFileSync(reviewFile, 'utf8')) : {};
    review.hunks = mergeHunks(parseDiff(fs.readFileSync(diffFile, 'utf8'), whole), review.hunks || []);
    fs.writeFileSync(reviewFile, JSON.stringify(review) + '\n');
    review.hunks.forEach((hunk) => console.log(`${hunk.id} ${hunk.file} ${hunk.explanation ? 'kept' : 'new'} +${count(hunk, '+')} -${count(hunk, '-')}`));
    return 0;
  }
  if (command === 'check' && args.length === 1) {
    const [reviewFile] = args;
    const { missing, unknown, withoutWhy, stack } = checkFlows(JSON.parse(fs.readFileSync(reviewFile, 'utf8')));
    missing.forEach((id) => console.log(`missing: ${id} is not in any flow and not in notInAnyFlow`));
    unknown.forEach((id) => console.log(`unknown: ${id} is not a hunk of this PR`));
    withoutWhy.forEach((step) => console.log(`no why: step ${step} does not say why it comes there`));
    stack.forEach((problem) => console.log(`stack: ${problem}`));
    if (missing.length || unknown.length || withoutWhy.length || stack.length) {
      return 1;
    }
    console.log('ok: every hunk is placed');
    return 0;
  }
  if (command === 'watch' && (args.length === 1 || (args.length === 3 && args[1] === '--worktree'))) {
    writeSession(args[0], args[2] || null, process.pid);
    watchReview(args[0], (line) => console.log(`EVENT ${line}`), (paused) => console.log(paused ? 'PAUSED' : 'RESUMED'));
    return undefined;
  }
  if (command === 'stack' && args.length === 2) {
    const stack = readStack(args[0], args[1]);
    console.log(JSON.stringify(stack));
    return stack && stack.split ? 3 : 0;
  }
  if (command === 'list' && args.length === 0) {
    const server = readJson(path.join(stateRoot(), 'server.json'));
    const base = server && isRunning(server.pid) ? server.url : null;
    listReviews().forEach((review) => {
      const page = base ? `${base}${review.owner}/${review.repo}/${review.number}` : 'server not running';
      console.log(`${review.owner}/${review.repo}#${review.number} ${review.state} ${review.agentConnected ? 'agent connected' : 'no agent'} ${page} ${review.dir}`);
    });
    return 0;
  }
  console.error('Usage: node review-data.js dir <owner>/<repo> <pr-number> | hunks <diff-file> <review-file> [--whole <path>]... | check <review-file> | watch <review-dir> [--worktree <path>] | stack <owner>/<repo> <pr-number> | list');
  return 2;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseDiff, mergeHunks, checkFlows };
