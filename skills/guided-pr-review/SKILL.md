---
name: guided-pr-review
description: Use when a developer wants to review a GitHub pull request themselves with guidance, for example "guide me through PR 123", "walk me through this pull request", "help me review this PR step by step", "I need to review PR <url> but don't know this code", or "review the PR for ticket ABC-123 with me". Do not use when the user wants the agent to review a PR on its own and only report or post the result, to review local uncommitted changes, to answer review comments on their own PR, or for GitLab or Bitbucket.
compatibility: Needs Node.js 22.22.3 or a newer 22, 24.15 or a newer 24, or 26 and up, git, read and write access to GitHub, and a browser on the same computer. Questions, longer explanations and posts from the review page also need a background process whose output the agent can watch; without one, the review page is a static file without them. The review page loads avatars from github.com; without internet it shows none.
---

# Guided PR review

The end goal is a posted GitHub review of one pull request (PR), written and approved by the human reviewer. The skill gives them an interactive review page, served on the user's computer by the review server in this skill. It shows every change in the PR one hunk at a time, through logical and easy to follow flows, with explanations for a reviewer who does not know the code. Optional AI-generated remarks can be selected by the user to include with their own review. The reviewer decides on each remark, and everything that goes to GitHub is posted from a button in the review page, exactly as the page shows it. The task is done when the reviewer has posted the final review from the review page, or tells you to stop.

The reviewer stays in control. You prepare, explain and answer. You MUST NOT write the review for the reviewer, post anything they did not press a button for, or dump your findings in the chat instead of the review page.

Read these references only when they apply:

- `references/stack.md`: the PR is in a stack with at least one other PR. Each of its sections names the step it belongs to. Without a stack, skip every stack rule, and `review.json` gets no `stack` field.
- `references/static-page.md`: you cannot run a background process (Preflight item 5).
- `references/resume.md`: the review directory already holds `review.json`.
- `references/review-data.md`: the files and fields of the review directory, and the events table. Read it before you write `review.json`.
- `references/posting.md`: a `post` event.

## Preflight

You MUST complete these checks in order and mark each one done before you continue.

1. [ ] The user named a PR (URL, or number plus repository), a stack (number plus repository) or a ticket key from an issue tracker such as Jira. If not, ask. Do not guess a PR from the current branch.
2. [ ] This session is not already running a guided review for another PR, except the reviews of one stack that this session started. If it is, stop and ask the user to start this review in a new session. One session MUST run only the reviews of one PR or one stack, and MUST NOT handle a review that another live session watches, because both would answer the same review page.
3. [ ] `git` is available, and `node --version` matches `^22.22.3 || ^24.15.0 || >=26`. If not, stop and tell the user.
4. [ ] You can read the PR and post reviews on GitHub, through the `gh` CLI or a GitHub tool. If not, stop and tell the user. Only GitHub is supported.
5. [ ] The user has a browser on this computer. If not, stop and tell the user that this skill needs one. Then check that you can run a background process and act on each line it prints while the user works. If you cannot, continue with `references/static-page.md`.
6. [ ] You know the one PR to review.
   - For a ticket: read its development links with a tool that can read that tracker. If you have no such tool, or the ticket links no PR, stop and ask for a PR URL. If it links several PRs, list them with repository, title and state, and ask the user to pick one. Keep the others as linked PRs for step 3.
   - Run `node scripts/review-data.js stack <owner>/<repo> <pr-number>`. It prints the stack as JSON, bottom to top, or `null` when the PR is in no stack or alone in it. For a stack number, a ticket that links PRs of one stack, a stack in the output or exit code 3, follow "Preflight item 6" in `references/stack.md`.
