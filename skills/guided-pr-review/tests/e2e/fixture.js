'use strict';
// A made-up review that holds one of each thing the review page can show.

const H = {
  cache: 'aaaaaaaaaaa1',
  client: 'aaaaaaaaaaa2',
  card: 'aaaaaaaaaaa3',
  rename: 'aaaaaaaaaaa4',
  logo: 'aaaaaaaaaaa5',
  lock: 'aaaaaaaaaaa6',
  format: 'aaaaaaaaaaa7',
};

function review() {
  return {
    pr: {
      owner: 'example-org', repo: 'sample-widget', number: 17,
      title: 'feat: add three-day forecast', url: 'https://github.com/example-org/sample-widget/pull/17',
      author: 'sample-author', isOwnPr: false, headSha: 'aaa111', body: 'Adds a **three-day** forecast card.\n\nRefs WX-42',
    },
    viewer: { login: 'sample-reviewer' },
    context: {
      summary: 'The PR fetches a three-day forecast and shows it in a card.',
      tickets: [
        { key: 'WX-42', title: 'Three-day forecast', url: 'https://tracker.example/WX-42',
          acceptanceCriteria: [
            { id: 'WX-42#1', text: 'Shows three days with min and max temperature.', source: 'ticket', verdict: 'met', note: 'The card renders three days.' },
            { id: 'WX-42#2', text: 'Caches the forecast for one hour.', source: 'ticket', verdict: 'not-met', note: 'The TTL is one minute.' },
          ] },
      ],
      relatedTickets: [{ key: 'WX-57', title: 'Cache forecasts per region', url: 'https://tracker.example/WX-57' }],
      linkedPrs: [{ repo: 'example-org/sample-api', number: 8, url: 'https://github.com/example-org/sample-api/pull/8', title: 'feat: forecast endpoint', state: 'MERGED', summary: 'Adds the endpoint this PR calls.' }],
      skipped: ['Confluence: no tool can read Confluence'],
      coverage: { source: 'CI check "coverage"', summary: 'Line coverage 81%, the new card has no test.' },
    },
    conventions: {
      severities: ['nit', 'minor', 'medium', 'major'],
      requestChangesFrom: 'minor',
      disclosure: { comment: '_Written by AI_', review: '_Contains AI findings_' },
    },
    layout: 'flows',
    hunks: [
      { id: H.cache, file: 'src/cache.ts', status: 'modified', oldStart: 1, oldLines: 3, newStart: 1, newLines: 3, context: 'export class Cache {',
        lines: [' export const NAME = "cache";', '-const TTL = 60;', '+const TTL = 60 * 1000;', ' const MAX = 10;'],
        explanation: 'The cache keeps forecasts longer.' },
      { id: H.client, file: 'src/api/weatherClient.ts', status: 'modified', oldStart: 10, oldLines: 2, newStart: 10, newLines: 3, context: 'export async function fetchForecast() {',
        lines: [' const url = base + "/forecast";', '+const days = 3;', ' return get(url);'],
        explanation: 'The client asks for three days.' },
      { id: H.card, file: 'src/components/ForecastCard.tsx', status: 'added', oldStart: 0, oldLines: 0, newStart: 1, newLines: 3, context: '',
        lines: ['+export function ForecastCard({ days }) {', '+  return days.map(renderDay);', '+}'],
        explanation: 'A new card shows the days.' },
      { id: H.rename, file: 'src/new/legacy.ts', oldFile: 'src/old/legacy.ts', status: 'renamed', binary: false, lines: [], explanation: 'The file moved.' },
      { id: H.logo, file: 'docs/logo.png', oldFile: 'docs/logo.png', status: 'added', binary: true, lines: [], explanation: 'A new logo.' },
      { id: H.lock, file: 'package-lock.json', status: 'modified', oldStart: 1, oldLines: 41, newStart: 1, newLines: 41, context: '',
        lines: ['   "name": "sample-widget",', '-  "version": "1.0.0",', '+  "version": "1.1.0",', '@@ -40,2 +40,2 @@', '-  "lockfileVersion": 2', '+  "lockfileVersion": 3', ' }'],
        explanation: 'The lockfile follows the version.' },
      { id: H.format, file: 'src/utils/format.ts', status: 'modified', oldStart: 5, oldLines: 1, newStart: 5, newLines: 1, context: '',
        lines: ['-export const unit = "C";', '+export const unit = "°C";'],
        explanation: 'The unit gets a degree sign.' },
    ],
    flows: [
      { id: 'forecast-read', name: 'Show the forecast', icon: 'cloud-sun', entry: 'src/api/weatherClient.ts:fetchForecast()', end: 'src/components/ForecastCard.tsx:<ForecastCard>',
        explanation: 'From the request to the card.', acceptanceCriteria: ['WX-42#1'],
        steps: [{ hunkId: H.client, why: 'The client fetches three days.' }, { hunkId: H.cache, why: 'The cache keeps what was fetched.' }, { hunkId: H.card, why: 'The card shows it.' }] },
      { id: 'forecast-store', name: 'Store the forecast', icon: 'database', entry: 'src/cache.ts:Cache', end: 'package-lock.json',
        explanation: 'How long forecasts stay.', acceptanceCriteria: ['WX-42#2'],
        steps: [{ hunkId: H.cache, why: 'The TTL decides how long.' }, { hunkId: H.lock, why: 'The version bump.' }] },
      { id: 'files', name: 'Moved and added files', icon: 'folder', entry: 'src/old/legacy.ts', end: 'docs/logo.png',
        explanation: 'Files without line changes.', acceptanceCriteria: [], noCriteria: 'These files change no behaviour.',
        steps: [{ hunkId: H.rename, why: 'The move.' }, { hunkId: H.logo, why: 'The logo.' }] },
    ],
    notInAnyFlow: [H.format],
    findings: [
      { id: 'f1', hunkId: H.cache, line: 2, side: 'RIGHT', severity: 'major', title: 'TTL is in milliseconds', body: 'The TTL is 60 seconds, not one hour.', rule: 'correctness' },
      { id: 'f2', hunkId: H.card, line: 2, side: 'RIGHT', severity: 'nit', title: 'Name the map callback', body: 'Use a named function for readability.', rule: 'style' },
      { id: 'f3', hunkId: null, severity: 'medium', title: 'No test for the card', body: 'The new card has no test.', rule: 'tests' },
    ],
    reviews: [
      { id: 501, author: 'other-reviewer', state: 'CHANGES_REQUESTED', submittedAt: '2026-10-20T09:00:00Z', url: 'https://github.com/example-org/sample-widget/pull/17#pullrequestreview-501', body: 'Please check the TTL.' },
      { id: 502, author: 'sample-reviewer', state: 'COMMENTED', submittedAt: '2026-10-21T09:00:00Z', url: 'https://github.com/example-org/sample-widget/pull/17#pullrequestreview-502', body: 'First round.' },
    ],
    reviewComments: [
      { id: 'c1', reviewId: 501, threadId: 'T-c1', author: 'other-reviewer', url: 'https://github.com/example-org/sample-widget/pull/17#discussion_r1', hunkId: H.client, path: 'src/api/weatherClient.ts', line: 11, side: 'RIGHT',
        body: 'Should days come from the settings?', diffHunk: '@@ -10,2 +10,3 @@\n const url = base + "/forecast";\n+const days = 3;', resolved: false,
        replies: [{ author: 'sample-author', body: 'Good idea, later.', at: '2026-10-20T10:00:00Z' }],
        opinion: { stance: 'agree', text: 'A setting avoids a deploy for a change.' },
        fix: { verdict: 'not-fixed', note: 'Line 11 still has the constant.' } },
      { id: 'c2', reviewId: 501, threadId: 'T-c2', author: 'other-reviewer', url: 'https://github.com/example-org/sample-widget/pull/17#discussion_r2', hunkId: null, path: 'README.md', line: 3, side: 'RIGHT',
        body: 'The README does not mention the card.', diffHunk: '', resolved: false, replies: [],
        opinion: { stance: 'unsure', text: 'The README may not list components.' } },
    ],
    ownRemarks: [
      { id: 'gh-1', state: 'posted', reviewId: 502, threadId: 'T-gh1', hunkId: H.cache, path: 'src/cache.ts', line: 3, side: 'RIGHT',
        body: 'Is MAX still right?', severity: 'minor', url: 'https://github.com/example-org/sample-widget/pull/17#discussion_r3',
        diffHunk: '@@ -1,3 +1,3 @@\n export const NAME = "cache";\n-const TTL = 60;\n+const TTL = 60 * 1000;\n const MAX = 10;', resolved: false, outdated: false, canResolve: true, replies: [],
        opinion: { stance: 'disagree', text: 'MAX does not depend on the TTL.' },
        fix: { verdict: 'not-fixed', note: 'No commit changed line 3.', reply: 'MAX is still 10.' } },
      { id: 'gh-2', state: 'pending', hunkId: H.card, path: 'src/components/ForecastCard.tsx', line: 1, side: 'RIGHT',
        body: 'Add a docblock.', severity: 'nit', opinion: { stance: 'agree', text: 'Exported components need one.' } },
    ],
    ownPendingReview: { id: 555, body: 'Pending summary from GitHub.' },
    answers: [],
    posts: [],
    remote: { checkedAt: '2026-10-30T09:00:00Z', state: 'open', headSha: 'aaa111' },
  };
}

module.exports = { review, H };
