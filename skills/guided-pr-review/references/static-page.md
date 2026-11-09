# Static review page

Read this when you cannot run a background process and act on each line it prints (Preflight item 5). The review page is then one HTML file, without the agent.

- Skip steps 1 and 2: do not run the review server or the watch.
- Do steps 3 to 8 as usual. In step 9, instead of the review server:
  1. Run `node scripts/review-data.js static <review-dir> <review-dir>/review.html`. It writes the review page as one HTML file.
  2. Open that file in the user's browser, or give the user its path.
  3. Tell the user that:
     - The page cannot ask you questions, ask for a longer explanation or post to GitHub.
     - The page keeps their progress in this browser only.
     - To post, they choose a verdict in Submit review and press **Copy the gh command**, then run that command in a terminal where `gh` is signed in. The command posts the review with its comments. It does not post replies and does not resolve threads.
- When `review.json` changes, run `static` again and tell the user to reload the page.
- Step 10 ends here: the task is done when the user has the page open and knows how to post with the copied command. Keep the review directory, as step 10 says.
