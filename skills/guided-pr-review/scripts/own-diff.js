// The own diff of a PR as it was before a rebase, so the old hunk IDs can be matched to the new ones.
'use strict';

const { execFileSync } = require('child_process');

const git = (clone, ...args) => execFileSync('git', args, { cwd: clone, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// After a rebase, oldHead is no longer on the PR branch, and the diff against the old base holds the lower PR too.
// The parent of the PR's first commit is the old base, found by that commit's subject.
function ownDiff(clone, oldHead, firstSubject) {
  const first = git(clone, 'log', '--format=%H%x00%s', '-n', '500', oldHead, '--')
    .split('\n')
    .map((line) => line.split('\0'))
    .filter(([, subject]) => subject === firstSubject);
  if (!first.length) throw new Error(`no commit with subject ${firstSubject}`);
  // Two commits with one subject: guessing the first one would give a wrong diff.
  if (first.length > 1) throw new Error(`subject matches more than one commit: ${first.map(([sha]) => sha.slice(0, 7)).join(', ')}`);
  return git(clone, 'diff', `${first[0][0]}^`, oldHead);
}

module.exports = { ownDiff };
