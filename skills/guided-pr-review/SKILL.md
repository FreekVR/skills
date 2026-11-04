---
name: guided-pr-review
description: Use when a developer wants to review a GitHub pull request themselves with guidance, for example "guide me through PR 123", "walk me through this pull request", "help me review this PR step by step", "I need to review PR <url> but don't know this code", or "review the PR for ticket ABC-123 with me". Do not use when the user wants the agent to review a PR on its own and only report or post the result, to review local uncommitted changes, to answer review comments on their own PR, or for GitLab or Bitbucket.
compatibility: Needs Node.js 22.22.3 or a newer 22, 24.15 or a newer 24, or 26 and up, git, read and write access to GitHub, a background process whose output the agent can watch, and a browser on the same computer. The review page loads avatars from github.com; without internet it shows none.
metadata:
  internal: true
---

# Guided PR review

The end goal is a GitHub review of one pull request (PR), written and approved by the human reviewer. The result is an interactive review page, served on the user's computer by the review server in this skill. The review page shows every change in the PR, flow by flow and hunk by hunk, with AI context, explanations and suggested remarks. The reviewer decides on each remark. Everything that goes to GitHub is posted from a button in the review page, exactly as the review page shows it. The task is done when the reviewer has posted the final review from the review page, or tells you to stop.

The reviewer stays in control. You prepare, explain and answer. You MUST NOT write the review for the reviewer, post anything they did not press a button for, or dump your findings in the chat instead of the review page.

A stack is a chain of PRs in one repository: each PR's base branch is the head branch of the PR below it. A PR in a stack is still reviewed alone, with its own review directory and review page; the other PRs in the stack are context. Everything about stacks in this skill applies only when the PR is in a stack with at least one other PR. Otherwise, skip every rule about stacks, and `review.json` gets no `stack` field.

## Preflight

You MUST complete these checks in order and mark each one done before you continue.

1. [ ] The user named a PR (URL, or number plus repository), a stack (number plus repository) or a Jira ticket key. If not, ask. Do not guess a PR from the current branch.
2. [ ] This session is not already running a guided review for another PR, except the reviews of one stack that this session started. If it is, stop and ask the user to start this review in a new session: one session MUST run only the reviews of one PR or one stack. It MUST NOT handle a review that another live session watches.
3. [ ] `git` is available, and `node --version` matches `^22.22.3 || ^24.15.0 || >=26`. If not, stop and tell the user.
4. [ ] You can read the PR and post reviews on GitHub, through the `gh` CLI or a GitHub tool. If not, stop and tell the user. Only GitHub is supported.
5. [ ] You can run a background process and act on each line it prints while the user works, and the user has a browser on this computer. If not, stop and tell the user that this skill needs both.
6. [ ] You know the one PR to review. For a Jira ticket: read its development links with a tool that can read Jira. If you have no such tool, or the ticket links no PR, stop and ask for a PR URL. If it links several PRs, list them with repository, title and state, and ask the user to pick one. Keep the others as linked PRs for the context step.
   Then run `node scripts/review-data.js stack <owner>/<repo> <pr-number>`. For a stack number, run it for the bottom PR of `GET /repos/{owner}/{repo}/stacks/<number>`. It prints the stack as JSON, bottom to top. It prints `null` when the PR is in no stack or alone in it. When it exits 3, open PRs split above `split.base`. List the PRs in `split.prs` with title and state, and ask which one to follow. Then run it again for that PR.
   When the user named a stack or a ticket that links PRs of one stack, ask which PR to review. Suggest the lowest PR in the stack that is neither merged nor approved by the user. The user can pick another one. A PR is approved when the user's latest review on it in `GET /repos/{owner}/{repo}/pulls/{n}/reviews` is `APPROVED`. Ignore `COMMENTED` reviews.
