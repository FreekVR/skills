import { state } from './state.js'

// A stack of one PR is no stack, and a stack without this PR is not its stack: the page shows no stack switch for them.
export function hasStack() {
  const prs = state.review.stack?.prs || []
  return prs.length > 1 && prs.some((pr) => pr.number === state.review.pr.number)
}

// Get the 1-based place of this page's PR in its stack, counted from the bottom PR.
export function stackPosition() {
  const prs = state.review.stack.prs
  return { index: prs.findIndex((pr) => pr.number === state.review.pr.number) + 1, size: prs.length }
}

// Get the PRs of the stack, bottom to top, with the review state the server reads from each review directory.
// A review without review.json has no page yet. While the status is unknown, the switch never offers to start a review.
export function stackRows() {
  return state.review.stack.prs.map((pr) => {
    const status = state.stackStatus.find((candidate) => candidate.number === pr.number) || null
    const done = pr.state === 'merged' || pr.state === 'closed'
    const action = status?.hasReview ? 'open' : done ? 'github' : !status || status.preparing || status.agentConnected ? 'none' : 'start'
    return { number: pr.number, title: pr.title, url: pr.url, state: pr.state, current: pr.number === state.review.pr.number, approved: Boolean(pr.approved), status, action }
  })
}

// Get the line under a PR in the stack switch.
export function stackRowLabel(row) {
  if (row.approved) return 'Approved by you'
  if (row.state === 'merged') return 'Merged'
  if (row.status?.posted) return 'Review posted'
  if (row.status?.preparing) return 'Preparing the review…'
  if (row.status?.hasReview) return `${row.status.seen} of ${row.status.hunks} hunks seen`
  if (row.status?.agentConnected) return 'Reviewed in another session'
  return 'Not reviewed'
}
