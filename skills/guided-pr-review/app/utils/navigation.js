import { state, SHORTCUTS } from './state.js'
import { decisionOf, hunkById, isSeen, lineById, lines, liveFindings, stationCode, verdictOf } from './review.js'
import { postedReview } from './posting.js'
import { markSeen, saveReviewer, setHunkVerdict } from './actions.js'
import { notify } from './notify.js'

// Where a hunk sits in reading order, so a move between hunks has a direction.
export function stopOrder(view) {
  const lineIndex = lines().findIndex((line) => line.id === view.line)
  return lineIndex * 10000 + view.index
}

// The hunk in view counts as seen. The old page did this on every redraw.
export function markCurrentSeen() {
  if (state.view.kind === 'station' && !state.view.line) state.view.line = lines()[0].id
  if (state.view.kind !== 'station') return
  const stop = lineById(state.view.line).stops[state.view.index]
  if (stop) markSeen(stop.hunkId, state.view.line)
}

// Open the hunk at this index of a flow. `state.ui.enter` says from which side the new hunk comes in: next or prev.
export function go(lineId, index) {
  const line = lineById(lineId)
  const bounded = Math.max(0, Math.min(index, line.stops.length - 1))
  const target = { kind: 'station', line: line.id, index: bounded }
  // Entrances play once, for the move that caused them.
  state.ui.enter = state.view.kind === 'station' && stopOrder(target) !== stopOrder(state.view) ? (stopOrder(target) > stopOrder(state.view) ? 'next' : 'prev') : null
  state.view = target
  state.reviewer.flowPositions = { ...state.reviewer.flowPositions, [line.id]: { hunkId: line.stops[bounded].hunkId, stops: line.stops.map((stop) => stop.hunkId) } }
  state.ui.composer = null
  state.ui.askOpen = false
  state.ui.criteriaOpen = undefined
  state.ui.compactMap = false
  saveReviewer()
  showInAddress()
  markCurrentSeen()
}

// Open a hunk in a flow with the focus on a comment on it; the page moves the focus there in place of the heading.
export function showComment(commentId, lineId, index) {
  state.ui.focusTarget = `note-${commentId}`
  go(lineId, index)
}

export function goHome() { openPage('home') }
export function goReviews() { openPage('reviews') }
export function goTerminus() { openPage('terminus') }

function openPage(kind) {
  state.view = { kind }
  state.ui.askOpen = false
  state.ui.composer = null
  showInAddress()
}

// Back to the hunk the reviewer last had open in this flow. A flow not opened yet, or one whose hunks changed since,
// starts at its first unseen hunk. A position saved before the page kept the flow's hunks with it counts as changed.
export function openFlow(lineId) {
  const line = lineById(lineId)
  const saved = state.reviewer.flowPositions?.[line.id]
  const unchanged = saved?.stops?.join() === line.stops.map((stop) => stop.hunkId).join()
  const remembered = unchanged ? line.stops.findIndex((stop) => stop.hunkId === saved.hunkId) : -1
  const unseen = line.stops.findIndex((stop) => !isSeen(stop.hunkId))
  return go(line.id, remembered !== -1 ? remembered : unseen === -1 ? 0 : unseen)
}

// Get the address of a view. Home is the PR's own address, so a link to a review always opens its Home;
// a hunk is its station code, like /A2, and the other pages their name.
export function viewPath(view = state.view) {
  const { owner, repo, number } = state.review.pr
  const base = `/${owner}/${repo}/${number}`
  if (view.kind === 'home') return base
  if (view.kind === 'reviews') return `${base}/reviews`
  if (view.kind === 'terminus') return `${base}/submit`
  return `${base}/${stationCode(lineById(view.line), view.index)}`
}

// Open the view an address names, from the parts after the PR number. An address the review does not have opens Home.
export function openPath(parts = []) {
  correctingAddress = true
  try { openNamedView(parts) } finally { correctingAddress = false }
}

function openNamedView(parts) {
  const [name] = parts
  if (name === 'reviews') return goReviews()
  if (name === 'submit') return goTerminus()
  const code = /^([A-Z]+)(\d+)$/.exec(name || '')
  const line = code && lines().find((candidate) => candidate.letter === code[1])
  if (line && Number(code[2]) >= 1 && Number(code[2]) <= line.stops.length) return go(line.id, Number(code[2]) - 1)
  goHome()
}

// True while an address opens its view, so a correction of that address, like an unknown one that opens Home,
// replaces it in the history and the back button does not return to it.
let correctingAddress = false

