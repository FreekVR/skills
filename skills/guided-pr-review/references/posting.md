# Posting to GitHub

Read this when the review page sends a `post` event. Use the GitHub REST API for pull request reviews, through the `gh` CLI (`gh api`) or a GitHub tool.

A GitHub user has at most one pending (draft) review per PR. Each `post` event holds all remarks so far, so it replaces the pending review instead of adding to it.

1. Find your pending review: `GET /repos/{owner}/{repo}/pulls/{number}/reviews`, the entry with `state` `PENDING` from the authenticated user.
2. If there is one and its ID is the `reviewId` of an earlier draft in `posts` or the `id` of `ownPendingReview`, delete it; its remarks are already in the review page, so the new review keeps them: `DELETE /repos/{owner}/{repo}/pulls/{number}/reviews/{review_id}`. If there is one that this review did not create, the user started it on GitHub: do not delete it. Add an entry to `posts` with `status: error` that says so, and tell the user in the chat.
3. Create the review: `POST /repos/{owner}/{repo}/pulls/{number}/reviews` with:
   - `commit_id`: `pr.headSha`.
   - `body`: the event's `body`.
   - `comments`: the event's `comments`, each with `path`, `line`, `side` and `body`, and `start_line` and `start_side` for a comment on several lines.
   - `event`: for `kind: final`, the event's `verdict` (`APPROVE`, `REQUEST_CHANGES` or `COMMENT`). For `kind: draft`, leave `event` out; GitHub then keeps the review pending.

Example with `gh`, where `payload.json` holds the fields of step 3:

```sh
gh api --method POST repos/{owner}/{repo}/pulls/{number}/reviews --input payload.json
```

On success, add an entry to `posts` with `status: posted`, the review's `html_url` as `url` and its `id` as `reviewId`. If GitHub returns an error, do not retry with changed content. Add the error message to `posts` with `status: error`; the review page shows it to the reviewer.
