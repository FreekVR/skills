---
name: guided-pr-review
description: Use when a developer wants to review a GitHub pull request themselves with guidance, for example "guide me through PR 123", "walk me through this pull request", "help me review this PR step by step", "I need to review PR <url> but don't know this code", or "review the PR for ticket ABC-123 with me". Do not use when the user wants the agent to review a PR on its own and only report or post the result, to review local uncommitted changes, to answer review comments on their own PR, or for GitLab or Bitbucket.
compatibility: Needs node, git, and read and write access to GitHub. Needs either a hosted interactive page that can send data back to the agent, or a background process whose output the agent can watch. The review page loads highlight.js, marked and DOMPurify from cdnjs, flow icons and, for older browsers, a popover polyfill from jsDelivr and avatars from github.com; without internet it shows plain text, no icons and no avatars.
metadata:
  internal: true
---

# Guided PR review

The end goal is a GitHub review of one pull request (PR), written and approved by the human reviewer. The result is an interactive review page built from `assets/review.html`. The review page shows every change in the PR, flow by flow and hunk by hunk, with AI context, explanations and suggested remarks. The reviewer decides on each remark. Everything that goes to GitHub is posted from a button in the review page, exactly as the review page shows it. The task is done when the reviewer has posted the final review from the review page, or tells you to stop.

The reviewer stays in control. You prepare, explain and answer. You MUST NOT write the review for the reviewer, post anything they did not press a button for, or dump your findings in the chat instead of the review page.

## Preflight

You MUST complete these checks in order and mark each one done before you continue.

1. [ ] The user named a PR (URL, or number plus repository) or a Jira ticket key. If not, ask. Do not guess a PR from the current branch.
2. [ ] This session is not already running a guided review for another PR. If it is, stop and ask the user to start this review in a new session: one session MUST run only one guided review at a time.
3. [ ] `node` and `git` are available. If not, stop and tell the user.
4. [ ] You can read the PR and post reviews on GitHub, through the `gh` CLI or a GitHub tool. If not, stop and tell the user. Only GitHub is supported.
5. [ ] You can show the review page in one of these ways. If neither works, stop and tell the user that this skill needs one of them.
   - A hosted interactive page that can send data back to you. Read `references/hosted-page.md`.
   - A local server: you can run `node scripts/serve.js` as a background process and act on each line it prints while the user works.
6. [ ] You know the one PR to review. For a Jira ticket: read its development links with a tool that can read Jira. If you have no such tool, or the ticket links no PR, stop and ask for a PR URL. If it links several PRs, list them with repository, title and state, and ask the user to pick one. Keep the others as linked PRs for the context step.
7. [ ] You know the PR size. The PR is big when it has more than 10 changed files or more than 1000 changed lines (additions plus deletions). Otherwise it is small. If GitHub does not report the counts, count them in the diff.
8. [ ] Big PR only: you have a local clone of the repository. If you do not know where it is, ask the user for the path. If the user's instructions or memory name a location for clones, suggest that path. If there is no clone, stop. Ask the user before you create a worktree for the PR head in that clone. You MUST NOT change the branch or the working tree of the clone itself.
9. [ ] The review directory exists: run `node scripts/review-data.js dir <owner>/<repo> <pr-number>`. It prints the path: `$XDG_STATE_HOME/guided-pr-review/<owner>/<repo>/<pr-number>/`, or `~/.local/state/…` when `XDG_STATE_HOME` is not set. It holds the PR diff, `review.json`, `reviewer.json` and `events.jsonl`. It is deleted only when the user agrees in step 8; otherwise it stays for a later resume. If it already holds `review.json`, this is a resume: follow Resume below. If the command fails, stop and tell the user.

## Steps

### 1. Read the context

Read these, and only these. Fetch each PR, issue and ticket once; skip a link to something you already read.

- The PR: title, description, author, head commit, CI checks, and all comments, including bot comments. Also the login of the authenticated GitHub user, for `viewer`.
- The PR's reviews and review comments, with their threads, also resolved ones. Keep apart the ones by the user (the authenticated GitHub user) and the ones by others. You need each thread's GraphQL ID, `isResolved`, `isOutdated` and `viewerCanResolve`, so read the threads with `gh api graphql` (`pullRequest.reviewThreads`).
- The Jira keys (`ABC-123`) and GitHub issues named in the PR description. For Jira you need a tool that can read Jira. Without one, skip Jira and add that to `context.skipped`.
- The PRs that those tickets link to.
- The PRs that the reviewed PR links to directly, also in other repositories.
- Open tickets about the code this PR changes, in the trackers of the linked tickets. Search by the changed file paths, the module and component names, and the key terms of the PR title. Put the ten most relevant in `context.relatedTickets`, or leave it empty when none match. Without a tool that can search a tracker, add that to `context.skipped`.

