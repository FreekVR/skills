# Resume

Read this when the review directory already holds `review.json`: the reviewer stopped earlier. A `refresh` event also follows the steps for a changed head commit below.

1. Clean up what a session that died may have left:
   - Run `node scripts/review-data.js answered <every review dir of this session>`, for a `waiting` question.
   - A review dir with `review.json` that still holds a `preparing` file was not complete: do steps 3 to 9 for it again, and keep what `review.json` already holds.
   - Run `node scripts/review-data.js prepared <dir>` for every other review dir of this session that has `review.json`.
   - For a review directory without `review.json`, start that review again when a `start-review` event for it is still waiting; else remove the whole directory.
2. Open the review page again (step 1), with `--resume` on the watch, before you compare the base and the head commit. Handle the events it prints first as step 2 says. A `refresh` event skips this: the review page is open. With the static page, run `static` again in step 9 instead.
3. If `pr.baseRef` is absent (a review from before this field), set it to the PR's base branch on GitHub without telling the user.
4. If the PR's base branch on GitHub is not `pr.baseRef`, tell the user that the base changed and set `pr.baseRef` to the new base. Fetch the diff against the new base, then continue as for a changed head commit.
5. If the PR head commit is the same as `pr.headSha`: do step 9.
6. If it changed:
   1. Write `changesSince` (see `references/review-data.md`).
   2. Run steps 3 and 4 again. Hunk IDs depend on the hunk content, so unchanged hunks keep their ID, explanation and "seen" state, and changed hunks get a new ID and show as not reviewed.
   3. Match every comment in `reviewComments` and `ownRemarks` to the new hunks, as `references/review-data.md` says for `hunkId` and `line`.
   4. Run steps 5 to 8 for the new hunks only.
   5. Check the other AI findings against the new code: each finding on an unchanged hunk or on the whole PR that the reviewer did not dismiss (`decisions` in `reviewer.json`) and that no final review posted yet.
      - Still holds: keep it with its ID.
      - Holds in another form: rewrite its `title` and `body`, with the same ID.
      - Fixed by the new commits: remove it when it is open. You MUST NOT remove a finding the reviewer included: start its `body` with a line that says the new commits fixed it, so the reviewer can dismiss it.
      - On a hunk that is gone: leave it as it is. The review page does not post it.
   6. Run `check <review-dir>/review.json --diff <diff-file>` again, with the new diff file.
   7. Do step 9.
7. In a stack, follow the Resume section of `references/stack.md` as well.

## Old hunk IDs

Use this when you need the hunk IDs that the reviewer saw at an older head commit, for example after a rebase in a stack, or for a `refresh` whose head is unchanged but whose `checkedSha` is another commit.

1. Run `node scripts/review-data.js own-diff <clone> <old-head> "<subject of the PR's first own commit>"`. `<clone>` is the local clone from Preflight item 8, and `<old-head>` is the older commit. It prints the PR's own diff at that commit.
2. Run `hunks` on that diff with a copy of `review.json`: its IDs are the old hunk IDs.
3. When there is no clone, or `own-diff` fails for any reason (for example `no commit with subject`, `subject matches more than one commit`, or `bad revision` when the old head is not in the clone), compare the full new diff instead.
