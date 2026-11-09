# Review data

The review page, the review server and the agent share these files in the review directory. Each file has one writer.

| File | Writer | Reader | Content |
| --- | --- | --- | --- |
| `review.json` | agent | review page | The PR, context, flows, hunks, AI findings, answers, post results |
| `reviewer.json` | review page | agent | What the reviewer has seen, decided and written |
| `events.jsonl` | review page | agent | One JSON object per line: questions, "explain more" requests, post requests |
| `session.json` | agent, through `review-data.js watch` | review server | The agent session that runs the review, and its watch process |
| `waiting` | agent, through `review-data.js waiting` and `answered` | review page | `{ "question", "since" }`; exists while the agent waits for the user's answer in the chat |
| `preparing` | agent, through `review-data.js preparing` and `prepared`; review server, on `start-review` | review page | `{ "step", "since", "from" }`; exists while the agent still works on a review whose page can be open, for example after `start-review`. `step` is what the agent does now. An empty file also counts, without a step. The `start-review` route of another review's page writes it as `{ "step": "Waiting for the agent to start", "since", "from": <that review's PR number> }` when the PR has no `review.json`, and the reviewer goes to this PR's page at once. Until this review has a watch of its own, the page shows the agent of review `from`. `review-data.js preparing` keeps `from` |

`node scripts/review-data.js preparing <review-dir> "<step>"` writes `preparing` and shows the banner "The agent is still preparing this review." with the step in the review page. Run it again with the next step. `node scripts/review-data.js prepared <review-dir>` removes the file and the banner. Both exit with code 2 and print the usage on a missing directory or an empty step.

Only the writer in the table MAY write a file. The review page reloads `review.json` every few seconds, so the agent's changes show up without a page reload.

## review.json

```json
{
  "pr": {
    "owner": "example-org", "repo": "sample-widget", "number": 17,
    "title": "feat: add three-day forecast", "url": "https://github.com/example-org/sample-widget/pull/17",
    "author": "sample-author", "isOwnPr": false, "headSha": "<sha>", "baseRef": "<base branch of the PR>", "body": "<the PR description, verbatim>",
    "localPath": "<big PR only: absolute path of the worktree>"
  },
  "context": {
    "summary": "<markdown: two or three sentences on what the PR does and why, then a line that names the tickets it fixes>",
    "tickets": [
      { "key": "WX-42", "title": "Three-day forecast", "url": "<url>",
        "acceptanceCriteria": [ { "id": "WX-42#1", "text": "Shows three days with min and max temperature.", "source": "ticket", "verdict": "met", "note": "<one line: why>" } ] }
    ],
    "relatedTickets": [ { "key": "WX-57", "title": "Cache forecasts per region", "url": "<url>" } ],
    "linkedPrs": [ { "repo": "example-org/sample-api", "number": 8, "url": "<url>", "title": "<title>", "state": "MERGED", "summary": "<one line>" } ],
    "skipped": [ "<what was not read and why, for example: Jira: no tool can read Jira>" ],
    "coverage": { "source": "<CI check or bot comment, with link>", "summary": "<one line>" }
  },
  "stack": {
    "number": 31, "source": "github", "base": "main",
    "prs": [ { "number": 14, "title": "<title>", "url": "<url>", "state": "merged", "approved": true, "summary": "<one line from title, description and files>" } ],
    "coverage": [ { "criterion": "WX-42#3", "pr": 16, "status": "expected" } ],
    "outsideTickets": [ { "pr": 17, "text": "<one line: the change that no ticket asks for>", "status": "expected" } ]
  },
  "conventions": {
    "severities": ["nit", "minor", "medium", "major"],
    "requestChangesFrom": "minor",
    "disclosure": { "comment": "<text appended to each comment the AI wrote, or empty>", "review": "<text appended to the review body when it holds AI findings, or empty>" }
  },
  "layout": "flows",
  "wholeFiles": ["<path passed with --whole>"],
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
      "title": "<one line>", "body": "<the comment text as it will be posted>", "rule": "<which review rule found it; acceptance-criteria for an unmet criterion>", "sources": ["<review skill name, or check:<angle>>"],
      "stack": { "verdict": "fixed", "pr": 16, "prs": [14, 16], "note": "<one line: what the other PRs do with it, and the files read>" } }
  ],
  "viewer": { "login": "<login of the authenticated GitHub user>" },
  "reviews": [
    { "id": 5653742310, "author": "other-reviewer", "state": "CHANGES_REQUESTED", "commitId": "<the commit the review was made on>", "submittedAt": "<ISO time>", "url": "<link to the review>", "body": "<the review body, verbatim>" }
  ],
  "reviewComments": [
    { "id": "c1", "reviewId": 5653742310, "threadId": "<GraphQL ID of the thread>", "author": "other-reviewer", "url": "<link to the comment>", "hunkId": "3f2a9c1d0b7e", "path": "src/cache.ts", "line": 2, "side": "RIGHT",
      "body": "<the comment exactly as its author wrote it>", "diffHunk": "<the comment's diff_hunk from GitHub>", "resolved": false, "canUnresolve": true,
      "replies": [ { "author": "sample-author", "body": "<text>", "at": "<ISO time>" } ],
      "opinion": { "stance": "agree", "text": "<one line: why the comment is right or wrong>" },
      "fix": { "verdict": "fixed", "note": "<one line: what changed, with the commit or line>" } }
  ],
  "ownRemarks": [
    { "id": "gh-123456", "state": "posted", "reviewId": 5653742311, "threadId": "<GraphQL ID of the thread>", "hunkId": "3f2a9c1d0b7e", "path": "src/cache.ts", "line": 1, "side": "RIGHT",
      "body": "<the user's comment, without severity label>", "severity": "minor", "severitySource": "ai", "url": "<link, posted only>",
      "diffHunk": "<the comment's diff_hunk from GitHub>", "resolved": false, "resolvedBy": null, "outdated": false, "canResolve": true, "canUnresolve": true,
      "replies": [ { "author": "sample-author", "body": "<text>", "at": "<ISO time>" } ],
      "opinion": { "stance": "agree", "text": "<one line: why the comment is right or wrong>" },
      "fix": { "verdict": "not-fixed", "note": "<one line: what changed, with the commit or line>", "reply": "<draft reply that says what is still missing; not-fixed only>" } }
  ],
  "ownPendingReview": { "id": 987654, "body": "<the pending review body, or empty>" },
  "answers": [ { "eventId": "<id>", "hunkId": "<id or null>", "question": "<text>", "answer": "<text>" } ],
  "posts": [ { "eventId": "<id>", "kind": "draft", "status": "posted", "message": "<GitHub response or error>", "url": "<url>", "reviewId": 123 } ],
  "remote": { "checkedAt": "<ISO time>", "state": "open", "headSha": "<head commit on GitHub now>" },
  "checkedSha": "<the head commit whose hunks went through steps 5 to 8>",
  "refreshes": [ { "eventId": "<id>", "status": "done", "from": "<pr.headSha before>", "to": "<pr.headSha after>", "message": "<only for status error: what failed>" } ],
  "changesSince": { "from": "<commit of the user's last review>", "to": "<pr.headSha>", "summary": "<markdown: at most 4 short bullets in plain words>" }
}
```

- `hunks` is written by `node scripts/review-data.js hunks <diff-file> <review-file>`. Each hunk has `status`: `added`, `modified`, `removed` or `renamed`. `binary` is true for a binary file. `oldFile` is the path before the change; it differs from `file` only for a rename. `hunks` also writes `wholeFiles`, the paths passed with `--whole`, so that `check --diff` splits the diff the same way. A file passed with `--whole <path>` becomes one hunk; its `lines` then hold a `@@` header line at each gap, and the review page shows the gap as skipped lines. The agent adds `explanation`, and `explanationMore` on request. It MUST NOT change the other fields.
- A flow's `entry` and `end` are fully qualified code names with their namespace or module path, such as `App\Weather\ForecastClient::fetch()` or `src/api/weatherClient.ts:fetchForecast()`, not sentences.
- `layout` is `flows` or `directory`. With `directory`, `flows` is empty and the review page lists hunks by directory, then alphabetically.
- A flow with no acceptance criteria has `noCriteria`, which says why. The review page shows it where the flow's criteria would be.
- An acceptance criterion has `source` `ticket` when the ticket lists it, or `description` when the agent took it from the description because the ticket lists none. Do not repeat that in `text`. `verdict` is `met`, `not-met` or `unclear`, with a one-line `note`. In a stack, `verdict` is `elsewhere` with `pr` set to the number of the higher PR that completes the criterion; it gives no finding.
- `context.summary` ends with a line of its own that names each ticket in `tickets` with its key and title, for example `Fixes WX-42 (Three-day forecast).` Quote a short title as it is. Shorten long titles, or sum up the titles when there are many tickets, so the line stays one line. Leave the line out when `tickets` is empty.
- `stack` is only for a PR in a stack of 2 or more PRs. Leave it out for a PR in no stack or alone in its stack. `number` (null for a stack read from the branches), `source` (`github` or `branches`), `base` and each PR's `number`, `title`, `url` and `state` (`open`, `merged` or `closed`) come from `node scripts/review-data.js stack`, with `prs` bottom to top. `approved` is true when the user's latest review of that PR on GitHub is `APPROVED`. `summary` says in one line what the PR does and how it relates to the PRs next to it. `coverage` lists, per acceptance criterion, the other PR that is expected to meet it; `outsideTickets` lists changes in the stack that no ticket asks for, with the PR that adds each one. `status` is `confirmed` when that PR's own review in this skill checked it, else `expected`. Leave `coverage` and `outsideTickets` out when they are empty. `check` rejects a `stack` that breaks these rules.
- `relatedTickets` holds open tickets that concern the same code, found by searching the tracker. Each one has `key`, `url` and `title`, and no criteria. The review page links their keys like the linked tickets; a related ticket's project prefix also makes other keys with that prefix linkable. They do not count as acceptance criteria.
- `tickets` holds Jira tickets (`key` like `WX-42`) and GitHub issues (`key` like `example-org/sample-api#12`), each with `url` and `title`. The review page links every reference it can resolve in any text, with the title as tooltip.
- `reviews` are the submitted reviews on the PR, by the user and by others, without pending ones and without the empty `COMMENTED` reviews GitHub makes for thread replies. `state` is GitHub's: `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED` or `DISMISSED`. `commitId` is GitHub's `commit_id` of the review: the head commit when it was submitted. The Existing reviews tab shows them, the user's own first, each with its commit next to the commit the page shows.
- `reviewComments` are other reviewers' line comments, resolved ones too, each with the `reviewId` it belongs to. `stance` is `agree`, `disagree` or `unsure`. Open comments also show on their hunk; a comment with `hunkId: null`, or on a line outside the diff, shows on the home page. The review page never posts these comments. The reviewer can copy one into their own review as a new remark.
- `viewer.login` is the authenticated GitHub user; the review page shows that account's avatar on the user's own remarks, and none when `viewer` is missing.
- `pr.body` is the PR description, verbatim; the home page shows it as a collapsible block.
- `pr.localPath` is set for a big PR only. The review server then serves whole files from the worktree, and the review page links each file to VS Code and to its folder, and a PHP file also to PhpStorm. Without it, the server serves whole files from `files/` in the review directory. The server serves only files that a hunk changes.
- `ownRemarks` are the user's own review comments. The review page loads the `pending` ones and the `ownPendingReview` body into the reviewer's remarks and summary once, so they are posted again with the review. `posted` ones are not posted again. `severity` is the label the comment starts with. When it has none, the agent sets the severity it would give the comment as a finding, in the same pass that writes `opinion`, and `severitySource` is `ai`; the review page shows that mark and the reviewer can change it. A comment without `severity` gets the lowest one.
- `opinion` on a comment says whether the comment is right, not whether it is fixed. Comments by others and the user's own comments both get one. The review page shows the opinion right under the comment, and `fix` below it. On a pending remark that the reviewer edited, the review page hides the opinion.
- `fix` is the agent's recommendation for a posted comment: `fixed`, `not-fixed` or `unclear`, with a one-line `note`. For `not-fixed`, `reply` is a short draft that says what is still missing. A posted comment that is not `resolved` needs the reviewer's call: resolve it or leave it open. `resolvedBy` is the login of whoever resolved the thread, from GitHub's `resolvedBy`. Every posted comment of the user and every resolved comment, whoever resolved it, has a `fix`, written after it was resolved, also when no commit came; `check` reports one without it, and the review page shows "not checked" for it. When a comment that someone other than the user resolved is not `fixed`, the review page asks the reviewer to unresolve it or keep it resolved. `canResolve` is GitHub's `viewerCanResolve`; `outdated` is GitHub's `isOutdated`. On a resolved thread, the reviewer's own or someone else's, `canUnresolve` is GitHub's `viewerCanUnresolve`; the reviewer can then choose to unresolve it.
- `remote` is what the agent found on GitHub at the last `check`. `checkedAt` is the time of that `check`, also when it failed. `state` is `open`, `closed` or `merged`. When `remote.headSha` differs from `pr.headSha`, the review page offers to load the new commits. When the `check` that the page sent as it opened finds them, the page sends the `refresh` itself. `remote.error` is the message of a failed call to GitHub during the last `check`. It is absent when that `check` succeeded. The review page shows it.
- `checkedSha` is the head commit whose hunks all went through steps 5 to 8 of `SKILL.md`; `review-data.js checked` writes it. When it is not `pr.headSha` and the agent does not work on the review, Home shows that the agent has not checked this commit, with a button that sends `refresh`, or the command that resumes the agent when none runs. A review without `checkedSha` never shows this.
- `refreshes` has one entry per `refresh` event, with its `eventId`. `status` is `done` or `error`; for `error`, `message` says what failed. `from` and `to` are the head commit before and after; they are the same when there were no new commits. Until the entry is there, the review page says that the agent is loading the new commits; after it, the page shows the result and how many hunks are new, changed or gone.
- `changesSince` says what changed in the code since the user's last review, as a summary: at most 4 bullets, each one short line in plain words about what changed for the reviewer, for example "the four clients are regenerated from the live specs". Do not list the classes, files, options or commits that changed, and use no commit SHA or code name unless the reviewer needs it to find something; the changed hunks show the details. `from` is the commit of the user's newest submitted review (`commitId`), or the previous `pr.headSha` when the user has none; `to` is the current `pr.headSha`. The review page shows it on Home and with the result of a `refresh`, only while `to` is `pr.headSha`.
- In a stack, every finding has `stack`: `verdict` is `fixed`, `worse`, `untouched` or `not-checked`; `fixed` and `worse` name the PR in `pr`. `check` reports a finding without it. The review page shows it under each finding as "In the stack: …", and "not checked against the other PRs" for a finding without it. The posted comment ends with that line for `fixed`, `worse` and `not-checked`.
- `sources` lists what found a finding: the exact name of a review skill, or `check:<angle>` for a built-in check (`check:spec`, `check:code-standards`, `check:sources`, `check:tests`). It records which checks the reviewer accepts findings from, for a later choice of checks; the review page does not show it yet.
- A finding with `hunkId: null` is about the whole PR, for example a missing acceptance criterion. It goes in the review body. Each `not-met` criterion has exactly one: `rule` `acceptance-criteria`, the criterion ID at the start of `title`. `check` reports a `not-met` criterion without it, and such a finding for a criterion that is not `not-met`.
- `line` and `side` follow GitHub review comments: `side` is `RIGHT` for added and context lines, `LEFT` for removed lines. A finding or remark on several lines also has `startLine` and `startSide` for its first line; in a `post` event these become `start_line` and `start_side`.