7. [ ] You know the PR size. The PR is big when it has more than 10 changed files or more than 1000 changed lines (additions plus deletions); otherwise it is small. If GitHub does not report the counts, count them in the diff.
8. [ ] Big PR only: you have a local clone of the repository. If you do not know where it is, ask the user for the path; when the user's instructions or memory name a location for clones, suggest that path. If there is no clone, stop. Ask the user before you create a worktree for the PR head in that clone. You MUST NOT change the branch or the working tree of the clone itself, because the user may be working in it.
9. [ ] The review directory exists: run `node scripts/review-data.js dir <owner>/<repo> <pr-number>`. If the command fails, stop and tell the user.
   - It prints the path: `$XDG_STATE_HOME/guided-pr-review/<owner>/<repo>/<pr-number>/`, or `~/.local/state/…` when `XDG_STATE_HOME` is not set. It holds the PR diff, `review.json`, `reviewer.json` and `events.jsonl`. It is deleted only when the user agrees in step 10; otherwise it stays for a later resume.
   - If it already holds `review.json`, follow `references/resume.md`.
   - Save the name of the PR's base branch on GitHub as `pr.baseRef` when you write `pr` into `review.json`.

## Steps

Do the steps in order. Step 2 starts when the watch starts in step 1 and keeps running next to the other steps. These may overlap:

- Step 7 starts as soon as the subagents of step 6 run; it does not wait for their answers.
- Step 8 does not wait for step 7. The test coverage check and the existing review comments in it MAY start at once; the findings of the subagents as soon as they answer.
- Step 9 waits for steps 7 and 8. While steps 7 and 8 run together, the `preparing` text names both, for example "Finding the flows and checking the findings".

### 1. Open the review page

Give the user the review page before you prepare the review, so they can follow it while you work.

1. Run `node scripts/review-data.js preparing <review-dir> "Reading the PR"`. The review page then shows that the review is not complete yet, and shows each part of `review.json` when it appears.
2. Run `node scripts/review-server.js`. It starts the review server, or finds the one that runs, and prints `READY <url>`. Give the user the URL of this PR's review page: `<url><owner>/<repo>/<pr-number>`.
   - One review server serves every review on this computer, and it stops itself 10 minutes after the last agent stopped watching. It keeps `server.json` (its URL and process ID) and `server.log` in the state directory; they stay until the user deletes that directory.
3. From the directory this session runs in, run `node scripts/review-data.js watch <review-dir>` as a background process, with `--worktree <path>` for a big PR, and `--resume` when you resume the review, so it first prints the events that the review page sent while no agent watched.
   - Run it in a way that notifies you of each new line it prints, for example by monitoring the process output. A background command that reports only when it exits does not wake you for events, so the review page waits for an answer that never comes.
   - It records this session in `session.json`, so the review page can tell the user how to come back to this session, and prints each event from the review page as an `EVENT` line. While it runs, the review page shows that an agent is connected.
   - When it exits 4, another live process watches this review: stop and tell the user to continue the review in that session.
   - After 30 minutes without an event other than `check`, it prints `IDLE` and exits.

While a review page can be open and you still work on that review, run `node scripts/review-data.js preparing <review-dir> "<what you do now>"` at the start of each step, for example "Finding the flows" or "Running the AI reviews". When the flows of step 7 and the findings of step 8 are in `review.json`, run `node scripts/review-data.js prepared <review-dir>`.

### 2. Respond to the review page

Step 2 starts when the watch runs and keeps running next to all other steps until step 10. Until you run `prepared`, skip `check` events, because `review.json` is not complete yet; the review page sends the next one within 5 minutes. Keep the other events and handle them after `prepared`, in the order they came.

Each event from the review page is one request. The watch prints it as an `EVENT` line; it is also in `events.jsonl`. Its `review` field names the PR: handle it only in that PR's review directory. If an event names a PR that is not this session's, do not handle it, and tell the user once that the review page of that PR sends its events to this session. Handle each event when it arrives as the events table in `references/review-data.md` says, update `review.json`, and keep watching until the final review is posted.

