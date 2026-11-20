# Summary

Read this on a `summarize` event. Apply it together with step 2 in `SKILL.md`.

Write the review summary from the remarks in the event only, in plain text the reviewer can edit, in at most 5 sentences. The remarks are posted right below it, as line comments and as a list of whole-PR remarks, so the summary is a short reading guide to them:
  1. How serious the remarks are as a whole: which ones block the merge and which are small, by count or by severity, not one by one. A remark blocks the merge when its severity is `conventions.requestChangesFrom` or higher, the same threshold at which the review page proposes request changes.
  2. A shared cause: when several remarks point to the same problem or symptom, name it once and say how many remarks or which places show it.
  3. What the author should do first.

  Group the remarks by the problem or the part of the code they share, with their weight, in the reviewer's first person. For example: "I have several remarks that point to code that is more complex than it needs to be, a few medium issues in the controllers, and some nits in the docs." Follow the user's review conventions. Do not add the disclosure; the review page adds it.