## reviewer.json

```json
{
  "seen": ["3f2a9c1d0b7e"],
  "seenIn": { "3f2a9c1d0b7e": "forecast-read" },
  "decisions": { "f1": "accepted" },
  "edits": { "f1": "<reviewer's edited text of the finding>" },
  "severities": { "f1": "nit" },
  "remarks": [ { "id": "r1", "hunkId": "3f2a9c1d0b7e", "startLine": 1, "startSide": "RIGHT", "line": 3, "side": "RIGHT", "severity": "minor", "body": "<text>", "copiedFrom": "c1" } ],
  "summary": "<review body written by the reviewer>",
  "verdict": "REQUEST_CHANGES",
  "hunkVerdicts": { "3f2a9c1d0b7e": "approved" },
  "knownHunks": ["3f2a9c1d0b7e"],
  "hunkChanges": { "added": 1, "gone": 0 },
  "closedRefresh": "<eventId of the refresh whose result the reviewer closed>",
  "imported": ["gh-123456", "review:987654"],
  "theme": "system",
  "flowPositions": { "forecast-read": { "hunkId": "3f2a9c1d0b7e", "stops": ["3f2a9c1d0b7e", "8b1e0c2d4f6a"] } },
  "knownComments": ["c1"],
  "threadCalls": { "<threadId>": "resolve" },
  "threadReplies": { "<threadId>": "<reply text>" },
  "copiedToSummary": ["c1"],
  "sent": [ { "id": "<event id>", "type": "ask", "hunkId": "3f2a9c1d0b7e", "question": "<text>" } ],
  "reopenedAfter": "<id of the posted final review after which the reviewer started a new round>"
}
```