- `ask`: base the answer on the code and the context you read. Write it in markdown.
- `summarize`: write the review summary from the remarks in the event only, in plain text the reviewer can edit, in at most 5 sentences. The remarks are posted right below it, as line comments and as a list of whole-PR remarks, so the summary is a short reading guide to them:
  1. How serious the remarks are as a whole: which ones block the merge and which are small, by count or by severity, not one by one.
  2. A shared cause: when several remarks point to the same problem or symptom, name it once and say how many remarks or which places show it.
  3. What the author should do first.

  Group the remarks by the problem or the part of the code they share, with their weight, in the reviewer's first person. For example: "I have several remarks that point to code that is more complex than it needs to be, a few medium issues in the controllers, and some nits in the docs." Follow the user's review conventions. Do not add the disclosure; the review page adds it.
- `check`: the review page sends one when it opens and every 5 minutes after that. It updates reviews and comments and writes `remote`, but never changes hunks, flows or findings; only a `refresh` event does that.
  - When it finds one of the user's comments newly resolved by someone else, write a new `fix` for it, as in step 8.
  - When a call to GitHub fails, keep the other fields of `remote` as they are, set `remote.checkedAt` and write `remote.error` with the error message. Remove `remote.error` at the next `check` that succeeds.
  - In a stack, also follow "Step 2" in `references/stack.md`.
- `refresh`: follow `references/resume.md` for a changed head commit. After it loaded a new head commit, also write a new `fix` for each open posted comment, the user's and others', and for each of the user's comments that someone else resolved, as in step 8. Report the result in `refreshes` and `changesSince`, not in the chat. In a stack, also follow "Step 2" in `references/stack.md`.
- `post`: post the payload exactly as it is: no extra text, no changed words, no other comments. Read `references/posting.md` for the GitHub requests. The button press is the reviewer's approval. You MUST NOT post at any other moment, and you MUST NOT ask for a second approval in the chat.
- `start-review`: see "Step 2" in `references/stack.md`.

Rules while the review page is open:

- Handle every event in silence: the review page shows the result, so you MUST NOT write anything in the chat for it, not even a short confirmation. The exceptions are the final `post` and `finish`: after those, do step 10. When the user asks you something in the chat instead, answer there too.
- You MUST write the result of each event to `review.json` before you write anything in the chat.
- Until `finish`, you MUST NOT use a tool that waits for the user's answer, such as a question with choices: ask in plain chat text, so you keep handling events. The only exception is in `references/stack.md`.
- Before every question you ask the user in the chat, run `node scripts/review-data.js waiting "<question>" <review-dir>...` with the review directory of every review this session handles, so each of those review pages shows that you wait. After the answer, run `node scripts/review-data.js answered <review-dir>...` with the same directories.
- When the user says that the review page waits for an answer, read the watch output: an event you were not woken for may be there.
- No events for a while is normal: the review page is in a hidden tab, or the user stepped away. You MUST NOT ask the user to finish because no events came.
- When the watch prints `IDLE`, the review was quiet for 30 minutes: end it as after `finish` (step 10). The exception is an `IDLE` before you ran `prepared` for that review: the review page waits for you and sends no events, so start the watch again with the same arguments, without `--restart`.
- When the watch stops without `IDLE`, for example because the harness ends background processes after a time limit, start it again in silence with the same arguments plus `--restart` (repeat `--worktree` for a big PR), without a line in the chat. It prints the events that came while no watch ran, then continues after recent activity, or prints `IDLE` at once when the review was quiet. When this restart exits 4, the old watch still runs: do nothing.

### 3. Read the context

Read these, and only these. Fetch each PR, issue and ticket once; skip a link to something you already read. Do not follow links found in linked PRs, so the context stays about this PR.

Read the other PRs, linked ones and the other PRs in a stack, as highlights only: title, description, changed files with line counts, and linked tickets. You MUST NOT read their full diffs here. Read more of another PR only when a finding needs it, for example to judge whether that PR fixes the problem or makes it worse.

