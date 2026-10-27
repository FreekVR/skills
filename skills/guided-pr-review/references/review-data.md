# Review data

The review page and the agent share three files in the review directory. Each file has one writer.

| File | Writer | Reader | Content |
| --- | --- | --- | --- |
| `review.json` | agent | review page | The PR, context, flows, hunks, AI findings, answers, post results |
| `reviewer.json` | review page | agent | What the reviewer has seen, decided and written |
| `events.jsonl` | review page | agent | One JSON object per line: questions, "explain more" requests, post requests |

Only the writer in the table MAY write a file. The review page reloads `review.json` every few seconds, so the agent's changes show up without a page reload.

## review.json

```json
{
  "pr": {
    "owner": "example-org", "repo": "sample-widget", "number": 17,
    "title": "feat: add three-day forecast", "url": "https://github.com/example-org/sample-widget/pull/17",
    "author": "sample-author", "isOwnPr": false, "headSha": "<sha>", "body": "<the PR description, verbatim>",
    "localPath": "<big PR only: absolute path of the worktree>"
  },
  "context": {
    "summary": "<two or three sentences: what the PR does and why>",
    "tickets": [
      { "key": "WX-42", "title": "Three-day forecast", "url": "<url>",
        "acceptanceCriteria": [ { "id": "WX-42#1", "text": "Shows three days with min and max temperature.", "source": "ticket", "verdict": "met", "note": "<one line: why>" } ] }
    ],
    "relatedTickets": [ { "key": "WX-57", "title": "Cache forecasts per region", "url": "<url>" } ],
    "linkedPrs": [ { "repo": "example-org/sample-api", "number": 8, "url": "<url>", "title": "<title>", "state": "MERGED", "summary": "<one line>" } ],
    "skipped": [ "<what was not read and why, for example: Jira: no tool can read Jira>" ],
    "coverage": { "source": "<CI check or bot comment, with link>", "summary": "<one line>" }
  },
  "conventions": {
    "severities": ["nit", "minor", "medium", "major"],
    "requestChangesFrom": "minor",
    "disclosure": { "comment": "<text appended to each comment the AI wrote, or empty>", "review": "<text appended to the review body when it holds AI findings, or empty>" }
  },
  "layout": "flows",
  "hunks": [
    { "id": "3f2a9c1d0b7e", "file": "src/cache.ts", "status": "modified", "oldStart": 1, "oldLines": 3, "newStart": 1, "newLines": 3,
      "context": "export class Cache {", "lines": ["-const TTL = 60;", "+const TTL = 60 * 1000;"],
      "explanation": "<short>", "explanationMore": "<longer, only after an explain event>" }
  ],
  "flows": [
    { "id": "forecast-read", "name": "Show the forecast", "icon": "cloud-sun", "entry": "src/api/weatherClient.ts:fetchForecast()", "end": "src/components/ForecastCard.tsx:<ForecastCard>",
      "explanation": "<short>", "acceptanceCriteria": ["WX-42#1"], "noCriteria": "<only when acceptanceCriteria is empty: one line, why no criterion applies>",
      "steps": [ { "hunkId": "3f2a9c1d0b7e", "why": "The cache stores what the client fetched." } ] }
  ],
  "notInAnyFlow": [],
  "findings": [
    { "id": "f1", "hunkId": "3f2a9c1d0b7e", "line": 1, "side": "RIGHT", "severity": "major",
      "title": "<one line>", "body": "<the comment text as it will be posted>", "rule": "<which review rule found it>" }
  ],
  "viewer": { "login": "<login of the authenticated GitHub user>" },
  "reviews": [
    { "id": 5653742310, "author": "other-reviewer", "state": "CHANGES_REQUESTED", "submittedAt": "<ISO time>", "url": "<link to the review>", "body": "<the review body, verbatim>" }
  ],
  "reviewComments": [
    { "id": "c1", "reviewId": 5653742310, "threadId": "<GraphQL ID of the thread>", "author": "other-reviewer", "url": "<link to the comment>", "hunkId": "3f2a9c1d0b7e", "path": "src/cache.ts", "line": 2, "side": "RIGHT",
      "body": "<the comment exactly as its author wrote it>", "diffHunk": "<the comment's diff_hunk from GitHub>", "resolved": false,
      "replies": [ { "author": "sample-author", "body": "<text>", "at": "<ISO time>" } ],
      "opinion": { "stance": "agree", "text": "<one line: why the comment is right or wrong>" },
      "fix": { "verdict": "fixed", "note": "<one line: what changed, with the commit or line>" } }
  ],
  "ownRemarks": [
    { "id": "gh-123456", "state": "posted", "reviewId": 5653742311, "threadId": "<GraphQL ID of the thread>", "hunkId": "3f2a9c1d0b7e", "path": "src/cache.ts", "line": 1, "side": "RIGHT",
      "body": "<the user's comment, without severity label>", "severity": "minor", "url": "<link, posted only>",
      "diffHunk": "<the comment's diff_hunk from GitHub>", "resolved": false, "outdated": false, "canResolve": true,
      "replies": [ { "author": "sample-author", "body": "<text>", "at": "<ISO time>" } ],
      "fix": { "verdict": "not-fixed", "note": "<one line: what changed, with the commit or line>", "reply": "<draft reply that says what is still missing; not-fixed only>" } }
  ],
  "ownPendingReview": { "id": 987654, "body": "<the pending review body, or empty>" },
  "answers": [ { "eventId": "<id>", "hunkId": "<id or null>", "question": "<text>", "answer": "<text>" } ],
  "posts": [ { "eventId": "<id>", "kind": "draft", "status": "posted", "message": "<GitHub response or error>", "url": "<url>", "reviewId": 123 } ],
  "remote": { "checkedAt": "<ISO time>", "state": "open", "headSha": "<head commit on GitHub now>" }
}
```

