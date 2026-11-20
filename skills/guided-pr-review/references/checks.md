# Checks

Read this before the checks of step 6 start, and before you run checks yourself in step 8. Apply it together with those steps in `SKILL.md`.

Give each subagent a brief with these parts, and nothing more:

1. The checks it runs: one review skill, or one or more of the built-in checks below, with their text. Run the test coverage check yourself, not in a subagent, because it reads the CI checks and bot comments with this session's tools.
2. Where the PR is: the repository, the PR number, the head commit, the path of the diff file from step 4, and the list of hunks with their ID, file and line ranges. For a big PR, also the worktree path. Also the paths in `generated.files`: every check except the generated files check MUST skip these files, also a hunk that later becomes a flow step. Tell the subagent where its review skill reads the code: for a big PR, run the skill from the worktree, because a review skill can read the git diff of the folder it runs in; for a small PR, give the skill the diff file instead.
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
- [ ] Verify the generated files, only when `generated.files` is not empty. Check that the output matches its source, that nobody edited it by hand, that it holds no change the source does not explain, and that it does not break the handwritten code that uses it.
  - You MUST NOT run the generator: read the source and the output only.
  - When the source is not in the PR, or you cannot tell whether the output matches, write a finding with the lowest severity that says so.
  - Give each finding `sources` `check:generated`.
- [ ] Verify that the PR does not hardcode what a dependency already owns. List every map, limit, list of allowed values and business rule that the PR hardcodes. For each one, check whether an API specification, a library the project depends on, or, when the repository's docs name one, a reference implementation already provides it or handles it differently.
- [ ] Verify every factual claim in new or changed comments, docblocks and documentation:
  - A factual claim says what something is or does: a value, a limit, a version, what a function or an API does, or why the code does something.
  - Check only that the claim is correct: against the source it names, else against the code or the dependency it describes.
  - You MUST NOT report a claim for what it leaves out. A comment does not have to cover every case, branch or edge case of the code; the reader only needs what it says to be true.
- [ ] Verify that every new term and abbreviation is defined where it first appears, and is the word that the platform, the libraries it uses or the API use for that thing.

A check that you run yourself MUST skip the files in `generated.files` too, except the generated files check.
