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
//   node review-data.js own-diff <clone> <old-head> <first-subject>
//                                                        Print the diff of a PR's own commits from before a rebase,
//                                                        found by the subject of its first commit.
//   node review-data.js waiting <question> <review-dir>...
//                                                        Show the question the agent waits on in each review page.
//   node review-data.js answered <review-dir>...         Remove that question from each review page.
//   node review-data.js preparing <review-dir> "<step>"  Show in the review page that the agent still prepares the review,
//                                                        and what it does now.
//   node review-data.js prepared <review-dir>            Remove that notice from the review page.
//   node review-data.js list                             Print the reviews that are not deleted, with their page URL
//                                                        while the review server runs.
//   node review-data.js watch <review-dir> [--worktree <path>] [--idle-minutes <n>] [--restart]
//                                                        Record this session in session.json, then print each new
//                                                        event in events.jsonl as an "EVENT <json>" line until stopped.
//                                                        Exit 4 when another running process watches this review.
//                                                        While the review is paused, it prints only "PAUSED" when the
//                                                        pause starts and "RESUMED" when it ends.
//                                                        When no event other than "check" came for <n> minutes
//                                                        (default 30), also while paused, it prints "IDLE" and exits 0.
//                                                        With --restart, which an agent uses only to restart a watch
//                                                        that ended, it also prints the events written while no
//                                                        watch ran, keeps the time of the last such event and prints
//                                                        "IDLE" at once when it is older than the limit. Without it,
//                                                        it starts at the end of events.jsonl with a fresh limit.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { fromGitHubStack, fromBranches } = require('./stack.js');
const { ownDiff } = require('./own-diff.js');

const { stateRoot, reviewDir, writeSession, readJson, isRunning, watchReview, listReviews, setWaiting, setPreparing } = require('./reviews.js');

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
  const prs = stack.prs || [];
  if (prs.length < 2) problems.push('stack has fewer than 2 PRs, leave the stack field out');
  if (prs.length >= 2 && !prs.some((pr) => Number(pr.number) === Number(review.pr?.number))) problems.push(`stack.prs does not hold PR ${review.pr?.number}`);
  for (const field of ['coverage', 'outsideTickets']) {
    if (stack[field] && !stack[field].length) problems.push(`stack.${field} is empty, leave it out`);
  }
  return problems;
}

// A criterion that is not met needs one finding for the whole PR; a finding for any other verdict is stale.
function checkCriteria(review) {
  const verdicts = new Map();
  for (const ticket of review.context?.tickets || []) {
    for (const criterion of ticket.acceptanceCriteria || []) verdicts.set(criterion.id, criterion.verdict);
  }
  const findings = (review.findings || []).filter((finding) => finding.rule === 'acceptance-criteria' && finding.hunkId == null);
  // The ID must end at a non-alphanumeric character, so WX-42#1 does not match a title that starts with WX-42#10.
  const idOf = (finding) => [...verdicts.keys()].find((id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`).test(String(finding.title)));
  const problems = [];
  for (const [id, verdict] of verdicts) {
    if (verdict === 'not-met' && !findings.some((finding) => idOf(finding) === id)) problems.push(`${id} is not met but has no finding for the whole PR`);
  }
  for (const finding of findings) {
    const id = idOf(finding);
    if (id && verdicts.get(id) !== 'not-met') problems.push(`${id} has a finding but is ${verdicts.get(id)}`);
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
    criteria: checkCriteria(review),
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

// Reads `<review-dir> [--worktree <path>] [--idle-minutes <n>] [--restart]`; returns null when the arguments do not fit.
function parseWatchArgs(args) {
  const [dir, ...flags] = args;
  const parsed = { dir, worktree: null, idleMinutes: undefined, restart: false };
  if (!dir) return null;
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === '--restart') parsed.restart = true;
    else if (flags[i] === '--worktree' && flags[i + 1]) parsed.worktree = flags[++i];
    else if (flags[i] === '--idle-minutes' && Number(flags[i + 1]) > 0) parsed.idleMinutes = Number(flags[++i]);
    else return null;
  }
  return parsed;
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
    const { missing, unknown, withoutWhy, stack, criteria } = checkFlows(JSON.parse(fs.readFileSync(reviewFile, 'utf8')));
    missing.forEach((id) => console.log(`missing: ${id} is not in any flow and not in notInAnyFlow`));
    unknown.forEach((id) => console.log(`unknown: ${id} is not a hunk of this PR`));
    withoutWhy.forEach((step) => console.log(`no why: step ${step} does not say why it comes there`));
    stack.forEach((problem) => console.log(`stack: ${problem}`));
    criteria.forEach((problem) => console.log(`criteria: ${problem}`));
    if (missing.length || unknown.length || withoutWhy.length || stack.length || criteria.length) {
      return 1;
    }
    console.log('ok: every hunk is placed');
    return 0;
  }
  const watchArgs = command === 'watch' ? parseWatchArgs(args) : null;
  if (watchArgs) {
    const { dir, worktree, idleMinutes, restart } = watchArgs;
    // Check-then-write is not atomic, which is fine: reviews start one at a time.
    const holder = readJson(path.join(dir, 'session.json'))?.watcherPid;
    if (holder && holder !== process.pid && isRunning(holder)) {
      console.log(`held: ${holder} watches this review (remove session.json if that process is not a watch)`);
      return 4;
    }
    writeSession(dir, worktree, process.pid, restart);
    watchReview(dir, (line) => console.log(`EVENT ${line}`), (paused) => console.log(paused ? 'PAUSED' : 'RESUMED'), 300, {
      idleMinutes,
      restart,
      onIdle: () => {
        console.log('IDLE');
        process.exit(0);
      },
    });
    return undefined;
  }
  if (command === 'stack' && args.length === 2) {
    const stack = readStack(args[0], args[1]);
    console.log(JSON.stringify(stack));
    return stack && stack.split ? 3 : 0;
  }
  if (command === 'own-diff' && args.length === 3) {
    process.stdout.write(ownDiff(args[0], args[1], args[2]));
    return 0;
  }
  if (command === 'waiting' && args.length >= 2 && args[0].trim() && args.slice(1).every((dir) => fs.existsSync(dir))) {
    setWaiting(args.slice(1), args[0]);
    return 0;
  }
  if (command === 'answered' && args.length >= 1 && args.every((dir) => fs.existsSync(dir))) {
    setWaiting(args, null);
    return 0;
  }
  if (command === 'preparing' && args.length === 2 && args[1].trim() && fs.existsSync(args[0])) {
    setPreparing(args[0], args[1]);
    return 0;
  }
  if (command === 'prepared' && args.length === 1 && fs.existsSync(args[0])) {
    setPreparing(args[0], null);
    return 0;
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
  console.error('Usage: node review-data.js dir <owner>/<repo> <pr-number> | hunks <diff-file> <review-file> [--whole <path>]... | check <review-file> | watch <review-dir> [--worktree <path>] [--idle-minutes <n>] [--restart] | waiting <question> <review-dir>... | answered <review-dir>... | preparing <review-dir> <step> | prepared <review-dir> | stack <owner>/<repo> <pr-number> | own-diff <clone> <old-head> <first-subject> | list');
  return 2;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseDiff, mergeHunks, checkFlows, parseWatchArgs };