`seenIn` holds the flow in which the reviewer saw each hunk first, so another flow that has the hunk can say they saw it there. `knownHunks` lets the review page mark hunks that are new since the last session, and `changedHunks` keeps those marks across reloads until the reviewer opens each hunk; `hunkChanges` counts the hunks that were new and gone at the last change, for the result of a `refresh`. `closedRefresh` hides that result once the reviewer closed it. `imported` lists the own remarks and pending review body it already loaded, so it loads each one once. The address of the page names the view, so a reload or the back button opens the same view: the PR's address is Home, `/A2` a hunk by its station code, `/reviews` Existing reviews and `/submit` Submit review. A link to another review is its plain address, so it opens that review's Home. `knownComments` lists the `reviewComments` the reviewer already knows about; the review page announces the others as new. `flowPositions` holds the hunk the reviewer last had open in each flow, with the flow's hunks at that time, so opening a flow again returns there; when the flow's hunks changed since, it opens at the first unseen hunk. `theme` is the colour theme the reviewer picked: `system`, `light` or `dark`. `severities` holds the severity the reviewer set on a finding, where it differs from the AI's. `hunkVerdicts` holds the reviewer's own verdict per hunk (`approved`, `changes` or `comment`); it stays in the page and only shapes the proposed verdict. `threadCalls` holds the reviewer's call on each of their open posted comments, `resolve` or `open`, `unresolve` on each resolved thread they chose to open again, and `keep` on a comment someone else resolved that they keep resolved. `threadReplies` holds the reply to post in a thread, the reviewer's own or someone else's; in an own thread left open it starts as the agent's draft. A remark with `copiedFrom` started as a copy of another reviewer's comment on the same lines; `copiedToSummary` lists the comments copied into the summary because their lines are not in the diff. `sent` lists the events the review page sent, so it can show their answers and post results; each `post` entry also lists the IDs and texts it contained, so the page can show what is on GitHub and what is still local. A `post` entry also holds `at`, the time it was sent, `headSha`, the head commit at that time, and `payload`, what it sent. `summaryFrom` is the `summarize` event whose answer the reviewer used or turned down, so the page offers each draft once; `summaryAiSuggested` is true while the summary started from that draft, and the review body then gets the disclosure. When GitHub accepted a final review, the page shows that it is posted instead of the form, until the reviewer starts a new round or `pr.headSha` changes; `reopenedAfter` marks the start of the new round.