- `hunks` is written by `node scripts/review-data.js hunks <diff-file> <review-file>`. The agent adds `explanation`, and `explanationMore` on request. It MUST NOT change the other fields.
- A flow's `entry` and `end` are fully qualified code names with their namespace or module path, such as `App\Weather\ForecastClient::fetch()` or `src/api/weatherClient.ts:fetchForecast()`, not sentences.
- `layout` is `flows` or `directory`. With `directory`, `flows` is empty and the review page lists hunks by directory, then alphabetically.
- A flow with no acceptance criteria has `noCriteria`, which says why. The review page shows it where the flow's criteria would be.
- An acceptance criterion has `source` `ticket` when the ticket lists it, or `description` when the agent took it from the description because the ticket lists none. Do not repeat that in `text`. `verdict` is `met`, `not-met` or `unclear`, with a one-line `note`.
- `relatedTickets` holds open tickets that concern the same code, found by searching the tracker. Each one has `key`, `url` and `title`, and no criteria. The review page links their keys like the linked tickets; a related ticket's project prefix also makes other keys with that prefix linkable. They do not count as acceptance criteria.
- `tickets` holds Jira tickets (`key` like `WX-42`) and GitHub issues (`key` like `example-org/sample-api#12`), each with `url` and `title`. The review page links every reference it can resolve in any text, with the title as tooltip.
- `reviews` are the submitted reviews on the PR, by the user and by others, without pending ones and without the empty `COMMENTED` reviews GitHub makes for thread replies. `state` is GitHub's: `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED` or `DISMISSED`. The Existing reviews tab shows them, the user's own first.
- `reviewComments` are other reviewers' line comments, resolved ones too, each with the `reviewId` it belongs to. `stance` is `agree`, `disagree` or `unsure`. Open comments also show on their hunk; a comment with `hunkId: null`, or on a line outside the diff, shows on the home page. The review page never posts these comments. The reviewer can copy one into their own review as a new remark.
- `viewer.login` is the authenticated GitHub user; the review page shows that account's avatar on the user's own remarks, and none when `viewer` is missing.
- `pr.body` is the PR description, verbatim; the home page shows it as a collapsible block.
- `pr.localPath` is set for a big PR only. The local server then serves whole files from the worktree, and the review page links each file to VS Code and to its folder, and a PHP file also to PhpStorm. Without it, the server serves whole files from `files/` in the review directory. The server serves only files that a hunk changes.
- `ownRemarks` are the user's own review comments. The review page loads the `pending` ones and the `ownPendingReview` body into the reviewer's remarks and summary once, so they are posted again with the review. `posted` ones are not posted again. `severity` is the label the comment starts with, or the lowest severity when it has none.
- `opinion` on a comment by someone else says whether the comment is right, not whether it is fixed. The review page shows `fix` above it, so the reviewer reads the current state first.
- `fix` is the agent's recommendation for a posted comment: `fixed`, `not-fixed` or `unclear`, with a one-line `note`. For `not-fixed`, `reply` is a short draft that says what is still missing. A posted comment that is not `resolved` needs the reviewer's call: resolve it or leave it open. `canResolve` is GitHub's `viewerCanResolve`; `outdated` is GitHub's `isOutdated`.
- `remote` is what the agent found on GitHub at the last `check`. `state` is `open`, `closed` or `merged`. When `remote.headSha` differs from `pr.headSha`, the review page offers to load the new commits.
- A finding with `hunkId: null` is about the whole PR, for example a missing acceptance criterion. It goes in the review body.
- `line` and `side` follow GitHub review comments: `side` is `RIGHT` for added and context lines, `LEFT` for removed lines. A finding or remark on several lines also has `startLine` and `startSide` for its first line; in a `post` event these become `start_line` and `start_side`.