- [ ] The PR: title, description, author, head commit, the full commit messages being merged to the target branch, CI checks, and all PR comments from GitHub, including bot comments. Also the login of the authenticated GitHub user, for `viewer`.
- [ ] The PR's reviews and review comments, with their threads, also resolved ones. Keep apart the ones by the user (the authenticated GitHub user) and the ones by others. Read the threads with `gh api graphql` (`pullRequest.reviewThreads`), because you need each thread's GraphQL ID, `isResolved`, `resolvedBy`, `isOutdated`, `viewerCanResolve` and `viewerCanUnresolve`.
- [ ] The ticket keys from Jira or another issue tracker (`ABC-123`) and the GitHub issues named in the PR description. You MUST read the title, description, any custom fields, and all comments of each one. For a tracker other than GitHub you need a tool that can read it; without one, skip that tracker and add that to `context.skipped`.
- [ ] The PRs that those tickets link to, and the PRs that the reviewed PR links to directly, also in other repositories.
- [ ] Open tickets about the code this PR changes, in the trackers of the linked tickets. Search by the changed file paths, the module and component names, and the key terms of the PR title. Put the ten most relevant in `context.relatedTickets`, or leave it empty when none match. Without a tool that can search a tracker, add that to `context.skipped`.

### 4. Get the hunks

1. Save the PR diff to a file in the review directory.
2. Run `node scripts/review-data.js hunks <diff-file> <review-dir>/review.json`. It writes the `hunks` array into `review.json` and prints one line per hunk: ID, file, and whether it is new. Every hunk MUST reach the reviewer, also renames, binary files and lockfiles.
3. A file that a tool writes, such as a dependency lockfile, a built bundle, a snapshot or generated code, MUST be one hunk. When the output shows several hunks for such a file, run the command again with `--whole <path>` for each one. Write each `--whole` and each path out as separate arguments; do not collect them in a shell variable, because zsh does not split a variable into words.
4. Read the files you need:
   - Small PR: read the diff and the files through GitHub. Save the PR head version of every changed file that the PR does not remove to `<review-dir>/files/<path in the repository>`, so the review page can show the whole file.
   - Big PR: read them in the worktree. Set `pr.localPath` to the absolute path of the worktree. The review page then reads whole files there, and links each file to VS Code, PHP files to PhpStorm, and each file to its folder.

### 5. Read the conventions

Read the target repository's contribution guide and agent instruction files, if it has them, and the reviewer's own user-level agent instruction files, if your harness has them. Give the code rules from both to every review check in step 6.

- AI disclosure: if they describe how to disclose AI use in reviews or comments, put the exact text in `conventions.disclosure`. Otherwise leave it empty.
- Severity: if they define severity labels for review remarks, use those. Otherwise use `nit`, `minor`, `medium`, `major`, with `requestChangesFrom` set to `minor`. You MUST give each finding the label whose meaning below fits it. With the repository's own labels, use the label nearest to that meaning:
  - `major`: the PR breaks behaviour, data, security or a public API in the scope of its tickets, or does not meet an acceptance criterion.
  - `medium`: wrong behaviour in a case that the tickets cover, or a problem that the next change to this code will hit.
  - `minor`: the code works, but breaks a convention or leaves a gap that is quick to close in this PR.
  - `nit`: wording, naming or style.
  - Out of scope: a problem outside what the tickets ask for, such as an edge case that a ticket marked as a quick fix or a limited change does not cover, MUST get the lowest label. Its body MUST name the open ticket in `context.relatedTickets` that covers it, or else propose a follow-up ticket, not a change in this PR. What the conventions and the tickets with their comments say about the scope decides what is out of scope.

### 6. Start the AI reviews

Let the user choose what runs:

1. Look through the skills available to you for ones that review code. Use skills only, not agent types. Keep the ones that fit this PR's language, platform and kind of change, and drop a skill that duplicates another one or a check below.
2. Ask the user which angles to run, all selected at the start, each with one line on what it checks: spec (acceptance criteria and scope), code standards (conventions, new concepts and new terms), sources (hardcoded values and factual claims), and tests and breaking changes.
3. For the angles the user kept, ask which review skills to use: each skill by its exact name, with its angle and one line on why it fits, all selected at the start. An angle with no fitting skill runs its checks only; a skill that fits no angle gets an option of its own. Say how many subagents you would start; the test coverage check runs in this session and does not count.
4. Run only what the user chose, once for each PR. If you can start a subagent, run the chosen checks there, in no more subagents than the user agreed to, in the background, and go on with step 7. Otherwise, run them yourself in step 8. The test coverage check always runs in this session, in step 8.