## session.json

```json
{ "sessionId": "<Claude Code session ID, or null>", "cwd": "<directory the session runs from>", "worktree": "<worktree path, or null for a small PR>", "watcherPid": 4242, "lastEventAt": "<ISO time of the last event that is not a check>" }
```

`node scripts/review-data.js watch <review-dir> [--worktree <path>] [--idle-minutes <n>] [--restart | --resume]` writes `session.json` and keeps running as the watch. It exits with `IDLE` after `n` minutes (default 30) without an event other than `check`; `lastEventAt` holds the time it counts from. A start sets `lastEventAt` to now and reads only new events. With `--restart` it keeps `lastEventAt`, first prints the events written since the old watch stopped (from `eventsOffset`), and exits with `IDLE` at once when `lastEventAt` is then still `n` minutes ago. With `--resume` it also first prints the events written since the old watch stopped, but sets `lastEventAt` to now, so a review resumed after a long pause does not end at once. `sessionId` comes from `CLAUDE_CODE_SESSION_ID`, and `watcherPid` is the watch process. While that process runs, an agent is connected to the review. The review page lists every review directory in a switch in its header, grouped by repository, the most recently active first. The last activity is the newest change of `review.json`, `reviewer.json` or `events.jsonl`. A merged or closed PR whose review was quiet for 14 days folds away at the bottom of its group. For a review without a connected agent, it shows the command that resumes its session, and a button that deletes the review directory and, through `git worktree remove`, its worktree. It never removes a main clone. When git refuses, for example over uncommitted changes, the review stays and the switch shows git's message.

