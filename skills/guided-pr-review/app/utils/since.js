import { state } from './state.js'
import { hunkById, lines } from './review.js'
import { changesSince, newestOwnReview, sameCommit } from './panels.js'
import { saveReviewer } from './actions.js'
import { hasGenerated } from './generated.js'
import { diffRows } from './diff.js'

// Get changesSince while it is about the viewer's newest review. A newer review makes it stale until the agent writes it again.
function currentSince() {
  const changes = changesSince()
  return changes && sameCommit(newestOwnReview()?.commitId, changes.from) ? changes : null
}

// Get the hunks changed since the viewer's newest review, by hunk ID, each with its lines of the diff since then.
export function sinceHunks() { return currentSince()?.hunks || {} }

// Check whether the review has hunks changed since the last review, so the reviewer can choose to see only those.
export function scopeAvailable() { return Object.keys(sinceHunks()).length > 0 }

// Check whether the page shows only the hunks changed since the last review.
export function scopeActive() { return state.reviewer.scope !== 'all' && scopeAvailable() }

// Check whether a hunk is shown in the current scope.
export function inScope(hunkId) { return !scopeActive() || Object.hasOwn(sinceHunks(), hunkId) }

// Get a hunk as the page shows it: with the scope on, its lines since the last review in place of its diff against the
// base branch. `prLines` keeps the lines of the hunk's own diff in the head commit, the only lines GitHub takes comments on.
export function shownHunk(hunkId) {
  const hunk = hunkById(hunkId)
  const changes = scopeActive() && currentSince()
  const since = changes && changes.hunks[hunkId]
  if (!hunk || !since?.lines) return hunk
  const prLines = new Set(diffRows(hunk).filter((row) => row.kind === 'add' || row.kind === 'ctx').map((row) => row.newNo))
  return { ...hunk, ...since, sinceReview: true, sinceFrom: changes.from, sinceTo: changes.to, prLines }
}

// Get what changed in the file of a hunk since the last review, or null.
export function fileChange(hunkId) { return (currentSince()?.files || []).find((file) => file.path === hunkById(hunkId)?.file) || null }

// Choose between the changes since the last review (`since`) and all changes against the base branch (`all`).
export function setScope(scope) {
  state.reviewer.scope = scope
  saveReviewer()
}

// Get the stops of a flow in the scope, each with its index in the flow, so its station code stays the same. The stop in
// view is kept too, also when a link opened it outside the scope, so the map and j/k start from it.
export function shownStops(line) {
  const inView = (index) => state.view.kind === 'station' && state.view.line === line.id && state.view.index === index
  return line.stops.map((stop, index) => ({ ...stop, index })).filter((stop) => inView(stop.index) || inScope(stop.hunkId))
}

// Get the flows with at least one shown stop.
export function shownLines() { return lines().filter((line) => shownStops(line).length) }

// Check whether the group of generated files has a hunk in the scope.
export function groupShown() { return hasGenerated() && [...state.generated.hunkIds].some(inScope) }
