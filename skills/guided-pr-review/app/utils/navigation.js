import { state, PAGE_VIEWS, SHORTCUTS } from './state.js'
import { hunkById, isSeen, lineById, lines } from './review.js'
import { postedReview } from './posting.js'
import { markSeen, saveReviewer, setHunkVerdict } from './actions.js'

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
  state.reviewer.flowPositions = { ...state.reviewer.flowPositions, [line.id]: line.stops[bounded].hunkId }
  state.ui.composer = null
  state.ui.askOpen = false
  state.ui.criteriaOpen = undefined
  state.ui.compactMap = false
  savePosition()
  markCurrentSeen()
}

export function goHome() {
  state.view = { kind: 'home' }
  state.ui.askOpen = false
  state.ui.composer = null
  savePosition()
}

export function goReviews() {
  state.view = { kind: 'reviews' }
  state.ui.askOpen = false
  state.ui.composer = null
  savePosition()
}

export function goTerminus() {
  state.view = { kind: 'terminus' }
  state.ui.askOpen = false
  state.ui.composer = null
  savePosition()
}

export function goFirst() { return go(lines()[0].id, 0) }

// Back to the hunk the reviewer last had open in this flow; a flow not opened yet starts at its first unseen hunk.
export function openFlow(lineId) {
  const line = lineById(lineId)
  const remembered = line.stops.findIndex((stop) => stop.hunkId === state.reviewer.flowPositions?.[line.id])
  const unseen = line.stops.findIndex((stop) => !isSeen(stop.hunkId))
  return go(line.id, remembered !== -1 ? remembered : unseen === -1 ? 0 : unseen)
}

// A reload reopens the hunk the reviewer was on, so questions and remarks on it stay in view.
export function savePosition() {
  state.reviewer.position = PAGE_VIEWS.includes(state.view.kind) ? { kind: state.view.kind } : { kind: 'hunk', line: state.view.line, hunkId: lineById(state.view.line).stops[state.view.index]?.hunkId }
  saveReviewer()
}

export function restorePosition() {
  const position = state.reviewer.position
  if (!position) return false
  if (PAGE_VIEWS.includes(position.kind)) { state.view = { kind: position.kind }; return true }
  const line = state.lines.find((candidate) => candidate.id === position.line)
  const index = line ? line.stops.findIndex((stop) => stop.hunkId === position.hunkId) : -1
  if (index === -1) return false
  state.view = { kind: 'station', line: line.id, index }
  return true
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

const SHORTCUT_ACTIONS = {
  nextHunk: () => step(1),
  previousHunk: () => step(-1),
  nextUnseen,
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