The review server records itself in `server.json` in the state directory itself, not in a review directory: `{ "url": "http://127.0.0.1:4317/", "pid": 4242 }`. `scripts/review-server.js` writes it when it starts the server.

## Static review page

`node scripts/review-data.js static <review-dir> <out-file>` writes the review page with the `review.json` of `<review-dir>` as one HTML file, for an agent that cannot run the watch. The file opens from `file://` without the review server: the built scripts and CSS are in the file. The file is about 5 MB. The page has no agent: it shows no Ask, no Explain more, no Post as draft, no summary from the AI, no sessions and no banners from the agent. It keeps the reviewer state in the browser's `localStorage` under `guided-pr-review:<owner>/<repo>#<number>`, not in `reviewer.json`. In Submit review, **Copy the gh command** puts this command on the clipboard and shows it:

```sh
printf '%s\n' '<payload>' | gh api --method POST repos/{owner}/{repo}/pulls/{number}/reviews --input -
```

`<payload>` is the JSON of `commit_id` (`pr.headSha`), `body`, `event` (the verdict) and `comments`, as for a final `post` (`references/posting.md`). Each `'` in it is written as `'\''`. The command does not post replies and does not resolve or unresolve threads. To build the page, the command starts the built review server for a moment on a free port and reads its page.