If you can ask a structured multiple-choice question, use it for both rounds; otherwise ask in the chat. While a review page of this session is open, run `waiting` before you ask, as step 2 says.

Give each subagent a brief with these parts, and nothing more:

1. The checks it runs: one review skill, or one or more of the built-in checks below, with their text. Run the test coverage check yourself, not in a subagent, because it reads the CI checks and bot comments with this session's tools.
2. Where the PR is: the repository, the PR number, the head commit, the path of the diff file from step 4, and the list of hunks with their ID, file and line ranges. For a big PR, also the worktree path. Tell the subagent where its review skill reads the code: for a big PR, run the skill from the worktree, because a review skill can read the git diff of the folder it runs in; for a small PR, give the skill the diff file instead.
3. The scope summary: a few lines on what the tickets and issues, with their comments, say this PR must and must not do, for example that it is a quick fix. Write it once per PR and give every subagent the same text. The checks of acceptance criteria and scope also get the tickets as read in step 3. You MUST NOT give a subagent the earlier review comments, the PR conversation or the user's remarks.
4. The code rules, and the severity labels with their meanings from step 5.
5. The answer format: a JSON list of findings, each with `hunkId` (null for the whole PR), `line`, `side`, `severity`, `title`, `body` and `rule`; an empty list when the checks find nothing. The acceptance criteria check also returns, per criterion ID, a `verdict` and a one-line `note`.

Leave out your own view of the PR, the flows, and the findings of other checks, so each subagent reviews the code without your conclusions. When a review skill answers in its own format, convert its findings to this format yourself and keep its wording in `body`.

The checks:

- [ ] Use the review skills that are available to you. Skills of the target project take precedence.
- [ ] Verify that the PR meets the acceptance criteria of the linked tickets. Give each criterion a `verdict` and a one-line `note`.
  - For each criterion with the verdict `not-met`, you MUST also write one finding for the whole PR (`hunkId` null) with `rule` `acceptance-criteria`, the criterion ID at the start of its `title`, a `body` that says what is missing, and the severity the user's conventions give a missing requirement, else `major`. `check` rejects a `not-met` criterion without such a finding.
  - When a criterion becomes `met` or `elsewhere`, remove its finding.
  - When a ticket lists no acceptance criteria, take them from its description and set `source` to `description`.
- [ ] Verify that the PR makes no changes beyond what the tickets ask for. If it does, the PR description must say why.
- [ ] Verify that the changes follow the project's conventions and coding standards.
- [ ] Verify test coverage, only when the project has a test suite:
  - Read coverage from the PR's CI checks and bot comments. You MUST NOT calculate coverage yourself, from the diff, from reading tests or otherwise, because such an estimate looks precise but is not.
  - If CI and bot comments give no coverage, add a finding with the lowest severity that says coverage could not be determined, and why. It does not block the review.
  - You MUST NOT run the test suite, run coverage tooling or install dependencies: they run code from the PR on the user's computer and change its state.
- [ ] Verify that the PR names breaking changes if it introduces them.
- [ ] Verify that the code does not invent new concepts. A new concept must be explained and justified.
- [ ] Verify that the PR does not hardcode what a dependency already owns. List every map, limit, list of allowed values and business rule that the PR hardcodes. For each one, check whether an API specification, a library the project depends on, or, when the repository's docs name one, a reference implementation already provides it or handles it differently.
- [ ] Verify every factual claim in new or changed comments, docblocks and documentation against the source it names.
- [ ] Verify that every new term and abbreviation is defined where it first appears, and is the word that the platform, the libraries it uses or the API use for that thing.

