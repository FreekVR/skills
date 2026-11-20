# Existing comments

Read this in step 8, and when a `check` or `refresh` event, a resume or a `post` asks you to update the review comments or write a `fix`. Apply it together with step 8 in `SKILL.md`.

Always verify the existing review comments from step 3, whatever the user chose above:

- [ ] Keep every review comment on GitHub, by the user and by others, in `review.json`: resolved and outdated ones too, and ones you think are fixed or no longer apply. You MUST NOT remove or leave out a comment, also not on a later `check` or `refresh`, and MUST keep its `id`; your view goes in `fix` and `opinion`, which the review page shows with it.
- [ ] Reviews: add every submitted review, by the user and by others, to `reviews`, with its body verbatim and its `commit_id` as `commitId`. You MUST leave out a `COMMENTED` review that has no body and no comments of its own.
- [ ] Comments by others: add each one to `reviewComments` with its body and replies exactly as their authors wrote them. You MUST NOT restate, shorten or correct them.
  - For an open one, add an `opinion`: whether the comment is right (agree, disagree or not sure), and why, in one line. The opinion does not say whether the author fixed it.
  - You MUST add a `fix` as for the user's own remarks, without `reply`, to every resolved one, whoever resolved it, and to an open one when commits came after it. `check` reports a resolved comment without it.
- [ ] The user's own remarks, posted or pending: add each to `ownRemarks`.
  - For each posted one, open or resolved by anyone, with or without new commits, read the code at its lines now, the commits since the comment and the replies. Add a `fix`: whether the author fixed it, with a one-line note that names the commit or line, and for `not-fixed` a short draft reply that says what is still missing. `check` reports a posted one without it; the review page shows "not checked" for it.
  - For each pending one and each posted one that is not resolved, also add an `opinion` as for comments by others.
  - A comment whose text starts with no severity label gets the `severity` you would give it as a finding, with `severitySource` set to `ai`, in that same pass; the user's conventions decide the labels. Keep a label the user wrote.
  - Put the ID and body of the user's pending review, if any, in `ownPendingReview`.
