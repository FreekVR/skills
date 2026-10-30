// The review directories in the per-user state directory: where they are, who reviews them, and their events.
// The review server bundles this file, so it MUST NOT have a command line of its own.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function stateRoot() {
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'guided-pr-review');
}

function reviewDir(repository, number) {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo || !/^\d+$/.test(String(number))) {
    throw new Error('Expected <owner>/<repo> <pr-number>');
  }
  return path.join(stateRoot(), owner, repo, String(number));
}

// A resume overwrites the file, so it always names the session that runs the review now.
// watcherPid is the process that prints the review's events to the agent; while it runs, an agent is connected.
function writeSession(dir, worktree = null, watcherPid = null) {
  const session = { sessionId: process.env.CLAUDE_CODE_SESSION_ID || null, cwd: process.cwd(), worktree, watcherPid };
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session) + '\n');
  return session;
}

// A file that is missing, or broken by a crash or a write still in progress, counts as absent,
// so one bad review directory does not hide the others.
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

function subdirectories(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
}

// A server that stopped without removing its URL, for example after a kill -9, no longer has a process.
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// Calls onLine for each line added to the file after the watch started.
function watchEvents(file, onLine, interval = 300) {
  let offset = fs.existsSync(file) ? fs.statSync(file).size : 0;
  let rest = '';
  const read = () => {
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (size <= offset) return;
    const handle = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(size - offset);
    fs.readSync(handle, buffer, 0, buffer.length, offset);
    fs.closeSync(handle);
    offset = size;
    const lines = (rest + buffer.toString('utf8')).split('\n');
    rest = lines.pop();
    lines.filter(Boolean).forEach(onLine);
  };
  const timer = setInterval(read, interval);
  return () => clearInterval(timer);
}

function listReviews(root = stateRoot()) {
  const reviews = [];
  for (const owner of subdirectories(root)) {
    for (const repo of subdirectories(path.join(root, owner))) {
      for (const number of subdirectories(path.join(root, owner, repo))) {
        const dir = path.join(root, owner, repo, number);
        const review = readJson(path.join(dir, 'review.json'));
        if (!review) continue;
        const server = readJson(path.join(dir, 'server.json'));
        const session = readJson(path.join(dir, 'session.json'));
        reviews.push({
          owner, repo, number: Number(number), dir,
          title: review.pr?.title || '',
          state: review.remote?.state || 'open',
          session,
          agentConnected: Boolean(session?.watcherPid && isRunning(session.watcherPid)),
          url: server && isRunning(server.pid) ? server.url : null,
        });
      }
    }
  }
  return reviews;
}

// Write to a temporary file first, so the agent never reads a half-written file.
function writeAtomic(file, content) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

// Only a file that the pull request changes and keeps is served, so the page cannot read anything else on disk.
function changedFile(dir, asked) {
  const review = readJson(path.join(dir, 'review.json'));
  const hunk = review?.hunks.find((candidate) => candidate.file === asked && candidate.status !== 'removed');
  return hunk ? { path: hunk.file, localPath: review.pr?.localPath } : null;
}

function revealInFolder(file) {
  const [command, args] = process.platform === 'darwin' ? ['open', ['-R', file]]
    : process.platform === 'win32' ? ['explorer', [`/select,${file}`]]
    : ['xdg-open', [path.dirname(file)]];
  return new Promise((resolve, reject) => execFile(command, args, (error) => (error ? reject(error) : resolve())));
}

// True while an agent's watch process runs for any review; reads only the small session.json files.
function anyAgentConnected(root = stateRoot()) {
  for (const owner of subdirectories(root)) {
    for (const repo of subdirectories(path.join(root, owner))) {
      for (const number of subdirectories(path.join(root, owner, repo))) {
        const pid = readJson(path.join(root, owner, repo, number, 'session.json'))?.watcherPid;
        if (pid && isRunning(pid)) return true;
      }
    }
  }
  return false;
}

module.exports = { stateRoot, reviewDir, writeSession, readJson, isRunning, watchEvents, listReviews, anyAgentConnected, writeAtomic, changedFile, revealInFolder };
