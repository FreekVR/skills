#!/usr/bin/env node
// Usage: node serve.js <review-dir>
// Serves the review page on 127.0.0.1 and prints one line per reviewer event to stdout.
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { listReviews } = require('./review-data.js');

const TEMPLATE = path.join(__dirname, '..', 'assets', 'review.html');
const MAX_BODY_BYTES = 5 * 1024 * 1024;

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(response, status, type, body) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
}

function sendFile(response, file, type, fallback) {
  try {
    return send(response, 200, type, fs.readFileSync(file));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return fallback === undefined ? send(response, 404, 'text/plain', 'not found') : send(response, 200, type, fallback);
  }
}

// Write to a temporary file first, so the agent never reads a half-written reviewer.json.
function writeAtomic(file, content) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

// Only a file that the pull request changes and keeps is served, so the page cannot read anything else on disk.
function changedFile(reviewFile, asked) {
  const review = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
  const hunk = review.hunks.find((candidate) => candidate.file === asked && candidate.status !== 'removed');
  return hunk ? { path: hunk.file, localPath: review.pr?.localPath } : null;
}

function revealInFolder(file) {
  const [command, args] = process.platform === 'darwin' ? ['open', ['-R', file]]
    : process.platform === 'win32' ? ['explorer', [`/select,${file}`]]
    : ['xdg-open', [path.dirname(file)]];
  return new Promise((resolve, reject) => execFile(command, args, (error) => (error ? reject(error) : resolve())));
}

function createHandler(reviewDir, log) {
  const reviewFile = path.join(reviewDir, 'review.json');
  const reviewerFile = path.join(reviewDir, 'reviewer.json');
  const eventsFile = path.join(reviewDir, 'events.jsonl');

  return async (request, response) => {
    try {
      const route = `${request.method} ${request.url.split('?')[0]}`;
      if (route === 'GET /') {
        return sendFile(response, TEMPLATE, 'text/html; charset=utf-8');
      }
      if (route === 'GET /reviews') {
        const reviews = listReviews().map(({ dir, ...review }) => ({ ...review, current: path.resolve(dir) === path.resolve(reviewDir) }));
        return send(response, 200, 'application/json', JSON.stringify(reviews));
      }
      if (route === 'GET /review.json') {
        return sendFile(response, reviewFile, 'application/json');
      }
      if (route === 'GET /reviewer.json') {
        return sendFile(response, reviewerFile, 'application/json', '{}');
      }
      if (route === 'PUT /reviewer.json') {
        const body = await readBody(request);
        JSON.parse(body);
        writeAtomic(reviewerFile, body);
        return send(response, 204, 'text/plain', '');
      }
      if (route === 'GET /file') {
        const file = changedFile(reviewFile, new URL(request.url, 'http://localhost').searchParams.get('path'));
        if (!file) return send(response, 404, 'text/plain', 'not found');
        const root = file.localPath || path.join(reviewDir, 'files');
        return sendFile(response, path.join(root, file.path), 'text/plain; charset=utf-8');
      }
      if (route === 'POST /open') {
        // A plain cross-site form cannot set this header, so another web page cannot make the server open folders.
        if (request.headers['x-guided-review'] !== '1') return send(response, 403, 'text/plain', 'forbidden');
        const file = changedFile(reviewFile, JSON.parse(await readBody(request)).path);
        if (!file || !file.localPath) return send(response, 404, 'text/plain', 'not found');
        await revealInFolder(path.join(file.localPath, file.path));
        return send(response, 204, 'text/plain', '');
      }
      if (route === 'POST /events') {
        const event = JSON.parse(await readBody(request));
        const stored = { ...event, id: crypto.randomUUID(), at: new Date().toISOString() };
        const line = JSON.stringify(stored);
        fs.appendFileSync(eventsFile, line + '\n');
        log(`EVENT ${line}`);
        return send(response, 200, 'application/json', JSON.stringify({ id: stored.id }));
      }
      return send(response, 404, 'text/plain', 'not found');
    } catch (error) {
      return send(response, 400, 'text/plain', String(error.message || error));
    }
  };
}

function main(argv) {
  const reviewDir = argv[0];
  if (!reviewDir || !fs.existsSync(path.join(reviewDir, 'review.json'))) {
    console.error('Usage: node serve.js <review-dir>. The directory must contain review.json.');
    process.exit(2);
  }
  const server = http.createServer(createHandler(reviewDir, console.log));
  server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/`;
    // The review pages of other reviews link to this one; listReviews skips it once this process is gone.
    writeAtomic(path.join(reviewDir, 'server.json'), JSON.stringify({ url, pid: process.pid }) + '\n');
    console.log(`READY ${url}`);
  });
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { createHandler };
