# Hosted page

Read this when the harness can host an interactive page that sends data back to you, instead of the local server.

`assets/review.html` talks to its data through one object. With the local server, it uses HTTP. On a hosted page, define `window.guidedPrReviewTransport` in a script before the template's own script, with these four functions. Each returns a promise.

| Function | Must do |
| --- | --- |
| `loadReview()` | Return the current `review.json` content as an object. |
| `loadReviewer()` | Return the saved `reviewer.json` content, or `{}`. |
| `saveReviewer(state)` | Store the reviewer state where you can read it, and where it survives a page reload. |
| `sendEvent(event)` | Deliver the event to you, add `id` and `at`, and return `{ id }`. Keep the event's `review` field as the page sent it. |

Two functions are optional. Without them, the page leaves out the buttons that use them.

| Function | Must do |
| --- | --- |
| `loadFile(path)` | Return the PR head version of a changed file as text. The "Whole file" button uses it. |
| `openFolder(path)` | Show a changed file of `pr.localPath` in its folder on the user's computer. |

Build the transport from what the harness offers: for example a data store that the page and you can both read and write, or a way for the page to send you a message. Then:

1. Publish the template with the transport script added.
2. Whenever you change `review.json`, make the new content available to `loadReview()`. The template calls it every few seconds.
3. Read `reviewer.json` and the events from wherever `saveReviewer` and `sendEvent` put them. Keep a copy in the review directory, so a resume works.