7. [ ] You know the PR size. The PR is big when it has more than 10 changed files or more than 1000 changed lines (additions plus deletions). Otherwise it is small. If GitHub does not report the counts, count them in the diff.
8. [ ] Big PR only: you have a local clone of the repository. If you do not know where it is, ask the user for the path. If the user's instructions or memory name a location for clones, suggest that path. If there is no clone, stop. Ask the user before you create a worktree for the PR head in that clone. You MUST NOT change the branch or the working tree of the clone itself.
9. [ ] The review directory exists: run `node scripts/review-data.js dir <owner>/<repo> <pr-number>`. It prints the path: `$XDG_STATE_HOME/guided-pr-review/<owner>/<repo>/<pr-number>/`, or `~/.local/state/…` when `XDG_STATE_HOME` is not set. It holds the PR diff, `review.json`, `reviewer.json` and `events.jsonl`. It is deleted only when the user agrees in step 8; otherwise it stays for a later resume. If it already holds `review.json`, this is a resume: follow Resume below. The base is the PR's base branch on GitHub. Save its name as `pr.baseRef` when you write `pr` in step 2. If the command fails, stop and tell the user.

## Steps

### 1. Read the context

Read these, and only these. Fetch each PR, issue and ticket once; skip a link to something you already read.

- The PR: title, description, author, head commit, CI checks, and all comments, including bot comments. Also the login of the authenticated GitHub user, for `viewer`.
- The PR's reviews and review comments, with their threads, also resolved ones. Keep apart the ones by the user (the authenticated GitHub user) and the ones by others. You need each thread's GraphQL ID, `isResolved`, `resolvedBy`, `isOutdated`, `viewerCanResolve` and `viewerCanUnresolve`, so read the threads with `gh api graphql` (`pullRequest.reviewThreads`).
- The Jira keys (`ABC-123`) and GitHub issues named in the PR description. For Jira you need a tool that can read Jira. Without one, skip Jira and add that to `context.skipped`.
- The PRs that those tickets link to.
- The PRs that the reviewed PR links to directly, also in other repositories.
- Open tickets about the code this PR changes, in the trackers of the linked tickets. Search by the changed file paths, the module and component names, and the key terms of the PR title. Put the ten most relevant in `context.relatedTickets`, or leave it empty when none match. Without a tool that can search a tracker, add that to `context.skipped`.

Do not follow links found in linked PRs.

In a stack, also:

- Read every ticket that any PR in the stack links, and use them as this PR's tickets.
- Read the other PRs only as highlights: title, description, changed files with line counts, and linked tickets. You MUST NOT read their full diffs here.
- When an earlier review in this stack has a `review.json`, reuse its tickets, related tickets, linked PRs and conventions, and do not read them again.
- Write `stack` as described in `references/review-data.md`: one line per PR on what it does and how it relates to the PRs next to it, the criteria that another PR is expected to meet, and the changes that no ticket asks for.

### 2. Get the hunks

Save the PR diff to a file in the review directory and run `node scripts/review-data.js hunks <diff-file> <review-dir>/review.json`. It writes the `hunks` array into `review.json` and prints one line per hunk: ID, file, and whether it is new. Every hunk MUST reach the reviewer, also renames, binary files and lockfiles.

A tool, not a person, writes some files: dependency lockfiles, built bundles, snapshots, generated code. Such a file MUST be one hunk. When the output shows several hunks for such a file, run the command again with `--whole <path>` for each one.

Small PR: read the diff and the files you need through GitHub. Save the PR head version of every changed file that the PR does not remove to `<review-dir>/files/<path in the repository>`, so the review page can show the whole file.

Big PR: read them in the worktree. Set `pr.localPath` to the absolute path of the worktree. The review page then reads whole files there, and links each file to VS Code, PHP files to PhpStorm, and each file to its folder.

### 3. Find the flows

Find how the changed code fits together, using change untangling and ordering related changes together. This is the most important step. Take the time it needs: read the surrounding code, not only the diff.

