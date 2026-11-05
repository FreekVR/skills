'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js

const test = require('node:test');
const assert = require('node:assert');
const { fromGitHubStack, fromBranches } = require('../scripts/stack.js');

function pull(number, head, base, extra = {}) {
  return { number, title: `PR ${number}`, html_url: `https://github.com/example-org/sample-widget/pull/${number}`, state: 'open', merged_at: null, draft: false, head: { ref: head, repo: { full_name: 'example-org/sample-widget' } }, base: { ref: base, repo: { full_name: 'example-org/sample-widget' } }, ...extra };
}

const OPEN = [pull(15, 'a', 'main'), pull(16, 'b', 'a'), pull(17, 'c', 'b'), pull(20, 'x', 'main')];

test("fromGitHubStack keeps GitHub's bottom-to-top order and marks merged PRs", () => {
  const stack = { number: 31, base: { ref: 'main' }, pull_requests: [{ number: 14, state: 'closed', merged_at: '2026-10-01T00:00:00Z' }, { number: 15, state: 'open' }] };
  const pulls = [pull(14, 'a', 'main', { state: 'closed', merged_at: '2026-10-01T00:00:00Z' }), pull(15, 'b', 'a')];
  const result = fromGitHubStack(stack, pulls);
  assert.deepStrictEqual(result.prs.map((p) => [p.number, p.state]), [[14, 'merged'], [15, 'open']]);
  assert.strictEqual(result.number, 31);
  assert.strictEqual(result.source, 'github');
  assert.strictEqual(result.base, 'main');
  assert.deepStrictEqual(result.prs[1], { number: 15, title: 'PR 15', url: 'https://github.com/example-org/sample-widget/pull/15', state: 'open', draft: false, head: 'b', base: 'a' });
});

test('fromBranches follows the bases down to the trunk and the heads up', () => {
  const result = fromBranches(16, OPEN);
  assert.deepStrictEqual(result.prs.map((p) => p.number), [15, 16, 17]);
  assert.strictEqual(result.number, null);
  assert.strictEqual(result.source, 'branches');
  assert.strictEqual(result.base, 'main');
});

test('fromBranches reports a split above a PR', () => {
  const result = fromBranches(16, [...OPEN, pull(18, 'd', 'b')]);
  assert.deepStrictEqual(result, { split: { base: 'b', prs: [17, 18] } });
});

test('fromBranches returns null for a PR that is no base and has no stacked base', () => {
  assert.strictEqual(fromBranches(20, OPEN), null);
});

test('fromGitHubStack marks a closed PR that is not merged, and keeps draft', () => {
  const stack = { number: 31, base: { ref: 'main' }, pull_requests: [{ number: 14 }, { number: 15 }] };
  const result = fromGitHubStack(stack, [pull(14, 'a', 'main', { state: 'closed' }), pull(15, 'b', 'a', { draft: true })]);
  assert.deepStrictEqual(result.prs.map((p) => [p.state, p.draft]), [['closed', false], ['open', true]]);
});

test('fromGitHubStack returns null for a stack of fewer than 2 PRs', () => {
  assert.strictEqual(fromGitHubStack({ number: 31, base: { ref: 'main' }, pull_requests: [{ number: 15 }] }, [pull(15, 'a', 'main')]), null);
});

test('fromBranches ignores a PR from a fork or a deleted fork that has the asked PR head as its base', () => {
  const fork = pull(40, 'f', 'feature', { head: { ref: 'f', repo: { full_name: 'someone/sample-widget' } } });
  const deleted = pull(41, 'g', 'feature', { head: { ref: 'g', repo: null } });
  const asked = pull(30, 'feature', 'main');
  assert.strictEqual(fromBranches(30, [asked, fork, deleted]), null);
  assert.deepStrictEqual(fromBranches(30, [asked, fork, deleted, pull(42, 'h', 'feature')]).prs.map((p) => p.number), [30, 42]);
});
