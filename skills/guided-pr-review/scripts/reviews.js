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
function writeSession(dir, worktree = null, watcherPid = null, restart = false) {
  const session = { sessionId: process.env.CLAUDE_CODE_SESSION_ID || null, cwd: process.cwd(), worktree, watcherPid };
  // Only a restart of a watch that ended keeps the time of the last event and the place in events.jsonl it read up to;
  // a start or resume gets a fresh idle limit and reads from the end.
  const previous = restart ? readJson(path.join(dir, 'session.json')) : null;
  if (previous?.lastEventAt) session.lastEventAt = previous.lastEventAt;
  if (Number.isInteger(previous?.eventsOffset)) session.eventsOffset = previous.eventsOffset;
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

// Calls onLine for each line added to the file after the watch started, or after startOffset when that is given: those
// lines are read at once. onOffset gets the byte offset up to which complete lines are read, after each read.
function watchEvents(file, onLine, interval = 300, startOffset = null, onOffset = () => {}) {
  let offset = startOffset ?? (fs.existsSync(file) ? fs.statSync(file).size : 0);
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
    onOffset(offset - Buffer.byteLength(rest));
  };
  if (startOffset !== null) read();
  const timer = setInterval(read, interval);
  return () => clearInterval(timer);
}

// While the review server keeps a `paused` file in the review directory, the agent gets no events: check events are
// dropped, because they only poll GitHub, and the others wait until the reviewer presses play.
// onPause tells the agent when a pause starts and ends, so a quiet page does not look like a closed one.
// onIdle runs when no event other than check came for idleMinutes, also while paused. The page sends a check every
// 5 minutes while it is open, so checks must not keep the agent alive. An event counts when it arrives, also while it
// is held. session.json keeps lastEventAt and eventsOffset (how far events.jsonl is read), so a restart of a watch
// that ended (restart: true) prints the events written in the gap and can tell at once that the review was quiet.
function watchReview(dir, print, onPause, interval = 300, { idleMinutes = 30, onIdle = () => {}, restart = false } = {}) {
  const sessionFile = path.join(dir, 'session.json');
  const idleMs = idleMinutes * 60000;
  const save = (fields) => {
    const session = readJson(sessionFile);
    if (session) writeAtomic(sessionFile, JSON.stringify({ ...session, ...fields }) + '\n');
  };
  const eventsFile = path.join(dir, 'events.jsonl');
  const saved = readJson(sessionFile);
  let lastEventAt = new Date(saved?.lastEventAt || Date.now());
  if (!saved?.lastEventAt) save({ lastEventAt: lastEventAt.toISOString() });
  const startOffset = restart && Number.isInteger(saved?.eventsOffset) ? saved.eventsOffset : null;
  let idle = false;
  const checkIdle = () => {
    if (idle || Date.now() - lastEventAt.getTime() < idleMs) return;
    idle = true;
    onIdle();
  };
  const held = [];
  let wasPaused = false;
  // Both the timer and a new event check the pause here, so the agent always reads RESUMED before the events it lets go.
  const sync = () => {
    const paused = fs.existsSync(path.join(dir, 'paused'));
    if (paused !== wasPaused) onPause(paused);
    wasPaused = paused;
    if (!paused) held.splice(0).forEach(print);
    return paused;
  };
  const stopEvents = watchEvents(eventsFile, (line) => {
    const isCheck = JSON.parse(line).type === 'check';
    if (!isCheck) {
      lastEventAt = new Date();
      save({ lastEventAt: lastEventAt.toISOString() });
    }
    if (!sync()) print(line);
    else if (!isCheck) held.push(line);
  }, interval, startOffset, (eventsOffset) => save({ eventsOffset }));
  if (startOffset === null) save({ eventsOffset: fs.existsSync(eventsFile) ? fs.statSync(eventsFile).size : 0 });
  const timer = setInterval(() => {
    sync();
    checkIdle();
  }, interval);
  checkIdle();
  return () => {
    stopEvents();
    clearInterval(timer);
  };
}

function listReviews(root = stateRoot()) {
  const reviews = [];
  for (const owner of subdirectories(root)) {
    for (const repo of subdirectories(path.join(root, owner))) {
      for (const number of subdirectories(path.join(root, owner, repo))) {
        const dir = path.join(root, owner, repo, number);
        const review = readJson(path.join(dir, 'review.json'));
        if (!review) continue;
        const session = readJson(path.join(dir, 'session.json'));
        const { connected, paused } = agentStatus(dir);
        reviews.push({
          owner, repo, number: Number(number), dir,
          title: review.pr?.title || '',
          state: review.remote?.state || 'open',
          session,
          agentConnected: connected,
          paused,
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

// What the stack bar shows for each PR: whether it has a review, how far the reviewer is, and whether the review is posted.
// A final review posted before the latest commits does not count as posted.
function stackStatus(owner, repo, numbers, root = stateRoot()) {
  return numbers.filter((number) => /^\d+$/.test(String(number))).map((number) => {
    const dir = path.join(root, owner, repo, String(number));
    const review = readJson(path.join(dir, 'review.json'));
    const reviewer = readJson(path.join(dir, 'reviewer.json')) || {};
    const sent = reviewer.sent || [];
    const hunkIds = new Set((review?.hunks || []).map((hunk) => hunk.id));
    const watcherPid = readJson(path.join(dir, 'session.json'))?.watcherPid;
    const criteria = {};
    for (const ticket of review?.context?.tickets || []) {
      for (const criterion of ticket.acceptanceCriteria || []) criteria[criterion.id] = criterion.verdict;
    }
    return {
      number,
      page: `/${owner}/${repo}/${number}`,
      hasReview: Boolean(review),
      preparing: fs.existsSync(path.join(dir, 'preparing')),
      agentConnected: Boolean(watcherPid && isRunning(watcherPid)),
      hunks: hunkIds.size,
      seen: (reviewer.seen || []).filter((id) => hunkIds.has(id)).length,
      remarks: (reviewer.remarks || []).length,
      posted: (review?.posts || []).some((post) => post.status === 'posted' && sent.some((event) => event.id === post.eventId && event.type === 'post' && event.kind === 'final' && event.headSha === review.pr?.headSha)),
      criteria,
    };
  });
}

// The agent writes the question it waits on into every review it handles, so each review page can show it.
function setWaiting(dirs, question) {
  for (const dir of dirs) {
    if (question === null) fs.rmSync(path.join(dir, 'waiting'), { force: true });
    else writeAtomic(path.join(dir, 'waiting'), JSON.stringify({ question, since: new Date().toISOString() }) + '\n');
  }
}

function readWaiting(dir) {
  return readJson(path.join(dir, 'waiting'));
}

// Whether an agent watches this review, whether the reviewer paused it, the question the agent waits on,
// and the session to resume when no agent runs.
function agentStatus(dir) {
  const session = readJson(path.join(dir, 'session.json'));
  const watcherPid = session?.watcherPid;
  return {
    session: session ? { sessionId: session.sessionId || null, cwd: session.cwd || null } : null,
    connected: Boolean(watcherPid && isRunning(watcherPid)),
    paused: fs.existsSync(path.join(dir, 'paused')),
    waiting: readWaiting(dir),
  };
}

module.exports = { stackStatus, setWaiting, readWaiting, agentStatus, stateRoot, reviewDir, writeSession, readJson, isRunning, watchEvents, watchReview, listReviews, anyAgentConnected, writeAtomic, changedFile, revealInFolder };