- Untangle the changes (change untangling, Barnett et al., ICSE 2015): split the PR into groups of changes that depend on each other, where one change defines or calls code that another change uses. Each group becomes a flow. A hunk that two groups use, such as a shared function, goes in both flows. Documentation, tests and configuration belong with the changed code they document, test or configure: put them next to that code, in each flow that has it. A change that covers no changed code and is used by none, such as a lockfile or a format change, goes in its own flow or in `notInAnyFlow`, not in the flow of other changes.
- Order related changes together (Baum et al., Empirical Software Engineering 2019): in a flow, put hunks that depend on each other next to each other, such as a function and its callers, so the reviewer does not keep a change in memory while reading unrelated hunks.
- A flow is a path through the code, with a name in plain words, an entry point and an end point (fully qualified code names with their namespace or module path, such as `App\Weather\ForecastClient::fetch()` or `src/api/weatherClient.ts:fetchForecast()`, not sentences) and the ordered hunks it passes through.
- Order the steps bottom-up by default (bottom-up program comprehension, Pennington): for example the request to a backend first, then the model that holds the data, the repository that works with it, and last the UI or public API that shows it.
- Order the steps top-down (top-down program comprehension, Brooks) when the PR adds a new entry point, such as a new endpoint or command: start at the entry point and follow the calls down.
- Each step says in one line why it comes at that place.
- Each flow has an `icon`: the name of a Lucide icon (https://lucide.dev/icons) that shows what the flow does, for example `database` or `globe`. Give each flow a different icon.
- A flow MUST name the acceptance criteria of the linked tickets that it resolves. A flow that resolves none MUST get `noCriteria`: one line that says why, for example that no linked ticket lists criteria, or that the criteria belong to other flows.
- A hunk MAY be in several flows. A hunk that is in no flow goes in `notInAnyFlow`.
- Decide from the code how best to present this PR. When code paths do not apply, set `layout` to `directory` and leave `flows` empty. The review page then lists files by directory, then alphabetically.

Write a short `explanation` for each flow and each hunk, for a reviewer who does not know this code. Name the concepts the code uses; do not invent new terms.

Then run `node scripts/review-data.js check <review-dir>/review.json --diff <diff-file>`, with the diff file from step 2. Fix every line it prints and run it again until it prints `ok`. A `diff:` line means `review.json` and the diff file hold different hunks: run `hunks` again with the same `--whole` options. A `review.json` from before `wholeFiles` existed gives `diff:` lines for its whole files; the same `hunks` run repairs it. It also rejects a `stack` field that breaks the rules in `references/review-data.md`.

### 4. Read the conventions

Read the target repository's contribution guide and agent instruction files, if it has them. Also read the reviewer's own user-level agent instruction files, if your harness has them. Give the code rules from both to every review check in step 5.

- AI disclosure: if they describe how to disclose AI use in reviews or comments, put the exact text in `conventions.disclosure`. If they do not, leave it empty.
- Severity: if they define severity labels for review remarks, use those. Otherwise use `nit`, `minor`, `medium`, `major`, with `requestChangesFrom` set to `minor`.

### 5. Run the AI reviews

First let the user choose. Look through the skills available to you for ones that review code. Use skills only, not agent types. Keep the ones that fit this PR's language, platform and kind of change, and drop a skill that duplicates another one or a check below. Then ask the user in two rounds, all options selected at the start. First the angles, which group the checks below: spec (acceptance criteria and scope), code standards (conventions, new concepts and new terms), sources (hardcoded values and factual claims), and tests and breaking changes; each with one line on what it checks. Then, for the angles the user kept, the review skills you would use for each angle: each skill by its exact name, with its angle and one line on why it fits. An angle with no fitting skill runs its checks only; a skill that fits no angle gets an option of its own. Say how many subagents you would start; the test coverage check runs in this session and does not count. If you can ask the user a structured multiple-choice question, use it for both rounds, so the user can confirm or change the selection; otherwise ask in the chat. In a stack, ask both rounds again for each PR. While a review page of this session is open, run `waiting` before you ask, as step 7 says. Run only what the user chose, once for each PR, before you open its review page. If you can start a subagent, run the chosen checks there, in no more subagents than the user agreed to. Otherwise, run them yourself.

Give each subagent a brief with these parts, and nothing more:

1. The checks it runs: one review skill, or one or more of the built-in checks below, with their text. Run the test coverage check yourself, not in a subagent, because it reads the CI checks and bot comments with this session's tools.
2. Where the PR is: the repository, the PR number, the head commit, the path of the diff file from step 2, and the list of hunks with their ID, file and line ranges. For a big PR, also the worktree path. Tell the subagent where its review skill reads the code: for a big PR, run the skill from the worktree, because a skill such as security-review reviews the git diff of the folder it runs in; for a small PR, give the skill the diff file instead.
3. The tickets as read in step 1, only for the checks of acceptance criteria and scope.
4. The code rules and the severity labels from step 4.
5. The answer format: a JSON list of findings, each with `hunkId` (null for the whole PR), `line`, `side`, `severity`, `title`, `body` and `rule`; an empty list when the checks find nothing. The acceptance criteria check also returns, per criterion ID, a `verdict` and a one-line `note`.

Leave out your own view of the PR, the flows, and the findings of other checks, so each subagent reviews the code without your conclusions. When a review skill answers in its own format, convert its findings to this format yourself and keep its wording in `body`.

Attach each finding to the hunk and line it is about, or set `hunkId` to null for a finding about the whole PR. When an open ticket in `context.relatedTickets` already covers a finding, name that ticket's key in the finding. Write each finding `body` as the comment text that would be posted, without the severity label and without the disclosure; the review page adds both.

- Use the review skills that are available to you. Skills of the target project take precedence.
- Verify that the PR meets the acceptance criteria of the linked tickets. Give each criterion a `verdict` and a one-line `note`. For each criterion with the verdict `not-met`, you MUST also write one finding for the whole PR (`hunkId` null) with `rule` `acceptance-criteria`, the criterion ID at the start of its `title`, a `body` that says what is missing, and the severity the user's conventions give a missing requirement, else `major`. When a criterion becomes `met` or `elsewhere`, remove its finding. `check` rejects a `not-met` criterion without such a finding. When a ticket lists no acceptance criteria, take them from its description and set `source` to `description`. When you found no criteria to check for a flow, you MUST keep or write its `noCriteria`.
- Verify that the PR makes no changes beyond what the tickets ask for. If it does, the PR description must say why.
- Verify that the changes follow the project's conventions and coding standards.
- Verify test coverage, only when the project has a test suite:
  - Read coverage from the PR's CI checks and bot comments. You MUST NOT calculate coverage yourself, from the diff, from reading tests or otherwise.
  - If CI and bot comments give no coverage, add a finding with the lowest severity that says coverage could not be determined, and why. It does not block the review.
  - You MUST NOT run the test suite, run coverage tooling or install dependencies.
- Verify that the PR names breaking changes if it introduces them.
- Verify that the code does not invent new concepts. A new concept must be explained and justified.
- Verify that the PR does not hardcode what a dependency already owns. List every map, limit, list of allowed values and business rule that the PR hardcodes. For each one, check whether an API specification, a library the project depends on, or, when the repository's docs name one, a reference implementation already provides it or handles it differently.
- Verify every factual claim in new or changed comments, docblocks and documentation against the source it names.
- Verify that every new term and abbreviation is defined where it first appears, and is the word that the platform, the libraries it uses or the API use for that thing.

In a stack, also:

- A finding goes to the PR that adds or changes the line. You MUST NOT repeat a finding that another review in this stack already has; name that PR instead.
- For each finding, decide how far to read in the other PRs. For a local problem, such as a wrong value or a missing check, read only their changes to the same file and lines. For a flow that this PR does not finish, follow that flow into the later PRs, and read only the files and functions on its path.
- Add a paragraph that starts with `In the stack:` to the finding's `body`. It says whether another PR fixes the problem or makes it worse, and names the PRs and files you read. When you only expect it from the highlights, say so and mark it "not checked". Write no such paragraph when no other PR touches the finding's code. The finding keeps its severity when another PR fixes it or makes it worse.
- Use the acceptance criteria IDs and texts of the first review in this stack. Check a criterion in the highest PR that completes it. In a lower PR, give it the verdict `elsewhere` with `pr` set to that PR's number, and no finding.
- Work in this PR that belongs to another PR's ticket is a finding.

Always verify the existing review comments from step 1, whatever the user chose above:

- Reviews: add every submitted review, by the user and by others, to `reviews`, with its body verbatim and its `commit_id` as `commitId`. You MUST leave out a `COMMENTED` review that has no body and no comments of its own.
- Comments by others: add each one to `reviewComments` with its body and replies exactly as their authors wrote them. You MUST NOT restate, shorten or correct them. For an open one, add an `opinion`: whether the comment is right (agree, disagree or not sure), and why, in one line. The opinion does not say whether the author fixed it. When commits came after the comment, also add a `fix` as for the user's own remarks, without `reply`.
- The user's own remarks, posted or pending: add each to `ownRemarks`. For each posted one that is not resolved, and each posted one that someone other than the user resolved, with or without new commits, read the code at its lines now, the commits since the comment and the replies, and add a `fix`: whether the author fixed it, with a one-line note that names the commit or line, and for `not-fixed` a short draft reply that says what is still missing. For each pending one and each posted one that is not resolved, also add an `opinion` as for comments by others. Put the ID and body of the user's pending review, if any, in `ownPendingReview`.

### 6. Open the review page

Write `review.json` as described in `references/review-data.md`. In every text you write for the review page (explanations, findings, answers), refer to tickets, issues and PRs by key or number only, for example `ABC-123` or `#123`, never with their URL: the review page links them and shows their title. Then:

- Run `node scripts/review-server.js`. It starts the review server, or finds the one that runs, and prints `READY <url>`. The review page of this PR is at `<url><owner>/<repo>/<pr-number>`. Give the user that URL. One review server serves every review on this computer, and it stops itself 10 minutes after the last agent stopped watching. It keeps `server.json` (its URL and process ID) and `server.log` in the state directory itself; they stay until the user deletes that directory.
- From the directory this session runs in, run `node scripts/review-data.js watch <review-dir>` as a background process, with `--worktree <path>` for a big PR. Run it in a way that notifies you of each new line it prints, for example by monitoring the process output. A background command that reports only when it exits does not wake you for events, so the review page waits for an answer that never comes. It records this session in `session.json`, so the review page can tell the user how to come back to this session, and it prints each event from the review page as an `EVENT` line. While it runs, the review page shows that an agent is connected. When it exits 4, another live process watches this review: stop and tell the user to continue the review in that session. When the user pauses the agent in the review page, the watch prints `PAUSED` and then no events until it prints `RESUMED`; keep it running. After 30 minutes without an event other than `check`, the watch prints `IDLE` and exits; a paused review counts as quiet too.

Tell the user in two or three sentences what the PR does and how many flows and hunks there are. Do not list findings in the chat; they are in the review page.

### 7. Respond to the review page

Each event from the review page is one request. Its `review` field names the PR; handle it only in that PR's review directory. In a stack, the events of every review in this stack that this session started are this session's. If an event names another PR, do not handle it, and tell the user once that the review page of that PR is sending its events to this session. The watch prints it as an `EVENT` line; it is also in `events.jsonl`. Handle each event when it arrives as the events table in `references/review-data.md` says, update `review.json`, and keep watching until the final review is posted.

- Base answers to `ask` events on the code and the context you read. Write them in markdown.
- For a `summarize` event, write the review summary from the remarks in the event only, in plain text the reviewer can edit. The remarks are posted right below the summary, as line comments and as a list of whole-PR remarks, so the summary is a short reading guide to them, in at most 5 sentences:
  1. How serious the remarks are as a whole: which ones block the merge and which are small, by count or by severity, not one by one.
  2. A shared cause: when several remarks point to the same problem or symptom, name it once and say how many remarks or which places show it.
  3. What the author should do first.
  Group the remarks by the problem or the part of the code they share, with their weight, in the reviewer's first person. For example: "I have several remarks that point to code that is more complex than it needs to be, a few medium issues in the controllers, and some nits in the docs."
  Follow the user's review conventions. Do not add the disclosure; the review page adds it.
- When the user says that the review page waits for an answer, read the watch output: an event you were not woken for may be there.
- No events for a while is normal: the user paused the agent (the watch printed `PAUSED`), the review page is in a hidden tab, or the user stepped away. You MUST NOT ask the user to finish because no events came.
- When the watch prints `IDLE`, the review was quiet for 30 minutes: end it as after `finish` (step 8). When the watch stops without `IDLE`, for example because the harness ends background processes after a time limit, start it again in silence with the same arguments plus `--restart` (repeat `--worktree` for a big PR), without a line in the chat. It prints the events that came while no watch ran, then continues after recent activity, or prints `IDLE` at once when the review was quiet. When this restart exits 4, the old watch still runs: do nothing.
- The review page sends a `check` event when it opens and every 5 minutes after that. Handle it as the events table says: it updates reviews and comments and writes `remote`, but never changes hunks, flows or findings. Only a `refresh` event does that. When a `check` finds one of the user's comments newly resolved by someone else, write a new `fix` for it, as in step 5. When a call to GitHub fails during a `check`, leave `remote` as it is for the failed call and write `remote.error` with the error message. Remove `remote.error` at the next `check` that succeeds.
- After a `refresh` event that loaded a new head commit, also write a new `fix` for each open posted comment, the user's and others', and for each of the user's comments that someone else resolved, as in step 5. Report the result of every `refresh` in `refreshes` and `changesSince`, not in the chat.
- In a stack, every `check` and `refresh` also runs `node scripts/review-data.js stack` again and updates the `stack` field, so a PR that was added, merged or moved shows on the review page.
- For a `start-review` event: the review page already created the review directory of PR `number` with a `preparing` file, and the reviewer now looks at that PR's page, which waits for `review.json`. First run `dir` for PR `number` and `node scripts/review-data.js preparing <review-dir> "Reading the PR"`, before you ask anything. Write `review.json` as soon as it has the PR and its hunks, and add flows and findings to it as you go: the page shows each part when it appears. Then run Preflight items 7 to 9 and steps 1 to 6 for that PR, with a separate watch for it. Keep handling the events of the other reviews in between.
- While a review page can be open and you still work on that review, keep the review page informed: at the start of each step, run `node scripts/review-data.js preparing <review-dir> "<what you do now>"`, for example "Finding the flows" or "Running the AI reviews". The review page then shows that the review is not complete yet. When the findings of step 5 are in `review.json`, run `node scripts/review-data.js prepared <review-dir>`.
- Before every question you ask the user in the chat while a review page of this session is open, run `node scripts/review-data.js waiting "<question>" <review-dir>...` with the review directory of every review this session handles. Each of those review pages then shows that you wait. After the answer, run `node scripts/review-data.js answered <review-dir>...` with the same directories.
- For a `post` event, post the payload exactly as it is: no extra text, no changed words, no other comments. Read `references/posting.md` for the GitHub requests. The button press is the reviewer's approval. You MUST NOT post at any other moment, and you MUST NOT ask for a second approval in the chat.

Handle every event in silence: the review page shows the result, so you MUST NOT write anything in the chat for it, not even a short confirmation. The exceptions are the final `post` and `finish`: after those, do step 8. When the user asks you something in the chat instead, answer there too.

You MUST write the result of each event to `review.json` before you write anything in the chat. Until `finish`, you MUST NOT use a tool that waits for the user's answer, such as a question with choices. Ask in plain chat text, so you keep handling events. The one exception is the angle and skill questions of a review that `start-review` started. For those, first run `waiting` for every review directory this session handles, then ask the structured multiple-choice question. While it is open, the events of the other reviews wait; the review pages show the reviewer that you wait. After the answer, run `answered`, then handle the events that came in.

### 8. Finish

- While the PR is open, you MUST keep the review directory and, for a big PR, the worktree. You MUST NOT offer to delete them. After a final `post`, keep the watch running. After `finish` or `IDLE`, stop the watch and tell the user in one line that the review is kept and that this skill resumes it for the PR. In a stack, `finish` or `IDLE` ends the review of that PR only; the task is done when no review of this session is still open.
- When the PR is merged or closed, ask the user before you delete the review directory and the worktree.

## Resume

A review directory with a `review.json` means the reviewer stopped earlier.

- Before you open the review pages again, run `node scripts/review-data.js answered <every review dir of this session>`, because a session that died may have left a `waiting` question. Run `node scripts/review-data.js prepared <dir>` for every review dir of this session that has `review.json`, because a session that died may have left a `preparing` step; set it again for a review you still work on. For a review directory without `review.json`, start that review again when a `start-review` event for it is still waiting, else remove the whole directory.
- If `pr.baseRef` is absent (a review from before this field), set it to the PR's base branch on GitHub without telling the user.
- If the PR's base branch on GitHub is not `pr.baseRef`, tell the user that the base changed and set `pr.baseRef` to the new base. Fetch the diff against the new base, then run steps 1 and 2 and `check <review-dir>/review.json --diff <diff-file>` again, as for a changed head commit, because hunk IDs depend on content.
- If the PR head commit is the same as `pr.headSha`: open the review page again (step 6).
- If it changed: write `changesSince` (see `references/review-data.md`), then run steps 1 and 2 again. Hunk IDs depend on the hunk content, so unchanged hunks keep their ID, explanation and "seen" state, and changed hunks get a new ID and show as not reviewed. Run steps 3 to 5 for the new hunks only, keep the findings of unchanged hunks with their IDs, and run `check <review-dir>/review.json --diff <diff-file>` again, with the new diff file. Then open the review page again.
- In a stack, a rebase of a lower PR gives every PR above it a new head commit. Update the reviews of this session from the bottom up. To compare with what the reviewer saw, run `node scripts/review-data.js own-diff <clone> <old-head> "<subject of the PR's first own commit>"`. `<clone>` is the local clone from Preflight item 8, and `<old-head>` is the previous `pr.headSha`. It prints the PR's own diff at the old head. Run `hunks` on that diff with a copy of `review.json` to get the old hunk IDs. Then run steps 2 to 5 as above: a finding whose hunk ID comes back in the new hunks stays as it is. A finding whose hunk is gone is dropped, or written again for the new hunk when the problem is still there. A posted comment gets a new `fix`, as in step 5. When there is no clone, or `own-diff` fails for any reason (for example `no commit with subject`, `subject matches more than one commit`, or `bad revision` when the old head is not in the clone), compare the full new diff instead.
- In a stack, a `start-review` event that the review page sent after `finish`, while no agent watched, still waits: handle it as step 7 says when you resume.

## Self-healing

The task is done after `finish` or `IDLE`, or when the user stops the review in the chat. The final `post` does not end it. When the task is done and the user corrected you, or this skill gave wrong or incomplete guidance, offer to draft an issue for https://github.com/FreekVR/skills/issues describing the problem as it relates to this skill. You MAY also offer a pull request that improves the skill. You MUST show the draft and open it only after the user agrees. You MUST NOT include personal, company or repository-specific data. You MUST add the AI disclosure.
