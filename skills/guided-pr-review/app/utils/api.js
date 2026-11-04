// The server only accepts a POST or PUT with this header (server/middleware/guard.ts).
const GUARD = { 'X-Guided-Review': '1' }

let base = ''
let path = null

// Set the review that the transport calls go to.
export function setReviewPath(owner, repo, number) {
  base = `/api/reviews/${owner}/${repo}/${number}`
  path = { owner, repo, number: Number(number) }
}

// Get the PR of the page, also before its review.json exists.
export function reviewPath() { return path }

// The functions keep the names and results of the old page's transport, so the logic calls them the same way.
// They are not exported one by one, because the logic has functions with the same names (saveReviewer, sendEvent).
export const transport = {
  // A network failure reaches the caller as the TypeError of fetch, so poll can tell that the server is gone.
  loadReview() {
    return $fetch(`${base}/review`).catch((error) => {
      throw error.response ? error : error.cause || error
    })
  },
  loadReviewer() {
    return $fetch(`${base}/reviewer`)
  },
  // Whether an agent watches the review, whether it is paused, and the question it waits on.
  loadAgent() {
    return $fetch(`${base}/agent`)
  },
  // The review state of each PR in this review's stack.
  loadStack() {
    return $fetch(`${base}/stack`)
  },
  loadReviews() {
    return $fetch('/api/reviews')
  },
  // Any review in the switch can be paused, so this call names its review.
  setPaused({ owner, repo, number }, paused) {
    return $fetch(`/api/reviews/${owner}/${repo}/${number}/paused`, { method: 'POST', headers: GUARD, body: { paused } }).catch((error) => {
      throw new Error(`${error.statusCode} ${error.statusMessage}`)
    })
  },
  async saveReviewer(reviewer) {
    await $fetch(`${base}/reviewer`, { method: 'PUT', headers: GUARD, body: JSON.stringify(reviewer) }).catch((error) => {
      throw new Error(`Saving failed: ${error.statusCode} ${error.statusMessage}`)
    })
  },
  // Ask the agent to prepare the review of another PR of the stack. Returns the event ID and the page of that PR.
  startReview(number) {
    return $fetch(`${base}/start-review`, { method: 'POST', headers: GUARD, body: { number } }).catch((error) => {
      throw new Error(`Sending failed: ${error.statusCode} ${error.statusMessage}`)
    })
  },
  sendEvent(event) {
    return $fetch(`${base}/events`, { method: 'POST', headers: GUARD, body: event }).catch((error) => {
      throw new Error(`Sending failed: ${error.statusCode} ${error.statusMessage}`)
    })
  },
  loadFile(file) {
    return $fetch(`${base}/file`, { query: { path: file }, responseType: 'text' }).catch((error) => {
      throw new Error(error.statusCode === 404 ? 'the agent did not save this file' : `${error.statusCode}`)
    })
  },
  async openFolder(file) {
    await $fetch(`${base}/open`, { method: 'POST', headers: GUARD, body: { path: file } }).catch((error) => {
      throw new Error(`${error.statusCode}`)
    })
  },
}
