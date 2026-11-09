import { STATIC_REVIEW } from './state.js'

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
  // Whether an agent watches the review, and the question it waits on.
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
  // Delete another review and its worktree; the error says why the server kept it.
  removeReview({ owner, repo, number }) {
    return $fetch(`/api/reviews/${owner}/${repo}/${number}`, { method: 'DELETE', headers: GUARD }).catch((error) => {
      throw new Error(error.statusMessage || `${error.statusCode}`)
    })
  },
  // `keepalive` lets the save finish after the tab is gone.
  async saveReviewer(reviewer, { keepalive = false } = {}) {
    await $fetch(`${base}/reviewer`, { method: 'PUT', headers: GUARD, body: JSON.stringify(reviewer), keepalive }).catch((error) => {
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

const noAgent = () => Promise.reject(new Error('a static review page has no agent'))
const storageKey = () => `guided-pr-review:${path.owner}/${path.repo}#${path.number}`

// A static page reads the review from the page itself and keeps the reviewer state in this browser.
if (STATIC_REVIEW) {
  Object.assign(transport, {
    loadReview: async () => STATIC_REVIEW,
    async loadReviewer() {
      try { return JSON.parse(localStorage.getItem(storageKey())) || {} }
      catch { return {} }
    },
    async saveReviewer(reviewer) {
      localStorage.setItem(storageKey(), JSON.stringify(reviewer))
    },
    loadAgent: async () => null,
    loadStack: async () => [],
    loadReviews: async () => [],
    removeReview: noAgent,
    startReview: noAgent,
    sendEvent: noAgent,
    loadFile: noAgent,
    openFolder: noAgent,
  })
}
