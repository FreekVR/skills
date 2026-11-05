#!/usr/bin/env node
// Usage: node review-server.js
// Starts the review page server for all reviews, or finds the one that runs, and prints "READY <url>".
// The server stops itself after some time with no connected agent.
'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { stateRoot, readJson, isRunning } = require('./reviews.js');

const ENTRY = path.join(__dirname, '..', '.output', 'server', 'index.mjs');
// A fixed port keeps the URL of a review the same between sessions.
const PORT = 4317;

// Resolves the port when it can be bound, or null; port 0 asks the system for a free one.
function probe(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(null));
    server.listen(port, '127.0.0.1', () => {
      const bound = server.address().port;
      server.close(() => resolve(bound));
    });
  });
}

// Resolves true once the server at url is the process pid, and false when that process exits first.
async function startedAs(url, pid, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end && isRunning(pid)) {
    try {
      const response = await fetch(`${url}api/server`);
      if (response.ok && (await response.json()).pid === pid) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function spawnServer(root, port) {
  const log = fs.openSync(path.join(root, 'server.log'), 'a');
  const child = spawn(process.execPath, [ENTRY], {
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port) },
  });
  child.unref();
  return child.pid;
}

async function main() {
  const root = stateRoot();
  const record = path.join(root, 'server.json');
  const running = readJson(record);
  // A process ID can be reused, so the recorded server must also answer as itself.
  if (running && await startedAs(running.url, running.pid, 2000)) {
    console.log(`READY ${running.url}`);
    return 0;
  }
  fs.mkdirSync(root, { recursive: true });
  // Another launcher may take the fixed port between the check and the start; the second try uses a free port.
  for (let attempt = 0; attempt < 2; attempt++) {
    const port = (attempt === 0 && await probe(PORT)) || await probe(0);
    const url = `http://127.0.0.1:${port}/`;
    const pid = spawnServer(root, port);
    if (await startedAs(url, pid)) {
      fs.writeFileSync(record, JSON.stringify({ url, pid }) + '\n');
      console.log(`READY ${url}`);
      return 0;
    }
  }
  console.error(`The review server did not start. See ${path.join(root, 'server.log')}.`);
  return 1;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; });
}
