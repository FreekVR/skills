// The stack a PR is part of: read from GitHub's stack, or worked out from the branches of the open PRs.
'use strict';

function entry(pull) {
  const state = pull.merged_at ? 'merged' : pull.state === 'closed' ? 'closed' : 'open';
  return { number: pull.number, title: pull.title, url: pull.html_url, state, draft: Boolean(pull.draft), head: pull.head.ref, base: pull.base.ref };
}

// stack is GitHub's stack object, pulls are the full pull objects of its PRs.
// A stack of fewer than 2 PRs is no stack.
function fromGitHubStack(stack, pulls) {
  if (stack.pull_requests.length < 2) return null;
  const byNumber = new Map(pulls.map((pull) => [pull.number, pull]));
  return {
    number: stack.number,
    source: 'github',
    base: stack.base.ref,
    prs: stack.pull_requests.map((pr) => entry(byNumber.get(pr.number))),
  };
}

// Walk down while an open PR has the current base as its head, and up while exactly one open PR has
// the current head as its base. A PR alone in its chain is in no stack.
function fromBranches(number, allOpenPulls) {
  // A PR from a fork (or from a deleted fork, head.repo null) can have any head name, such as main, so it never joins a stack.
  const openPulls = allOpenPulls.filter((pull) => pull.head.repo?.full_name === pull.base.repo?.full_name);
  const start = openPulls.find((pull) => pull.number === number);
  if (!start) return null;
  const chain = [start];
  let below = openPulls.find((pull) => pull.head.ref === chain[0].base.ref);
  while (below && !chain.includes(below)) {
    chain.unshift(below);
    below = openPulls.find((pull) => pull.head.ref === chain[0].base.ref);
  }
  for (;;) {
    const top = chain[chain.length - 1];
    const above = openPulls.filter((pull) => pull.base.ref === top.head.ref && !chain.includes(pull));
    if (above.length > 1) return { split: { base: top.head.ref, prs: above.map((pull) => pull.number) } };
    if (!above.length) break;
    chain.push(above[0]);
  }
  if (chain.length < 2) return null;
  return { number: null, source: 'branches', base: chain[0].base.ref, prs: chain.map(entry) };
}

// Whether a user's latest review of a PR is an approval. Comments and a pending review do not count as a review here.
function approvedBy(reviews, login) {
  const own = reviews.filter((review) => review.user?.login === login && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state));
  return own.at(-1)?.state === 'APPROVED';
}

module.exports = { fromGitHubStack, fromBranches, approvedBy };
