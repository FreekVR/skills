# Stacks

Read this when `review-data.js stack` prints a stack, the user named a stack number, or a ticket links PRs of one stack. Apply each section at the step it names, together with that step in `SKILL.md`.

A stack is a chain of PRs in one repository: each PR's base branch is the head branch of the PR below it. A PR in a stack is still reviewed alone, with its own review directory and review page; the other PRs in the stack are context. These rules apply only when the PR is in a stack with at least one other PR.

## Preflight item 6: choose the PR

1. For a stack number, run `node scripts/review-data.js stack <owner>/<repo> <pr-number>` for the bottom PR of `GET /repos/{owner}/{repo}/stacks/<number>`.
2. When the command exits 3, open PRs split above `split.base`. List the PRs in `split.prs` with title and state, ask which one to follow, and run the command again for that PR.
3. When the user named a stack, or a ticket that links PRs of one stack, ask which PR to review. Suggest the lowest PR in the stack that is neither merged nor approved by the user; the user can pick another one. A PR is approved when the user's latest review on it in `GET /repos/{owner}/{repo}/pulls/{n}/reviews` is `APPROVED`. Ignore `COMMENTED` reviews.

## Step 1: read the context

- Read every ticket that any PR in the stack links, and use them as this PR's tickets.
- When an earlier review in this stack has a `review.json`, reuse its tickets, related tickets, linked PRs and conventions, and do not read them again. You MUST still read the comments of those tickets, because they can change after that review.
- Write `stack` as described in `references/review-data.md`: one line per PR on what it does and how it relates to the PRs next to it, the criteria that another PR is expected to meet, and the changes that no ticket asks for. `check` rejects a `stack` field that breaks the rules there.

## Step 5: run the AI reviews

- Ask both rounds (angles, then skills) again for each PR.
- A finding goes to the PR that adds or changes the line. You MUST NOT repeat a finding that another review in this stack already has; name that PR instead.
- For each finding, decide how far to read in the other PRs. For a local problem, such as a wrong value or a missing check, read only their changes to the same file and lines. For a flow that this PR does not finish, follow that flow into the later PRs, and read only the files and functions on its path.
- You MUST give every finding a `stack` field: what the other PRs do with it.
  - `verdict` is `fixed` or `worse` when another PR fixes the problem or makes it worse, with that PR in `pr`; `untouched` when no other PR touches the finding's code; `not-checked` when you only expect it from the highlights.
  - `prs` lists the PRs you read, and `note` says in one line what you found there and which files you read.
  - Do not write it into `body`: the review page shows it with each finding and posts it with the comment. `check` rejects a finding in a stack without it.
  - The finding keeps its severity when another PR fixes it or makes it worse.
- Use the acceptance criteria IDs and texts of the first review in this stack. Check a criterion in the highest PR that completes it. In a lower PR, give it the verdict `elsewhere` with `pr` set to that PR's number, and no finding.
- Work in this PR that belongs to another PR's ticket is a finding.

## Step 7: events

- The events of every review in this stack that this session started are this session's.
- Every `check` and `refresh` also runs `node scripts/review-data.js stack` again and updates the `stack` field, so a PR that was added, merged or moved shows on the review page.
- A `start-review` event asks for a review of PR `number`. The review page already created its review directory with a `preparing` file, and the reviewer now looks at that PR's page, which waits for `review.json`.
  1. Run `dir` for PR `number` and `node scripts/review-data.js preparing <review-dir> "Reading the PR"`, before you ask anything.
  2. Write `review.json` as soon as it has the PR and its hunks, and add flows and findings to it as you go: the page shows each part when it appears.
  3. Run Preflight items 7 to 9, "Before step 1" and steps 1 to 6 for that PR, with a separate watch for it.
  4. Keep handling the events of the other reviews in between.
- The angle and skill questions of a review that `start-review` started are the one exception to plain chat questions:
  1. Run `waiting` for every review directory this session handles.
  2. Ask the structured multiple-choice question. While it is open, the events of the other reviews wait; the review pages show the reviewer that you wait.
  3. After the answer, run `answered`, then handle the events that came in.

## Step 8: finish

`finish` or `IDLE` ends the review of that PR only. The task is done when no review of this session is still open.

## Resume

- A rebase of a lower PR gives every PR above it a new head commit. Update the reviews of this session from the bottom up.
  1. Get the old hunk IDs as "Old hunk IDs" in `references/resume.md` says, so you compare with what the reviewer saw.
  2. Run steps 2 to 5 as for a changed head commit: a finding whose hunk ID comes back in the new hunks stays as it is. A finding whose hunk is gone is dropped, or written again for the new hunk when the problem is still there. A posted comment gets a new `fix`, as in step 5.
- A `start-review` event that the review page sent after `finish`, while no agent watched, still waits: handle it as Step 7 above says.