## reviewer.json

```json
{
  "seen": ["3f2a9c1d0b7e"],
  "decisions": { "f1": "accepted" },
  "edits": { "f1": "<reviewer's edited text of the finding>" },
  "severities": { "f1": "nit" },
  "remarks": [ { "id": "r1", "hunkId": "3f2a9c1d0b7e", "startLine": 1, "startSide": "RIGHT", "line": 3, "side": "RIGHT", "severity": "minor", "body": "<text>", "copiedFrom": "c1" } ],
  "summary": "<review body written by the reviewer>",
  "verdict": "REQUEST_CHANGES",
  "hunkVerdicts": { "3f2a9c1d0b7e": "approved" },
  "knownHunks": ["3f2a9c1d0b7e"],
  "imported": ["gh-123456", "review:987654"],
  "position": { "kind": "hunk", "line": "forecast-read", "hunkId": "3f2a9c1d0b7e" },
  "theme": "system",
  "flowPositions": { "forecast-read": "3f2a9c1d0b7e" },
  "knownComments": ["c1"],
  "threadCalls": { "<threadId>": "resolve" },
  "threadReplies": { "<threadId>": "<reply text>" },
  "copiedToSummary": ["c1"],
  "sent": [ { "id": "<event id>", "type": "ask", "hunkId": "3f2a9c1d0b7e", "question": "<text>" } ],
  "reopenedAfter": "<id of the posted final review after which the reviewer started a new round>"
}
```

`knownHunks` lets the review page mark hunks that are new since the last session. `imported` lists the own remarks and pending review body it already loaded, so it loads each one once. `position` is where the reviewer was, so a reload opens the same hunk. `knownComments` lists the `reviewComments` the reviewer already knows about; the review page announces the others as new. `flowPositions` holds the hunk the reviewer last had open in each flow, so opening a flow again returns there. `theme` is the colour theme the reviewer picked: `system`, `light` or `dark`. `severities` holds the severity the reviewer set on a finding, where it differs from the AI's. `hunkVerdicts` holds the reviewer's own verdict per hunk (`approved`, `changes` or `comment`); it stays in the page and only shapes the proposed verdict. `threadCalls` holds the reviewer's call on each of their open posted comments: `resolve` or `open`. `threadReplies` holds the reply to post in a thread left open; it starts as the agent's draft. A remark with `copiedFrom` started as a copy of another reviewer's comment on the same lines; `copiedToSummary` lists the comments copied into the summary because their lines are not in the diff. `sent` lists the events the review page sent, so it can show their answers and post results; each `post` entry also lists the IDs and texts it contained, so the page can show what is on GitHub and what is still local. A `post` entry also holds `at`, the time it was sent, `headSha`, the head commit at that time, and `payload`, what it sent. When GitHub accepted a final review, the page shows that it is posted instead of the form, until the reviewer starts a new round or `pr.headSha` changes; `reopenedAfter` marks the start of the new round.

## events.jsonl

Every event has `id`, `at`, `type` and `review`, the pull request it belongs to as `owner/repo#number`. The review page adds `review`; the local server adds `id` and `at`. Handle an event only in the review it names.

| `type` | Fields | What the agent does |
| --- | --- | --- |
| `ask` | `hunkId` (or null), `question` | Answer it and add an entry to `answers`. |
| `explain` | `hunkId` | Fill `explanationMore` of that hunk. |
| `post` | `kind` (`draft`, `final` or `update`), `verdict` (final and update only), `body`, `comments`, and for update only `replies` and `resolve` | Post exactly this payload, then add an entry to `posts`. |
| `check` | none | Read the PR's head commit, state, reviews and comments on GitHub. Write `remote`. Update `reviews`, `reviewComments` and `ownRemarks`, as in step 5: new ones, new replies, `resolved`. Change nothing else. |
| `refresh` | none | Run the Resume steps for a changed head commit, then set `pr.headSha` to the new head. |
| `finish` | none | Go to step 8. |

`comments` in a `post` event:

```json
[ { "path": "src/cache.ts", "start_line": 1, "start_side": "RIGHT", "line": 3, "side": "RIGHT", "body": "<text, with severity label and disclosure>" } ]
```

The review page builds `body` and every comment `body` in full, with the severity label. Only AI findings, and remarks that started from an AI answer, get the disclosure.

A `post` of kind `update` posts no line comments. It answers the reviewer's earlier comments and adds a review on top of their earlier one. Its `replies` and `resolve`:

```json
{ "replies": [ { "threadId": "<threadId>", "body": "<text, with the disclosure when it is the agent's draft>" } ], "resolve": ["<threadId>"] }
```
