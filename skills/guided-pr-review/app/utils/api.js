// The server only accepts a POST or PUT with this header (server/middleware/guard.ts).
const GUARD = { 'X-Guided-Review': '1' }

let base = ''

// Set the review that the transport calls go to.
export function setReviewPath(owner, repo, number) {
  base = `/api/reviews/${owner}/${repo}/${number}`
}

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
  loadReviews() {
    return $fetch('/api/reviews')
  },
  async saveReviewer(reviewer) {
    await $fetch(`${base}/reviewer`, { method: 'PUT', headers: GUARD, body: JSON.stringify(reviewer) }).catch((error) => {
      throw new Error(`Saving failed: ${error.statusCode} ${error.statusMessage}`)
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