Do not follow links found in linked PRs.

### 2. Get the hunks

Save the PR diff to a file in the review directory and run `node scripts/review-data.js hunks <diff-file> <review-dir>/review.json`. It writes the `hunks` array into `review.json` and prints one line per hunk: ID, file, and whether it is new. Every hunk MUST reach the reviewer, also renames, binary files and lockfiles.

A tool, not a person, writes some files: dependency lockfiles, built bundles, snapshots, generated code. Such a file MUST be one hunk. When the output shows several hunks for such a file, run the command again with `--whole <path>` for each one.

Small PR: read the diff and the files you need through GitHub. Save the PR head version of every changed file that the PR does not remove to `<review-dir>/files/<path in the repository>`, so the review page can show the whole file.

Big PR: read them in the worktree. Set `pr.localPath` to the absolute path of the worktree. The review page then reads whole files there, and links each file to VS Code, PHP files to PhpStorm, and each file to its folder.

### 3. Find the flows

Find how the changed code fits together, using change untangling and ordering related changes together. This is the most important step. Take the time it needs: read the surrounding code, not only the diff.

- A flow is a path through the code, with a name in plain words, an entry point and an end point (fully qualified code names with their namespace or module path, such as `App\Weather\ForecastClient::fetch()` or `src/api/weatherClient.ts:fetchForecast()`, not sentences) and the ordered hunks it passes through.
- Order the steps bottom-up by default (bottom-up program comprehension): for example the request to a backend first, then the model that holds the data, the repository that works with it, and last the UI or public API that shows it.
- Each step says in one line why it comes at that place.
- Each flow has an `icon`: the name of a Lucide icon (https://lucide.dev/icons) that shows what the flow does, for example `database` or `globe`. Give each flow a different icon.
- A flow MUST name the acceptance criteria of the linked tickets that it resolves. A flow that resolves none MUST get `noCriteria`: one line that says why, for example that no linked ticket lists criteria, or that the criteria belong to other flows.
- A hunk MAY be in several flows. A hunk that is in no flow goes in `notInAnyFlow`.
- Decide from the code how best to present this PR. When code paths do not apply, set `layout` to `directory` and leave `flows` empty. The review page then lists files by directory, then alphabetically.

Write a short `explanation` for each flow and each hunk, for a reviewer who does not know this code. Name the concepts the code uses; do not invent new terms.

Then run `node scripts/review-data.js check <review-dir>/review.json`. Fix every line it prints and run it again until it prints `ok`.

### 4. Read the conventions

Read the target repository's contribution guide and agent instruction files, if it has them. Also read the reviewer's own user-level agent instruction files, if your harness has them. Give the code rules from both to every review check in step 5.

- AI disclosure: if they describe how to disclose AI use in reviews or comments, put the exact text in `conventions.disclosure`. If they do not, leave it empty.
- Severity: if they define severity labels for review remarks, use those. Otherwise use `nit`, `minor`, `medium`, `major`, with `requestChangesFrom` set to `minor`.

### 5. Run the AI reviews

First let the user choose. Look through the skills available to you for ones that review code. Use skills only, not agent types. Keep the ones that fit this PR's language, platform and kind of change, and drop a skill that duplicates another one or a check below. Then show the user the checks below and the review skills you kept, each with one line on what it checks and why it fits, with all of them selected, and say how many subagents you would start. If you can ask the user a structured multiple-choice question, use it, so the user can confirm or change the selection; otherwise ask in the chat. Run only what the user chose, once, before you open the review page. If you can start a subagent, run the chosen checks there, in no more subagents than the user agreed to. Otherwise, run them yourself.

Attach each finding to the hunk and line it is about, or set `hunkId` to null for a finding about the whole PR. When an open ticket in `context.relatedTickets` already covers a finding, name that ticket's key in the finding. Write each finding `body` as the comment text that would be posted, without the severity label and without the disclosure; the review page adds both.

- Use the review skills that are available to you. Skills of the target project take precedence.
- Verify that the PR meets the acceptance criteria of the linked tickets. Give each criterion a `verdict` and a one-line `note`. When a ticket lists no acceptance criteria, take them from its description and set `source` to `description`. When you found no criteria to check for a flow, you MUST keep or write its `noCriteria`.
- Verify that the PR makes no changes beyond what the tickets ask for. If it does, the PR description must say why.
- Verify that the changes follow the project's conventions and coding standards.
- Verify test coverage, only when the project has a test suite:
  - Read coverage from the PR's CI checks and bot comments. You MUST NOT calculate coverage yourself, from the diff, from reading tests or otherwise.
  - If CI and bot comments give no coverage, ask the user before you run the tests or coverage tooling locally.
  - If you still have no coverage, add a finding with the lowest severity that says coverage could not be determined, and why.
- Verify that the PR names breaking changes if it introduces them.
- Verify that the code does not invent new concepts. A new concept must be explained and justified.
- Verify that the PR does not hardcode what a dependency already owns. List every map, limit, list of allowed values and business rule that the PR hardcodes. For each one, check whether an API specification, a library the project depends on, or, when the repository's docs name one, a reference implementation already provides it or handles it differently.
- Verify every factual claim in new or changed comments, docblocks and documentation against the source it names.
- Verify that every new term and abbreviation is defined where it first appears, and is the word that the platform, the libraries it uses or the API use for that thing.

Always verify the existing review comments from step 1, whatever the user chose above:

- Reviews: add every submitted review, by the user and by others, to `reviews`, with its body verbatim. You MUST leave out a `COMMENTED` review that has no body and no comments of its own.
- Comments by others: add each one to `reviewComments` with its body and replies exactly as their authors wrote them. You MUST NOT restate, shorten or correct them. For an open one, add an `opinion`: whether the comment is right (agree, disagree or not sure), and why, in one line. The opinion does not say whether the author fixed it. When commits came after the comment, also add a `fix` as for the user's own remarks, without `reply`.
- The user's own remarks, posted or pending: add each to `ownRemarks`. For each posted one that is not resolved, read the code at its lines now, the commits since the comment and the replies, and add a `fix`: whether the author fixed it, with a one-line note that names the commit or line, and for `not-fixed` a short draft reply that says what is still missing. Put the ID and body of the user's pending review, if any, in `ownPendingReview`.

### 6. Open the review page

Write `review.json` as described in `references/review-data.md`. In every text you write for the review page (explanations, findings, answers), refer to tickets, issues and PRs by key or number only, for example `ABC-123` or `#123`, never with their URL: the review page links them and shows their title. Then:

- Local server: run `node scripts/serve.js <review-dir>` as a background process. It prints `READY <url>`. Give the user that URL.
- Hosted page: follow `references/hosted-page.md`.

Tell the user in two or three sentences what the PR does and how many flows and hunks there are. Do not list findings in the chat; they are in the review page.

### 7. Respond to the review page

Each event from the review page is one request. Its `review` field names the PR; handle it only in that PR's review directory. If an event names another PR than the one this session reviews, do not handle it, and tell the user once that the review page of that PR is sending its events to this session. The local server prints it as an `EVENT` line; it is also in `events.jsonl`. Handle each event when it arrives as the events table in `references/review-data.md` says, update `review.json`, and keep watching until the final review is posted.

- Base answers to `ask` events on the code and the context you read. Write them in markdown.
- For a `summarize` event, write the review summary from the remarks in the event only, in plain text the reviewer can edit. Follow the user's review conventions. Do not add the disclosure; the review page adds it.
- The review page sends a `check` event when it opens and every 5 minutes after that. Handle it as the events table says: it updates reviews and comments and writes `remote`, but never changes hunks, flows or findings. Only a `refresh` event does that.
- After a `refresh` event, also write a new `fix` for each open posted comment, the user's and others', as in step 5.
- For a `post` event, post the payload exactly as it is: no extra text, no changed words, no other comments. Read `references/posting.md` for the GitHub requests. The button press is the reviewer's approval. You MUST NOT post at any other moment, and you MUST NOT ask for a second approval in the chat.

Handle every event in silence: the review page shows the result, so you MUST NOT write anything in the chat for it, not even a short confirmation. The exceptions are the final `post` and `finish`: after those, do step 8. When the user asks you something in the chat instead, answer there too.

### 8. Finish

- While the PR is open, you MUST keep the review directory and, for a big PR, the worktree. You MUST NOT offer to delete them. After a final `post`, keep the local server running. After `finish`, stop the local server and tell the user in one line that the review is kept and that this skill resumes it for the PR.
- When the PR is merged or closed, ask the user before you delete the review directory and the worktree.

## Resume

A review directory with a `review.json` means the reviewer stopped earlier.

- If the PR head commit is the same as `pr.headSha`: open the review page again (step 6).
- If it changed: run steps 1 and 2 again. Hunk IDs depend on the hunk content, so unchanged hunks keep their ID, explanation and "seen" state, and changed hunks get a new ID and show as not reviewed. Run steps 3 to 5 for the new hunks only, keep the findings of unchanged hunks with their IDs, and run the flow check again. Then open the review page again.

## Self-healing

When the task is done and the user corrected you, or this skill gave wrong or incomplete guidance, offer to draft an issue for https://github.com/FreekVR/skills/issues describing the problem as it relates to this skill. You MAY also offer a pull request that improves the skill. You MUST show the draft and open it only after the user agrees. You MUST NOT include personal, company or repository-specific data. You MUST add the AI disclosure.