// Put the view in the address bar, so a reload keeps it and the browser's back button returns to the view before.
// A static page has no server for these addresses, so its address stays as it is.
function showInAddress() {
  if (state.static) return
  const path = viewPath()
  if (window.location.pathname === path) return
  ownAddresses.add(path)
  navigateTo(path, { replace: correctingAddress })
}

// The addresses the page asked the router for and that have not arrived yet. The router changes the address a moment
// later, so after two quick moves the first address still arrives; it is the page's own, not a step back.
const ownAddresses = new Set()

// Whether an address change comes from the page itself. The browser's back and forward buttons give other addresses.
// Once the address matches the view, an address that never arrived is no longer expected.
export function isOwnAddress(path) {
  if (path === viewPath()) ownAddresses.clear()
  return ownAddresses.delete(path)
}

// Move one hunk forward or back in reading order. Past the last hunk comes Submit review.
export function step(delta) {
  if (state.view.kind === 'home') return delta > 0 ? nextUnseen() : undefined
  if (state.view.kind === 'reviews') return delta > 0 ? goTerminus() : undefined
  if (state.view.kind === 'terminus') {
    if (delta < 0) {
      const all = lines()
      const last = all[all.length - 1]
      go(last.id, last.stops.length - 1)
    }
    return
  }
  const all = lines()
  const lineIndex = all.findIndex((line) => line.id === state.view.line)
  const line = all[lineIndex]
  const next = state.view.index + delta
  if (next >= 0 && next < line.stops.length) return go(line.id, next)
  if (delta > 0) return lineIndex + 1 < all.length ? go(all[lineIndex + 1].id, 0) : goTerminus()
  if (lineIndex > 0) return go(all[lineIndex - 1].id, all[lineIndex - 1].stops.length - 1)
}

// After a verdict: the next hunk in the flow. At the end of the flow, the first hunk in it without a verdict;
// only when every hunk of the flow has one, the next flow or Submit review.
export function nextAfterVerdict() {
  if (state.view.kind !== 'station') return step(1)
  const line = lineById(state.view.line)
  if (state.view.index + 1 < line.stops.length) return step(1)
  const open = line.stops.findIndex((stop) => !verdictOf(stop.hunkId))
  return open === -1 ? step(1) : go(line.id, open)
}

export function nextUnseen() {
  for (const line of lines()) {
    const index = line.stops.findIndex((stop) => !isSeen(stop.hunkId))
    if (index !== -1) return go(line.id, index)
  }
  goTerminus()
}

// A verdict key does what the verdict button of the hunk in view does, so both follow the same rules.
// The buttons only show on a hunk, and not after the review is posted.
export function pressHunkVerdict(verdict) {
  if (state.view.kind !== 'station' || postedReview()) return
  const hunk = hunkById(lineById(state.view.line).stops[state.view.index]?.hunkId)
  if (hunk) setHunkVerdict(hunk.id, verdict)
}

// Open the list of keyboard shortcuts.
export function showShortcuts() { state.ui.shortcutsOpen = true }

// Open the list of hunks not seen yet on Submit review.
export function showUnseen() { state.ui.terminusOpen = { ...state.ui.terminusOpen, coverage: true } }

// Go to the next hunk with an open finding, in reading order after the hunk in view; after the last one, start at the top.
export function nextOpenFinding() {
  const open = new Set(liveFindings().filter((finding) => finding.hunkId && decisionOf(finding) === 'open').map((finding) => finding.hunkId))
  const stops = lines().flatMap((line) => line.stops.map((stop, index) => ({ line: line.id, index, hunkId: stop.hunkId })))
  const at = state.view.kind === 'station' ? stops.findIndex((stop) => stop.line === state.view.line && stop.index === state.view.index) : -1
  const next = [...stops.slice(at + 1), ...stops.slice(0, at + 1)].find((stop) => open.has(stop.hunkId))
  if (next) go(next.line, next.index)
  else notify('No open findings left.')
}

const SHORTCUT_ACTIONS = {
  nextHunk: () => step(1),
  previousHunk: () => step(-1),
  nextUnseen,
  nextOpenFinding,
  approveHunk: () => pressHunkVerdict('approved'),
  requestChangesHunk: () => pressHunkVerdict('changes'),
  commentHunk: () => pressHunkVerdict('comment'),
  goHome,
  goTerminus,
  showShortcuts,
}

// Run the shortcut for a key. Returns true when the key has a shortcut.
// The caller skips keys with a modifier, keys typed in a field and keys while a dialog is open.
export function handleShortcut(key) {
  if (!state.review) return false
  const shortcut = SHORTCUTS.find((candidate) => candidate.key === key)
  if (!shortcut) return false
  SHORTCUT_ACTIONS[shortcut.action]()
  return true
}