### 7. Find the flows

This is the most important step. Take the time it needs: read the surrounding code, not only the diff.

- Untangle the changes (change untangling, Barnett et al., ICSE 2015): split the PR into groups of changes that depend on each other, where one change defines or calls code that another change uses. Each group becomes a flow.
  - A hunk that two groups use, such as a shared function, goes in both flows.
  - Documentation, tests and configuration go next to the changed code they document, test or configure, in each flow that has it.
  - A change that covers no changed code and is used by none, such as a lockfile or a format change, goes in its own flow or in `notInAnyFlow`, not in the flow of other changes.
- Order related changes together (Baum et al., Empirical Software Engineering 2019): in a flow, put hunks that depend on each other next to each other, such as a function and its callers, so the reviewer does not keep a change in memory while reading unrelated hunks.
- A flow is a path through the code: a name in plain words, an entry point and an end point (fully qualified code names with their namespace or module path, such as `App\Weather\ForecastClient::fetch()` or `src/api/weatherClient.ts:fetchForecast()`, not sentences), and the ordered hunks it passes through.
- Order the steps bottom-up by default (bottom-up program comprehension, Pennington): for example the request to a backend first, then the model, the repository, and last the UI or public API.
- Order the steps top-down (top-down program comprehension, Brooks) when the PR adds a new entry point, such as an endpoint or command: start at the entry point and follow the calls down.
- Each step says in one line why it comes at that place.
- Each flow has an `icon`: a different Lucide icon name (https://lucide.dev/icons) that shows what the flow does, for example `database` or `globe`.
- A flow MUST name the acceptance criteria of the linked tickets that it resolves. A flow that resolves none MUST get `noCriteria`: one line that says why, for example that no linked ticket lists criteria, or that the criteria belong to other flows.
- A hunk MAY be in several flows. A hunk that is in no flow goes in `notInAnyFlow`.
- When code paths do not apply to this PR, set `layout` to `directory` and leave `flows` empty. The review page then lists files by directory, then alphabetically.

Write a short `explanation` for each flow and each hunk, for a reviewer who does not know this code. Name the concepts the code uses; do not invent new terms.

Then run `node scripts/review-data.js check <review-dir>/review.json --diff <diff-file>`, with the diff file from step 4. Fix every line about flows and hunks (the lines that start with `missing:`, `unknown:`, `no why:` or `diff:`) and run it again until it prints none; the lines about criteria, comments and the `stack` field belong to step 8. A `diff:` line means `review.json` and the diff file hold different hunks: run `hunks` again with the same `--whole` options, which `wholeFiles` in `review.json` lists. The same `hunks` run repairs a `review.json` from before `wholeFiles` existed.

### 8. Collect and judge the findings

When the subagents have answered, or when you run the checks yourself, write the findings of step 6.

Write each finding:

- Attach it to the hunk and line it is about, or set `hunkId` to null for a finding about the whole PR.
- Set `sources` to what found it: the exact name of the review skill, or `check:<angle>` for a built-in check, for example `check:spec`. The angles are `spec`, `code-standards`, `sources` and `tests`.
- When an open ticket in `context.relatedTickets` already covers it, name that ticket's key in the finding.
- Write `body` as the comment text that would be posted, without the title, the severity label and the disclosure; the review page posts the finding as a header line `**severity(rule): title**`, then the body, then the disclosure.
- Write `body` in GitHub markdown: short paragraphs, a list for separate points, code in backticks, and a `suggestion` block for a concrete fix. In the JSON, write each line break as `\n`.

Then judge each finding of the checks yourself, except an `acceptance-criteria` finding. You MUST compare it with the decisions in the tickets and their comments, and with the earlier requests: the review bodies, the review threads with their replies and the PR conversation comments from step 3, by the user and by others, the `ownRemarks` that `review.json` already holds from an earlier round, and the user's remarks in `reviewer.json` that are not posted yet.

- When a finding asks for the opposite of a ticket decision, of an earlier request that the author followed or that a reply settled, or of one of the user's remarks, you MUST drop the finding.
- When you think the earlier request or remark was wrong, keep the finding, and its `body` MUST name that comment or remark and say why the advice changes.
- Apply the out-of-scope rule of step 5 to each finding you keep.
- When two or more findings with the same `hunkId`, `line` and `side` make the same claim, merge them into one: keep the clearest `title` and `body`, the `rule` of the finding you take them from, the highest severity, and all their `sources`. In a stack, keep the `stack` verdict that names the most PRs you read.

Always verify the existing review comments from step 3, whatever the user chose above:

- [ ] Reviews: add every submitted review, by the user and by others, to `reviews`, with its body verbatim and its `commit_id` as `commitId`. You MUST leave out a `COMMENTED` review that has no body and no comments of its own.
- [ ] Comments by others: add each one to `reviewComments` with its body and replies exactly as their authors wrote them. You MUST NOT restate, shorten or correct them.
  - For an open one, add an `opinion`: whether the comment is right (agree, disagree or not sure), and why, in one line. The opinion does not say whether the author fixed it.
  - You MUST add a `fix` as for the user's own remarks, without `reply`, to every resolved one, whoever resolved it, and to an open one when commits came after it. `check` reports a resolved comment without it.
- [ ] The user's own remarks, posted or pending: add each to `ownRemarks`.
  - For each posted one, open or resolved by anyone, with or without new commits, read the code at its lines now, the commits since the comment and the replies. Add a `fix`: whether the author fixed it, with a one-line note that names the commit or line, and for `not-fixed` a short draft reply that says what is still missing. `check` reports a posted one without it; the review page shows "not checked" for it.
  - For each pending one and each posted one that is not resolved, also add an `opinion` as for comments by others.
  - A comment whose text starts with no severity label gets the `severity` you would give it as a finding, with `severitySource` set to `ai`, in that same pass; the user's conventions decide the labels. Keep a label the user wrote.
  - Put the ID and body of the user's pending review, if any, in `ownPendingReview`.

### 9. Complete the review page

1. Write the parts of `review.json` that are still missing, as described in `references/review-data.md`. A flow for which the acceptance criteria check found no criteria MUST keep or get its `noCriteria`. In every text you write for the review page (explanations, findings, answers), refer to tickets, issues and PRs by key or number only, for example `ABC-123` or `#123`, never with their URL: the review page links them and shows their title.
   Then run `node scripts/review-data.js check <review-dir>/review.json --diff <diff-file>` again, fix every line it prints, and run it until it prints `ok`.
2. When steps 5 to 8 ran for every hunk of `pr.headSha`, run `node scripts/review-data.js checked <review-dir>`. It records that commit in `checkedSha`, and the review page asks the reviewer to get it checked when `checkedSha` is another commit.
3. Run `node scripts/review-data.js prepared <review-dir>`, if you did not run it after steps 7 and 8.
4. Tell the user in two or three sentences what the PR does and how many flows and hunks there are. Do not list findings in the chat; they are in the review page.

### 10. Finish

- While the PR is open, you MUST keep the review directory and, for a big PR, the worktree, so the next round starts from this one. You MUST NOT offer to delete them.
- After a final `post`, keep the watch running. After `finish` or `IDLE`, stop the watch and tell the user in one line that the review is kept and that this skill resumes it for the PR.
- When the PR is merged or closed, ask the user before you delete the review directory and the worktree.

## Self-healing

The task is done after `finish` or `IDLE`, or when the user stops the review in the chat. The final `post` does not end it. When the task is done and the user corrected you, or this skill gave wrong or incomplete guidance, offer to draft an issue for https://github.com/FreekVR/skills/issues describing the problem as it relates to this skill. You MAY also offer a pull request that improves the skill. You MUST show the draft and open it only after the user agrees. You MUST NOT include personal, company or repository-specific data. You MUST add the AI disclosure.