## events.jsonl

Every event has `id`, `at`, `type` and `review`, the pull request it belongs to as `owner/repo#number`. The review page adds `review`; the review server adds `id` and `at`. Handle an event only in the review it names.

| `type` | Fields | What the agent does |
| --- | --- | --- |
| `ask` | `hunkId` (or null), `question` | Answer it and add an entry to `answers`. |
| `explain` | `hunkId` | Fill `explanationMore` of that hunk. |
| `summarize` | `verdict` (null while hunks wait for a verdict), `remarks` (each `severity`, `where`, `body`) | Write a review summary from these remarks, in the user's words and conventions, as SKILL.md step 2 describes: how serious the remarks are as a whole, the problems that several remarks share, and what the author should do first. The remarks are posted below it, so it does not restate them. Add it to `answers` with `hunkId` null and the summary as `answer`. |
| `post` | `kind` (`draft` or `final`), `body`, `comments`, and for final only `verdict`, `unresolve`, `replies` and `resolve` | Post exactly this payload, then add an entry to `posts`. |
| `check` | none | Read the PR's head commit, state, reviews and comments on GitHub. Write `remote`; when a call to GitHub fails, keep the other fields of `remote` as they are, set `checkedAt` and write `remote.error` with the message. Update `reviews`, `reviewComments` and `ownRemarks`, as in step 8: new ones, new replies, `resolved` and `resolvedBy`. For a comment that someone resolved since the last `check`, write a new `fix`. In a stack, also read the stack again and update `stack` (step 2 of `SKILL.md`). Change nothing else. |
| `refresh` | none | Run the steps of `references/resume.md` for a changed head commit, set `pr.headSha` to the new head, write `changesSince`, and add an entry with status `done` to `refreshes`. When the head commit is still `pr.headSha`, for example because an earlier `refresh` already loaded it, handle it as a `check` and add a `done` entry with the same `from` and `to`; when `checkedSha` is then not `pr.headSha`, first run steps 5 to 8 for the hunks that were not in the review at `checkedSha` (get their IDs as "Old hunk IDs" in `references/resume.md` says, or run the steps for every hunk when that fails), then step 9. When loading fails, add an `error` entry with the reason. |
| `start-review` | `number` | Run the steps of a new review for PR `number` of this stack in this session, as step 2 of `SKILL.md` says. |
| `finish` | none | Go to step 10. |

`comments` in a `post` event:

```json
[ { "path": "src/cache.ts", "start_line": 1, "start_side": "RIGHT", "line": 3, "side": "RIGHT", "body": "<text, with severity label and disclosure>" } ]
```

The review page builds `body` and every comment `body` in full. A finding starts with the header line `**severity(rule): title**`; a remark starts with `**severity:**`. Only AI findings, and remarks that started from an AI answer, get the disclosure.

A final `post` also answers threads. `unresolve` lists the resolved threads, the reviewer's own or someone else's, that they chose to open again; `replies` go to any open thread and to those threads; `resolve` lists the reviewer's own threads they chose to resolve:

```json
{ "unresolve": ["<threadId>"], "replies": [ { "threadId": "<threadId>", "body": "<text, with the disclosure when it is the agent's draft>" } ], "resolve": ["<threadId>"] }
```
