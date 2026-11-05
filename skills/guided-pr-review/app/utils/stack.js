import { state } from './state.js'
import { ticketCriteria } from './review.js'
import { agentState } from './posting.js'

// A stack of one PR is no stack, and a stack without this PR is not its stack: the page shows no stack switch for them.
export function hasStack() {
  const prs = state.review.stack?.prs || []
  return prs.length > 1 && prs.some((pr) => pr.number === state.review.pr.number)
}

// Get what the agent found in the other PRs of the stack for a finding: the verdict and the text after "In the stack:".
// A finding without a take says it was not checked, so silence never reads as "nothing found". In no stack: null.
// `post` says whether the posted comment carries the line: the PR's author needs it unless no other PR touches the code.
export function stackLine(finding) {
  if (!hasStack()) return null
  const take = finding.stack || {}
  const read = take.prs?.length ? ` Read ${take.prs.map((number) => `#${number}`).join(', ')}.` : ''
  const label = { fixed: `fixed in #${take.pr}.`, worse: `made worse in #${take.pr}.`, untouched: `no other PR touches this code.${read}`, 'not-checked': 'not checked.' }[take.verdict]
  if (!label) return { verdict: 'not-checked', text: 'not checked against the other PRs.', post: false }
  return { verdict: take.verdict, text: [label, take.note].filter(Boolean).join(' '), post: take.verdict !== 'untouched' }
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
    // The agent has not made the directory yet, so a start the reviewer already sent counts as preparing.
    const asked = !status?.hasReview && state.reviewer.sent.some((sent) => sent.type === 'start-review' && sent.number === pr.number)
    const action = status?.hasReview ? 'open' : done ? 'github' : !status || status.preparing || status.agentConnected || asked ? 'none' : 'start'
    const page = status?.page || `/${state.review.pr.owner}/${state.review.pr.repo}/${pr.number}`
    return { number: pr.number, title: pr.title, url: pr.url, page, state: pr.state, current: pr.number === state.review.pr.number, approved: Boolean(pr.approved), status, action, asked }
  })
}

// Get the line under a PR in the stack switch.
export function stackRowLabel(row) {
  if (row.approved) return 'Approved by you'
  if (row.state === 'merged') return 'Merged'
  if (row.status?.posted) return 'Review posted'
  if (row.status?.preparing || row.asked) return agentState() === 'none' ? 'Waits for an agent' : 'Preparing the review…'
  if (row.status?.hasReview) {
    const { seen, hunks, remarks } = row.status
    return remarks ? `${seen} of ${hunks} hunks seen · ${remarks} remarks` : `${seen} of ${hunks} hunks seen`
  }
  if (row.status?.agentConnected) return 'Reviewed in another session'
  return 'Not reviewed'
}

// Get the PR to review after this one: the first PR above it, else the first below it, that the reviewer can act on.
// A PR is skipped when it is merged or closed, its final review is posted, or its action is none (unknown, preparing, another session).
// A PR this page asked the agent to prepare is not skipped: the button opens its page instead of a second start.
export function nextInStack() {
  const rows = stackRows()
  const at = rows.findIndex((row) => row.current)
  const open = (row) => (row.action === 'open' || row.action === 'start' || row.asked) && row.state === 'open' && !row.status?.posted
  return [...rows.slice(at + 1), ...rows.slice(0, at).reverse()].find(open) || null
}

// Get, for each acceptance criterion of this PR's tickets, the PRs of the stack that meet it.
// A full review decides the cell: met confirms it, also when the agent only expected it from the PR's highlights.
// A criterion this PR places in another PR is expected there, so the row never says no PR while the criterion names one.
export function coverageRows() {
  const stack = state.review.stack
  const current = state.review.pr.number
  const verdictsOf = (number) => {
    if (number !== current) return state.stackStatus.find((status) => status.number === number)?.criteria || {}
    return Object.fromEntries(ticketCriteria().map((criterion) => [criterion.id, criterion.verdict]))
  }
  const verdicts = Object.fromEntries(stack.prs.map((pr) => [pr.number, verdictsOf(pr.number)]))
  return ticketCriteria().map((criterion) => {
    const cells = {}
    for (const entry of stack.coverage || []) {
      if (entry.criterion === criterion.id && entry.pr && verdicts[entry.pr]) cells[entry.pr] = { status: entry.status }
    }
    if (criterion.verdict === 'elsewhere' && verdicts[criterion.pr] && !cells[criterion.pr]) cells[criterion.pr] = { status: 'expected' }
    for (const pr of stack.prs) {
      const verdict = verdicts[pr.number][criterion.id]
      if (verdict === 'met') cells[pr.number] = { status: 'confirmed' }
      else if (verdict === 'not-met') cells[pr.number] = pr.number === current ? { status: 'not-met', note: criterion.note } : { status: 'not-met' }
    }
    return { id: criterion.id, text: criterion.text, cells, none: !Object.keys(cells).length }
  })
}

// Get the changes of the stack's PRs that no ticket asks for.
export function outsideTicketRows() {
  return state.review.stack.outsideTickets || []
}

// A merged or approved PR is done, so its stop is green; this page's stop is bigger, like the current hunk on the flow map.
export function stackDotClass(row) {
  if (row.current) return 'size-4 border-(--line) bg-(--line) shadow-[0_0_0_2px_var(--ui-bg)]'
  if (row.state === 'merged' || row.approved) return 'size-3.5 border-success bg-success'
  return 'size-3.5 border-(--line) bg-default'
}
