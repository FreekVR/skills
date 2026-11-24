import { state } from './state.js'
import { hunkById, lines } from './review.js'
import { changesSince, newestOwnReview, sameCommit } from './panels.js'
import { saveReviewer } from './actions.js'
import { hasGenerated } from './generated.js'

// Get the files changed or moved since the viewer's newest review, by path. Empty without a list from the agent, and
// for a list from before a newer review, until the agent writes it again.
export function sinceFiles() {
  const changes = changesSince()
  if (!changes?.files || !sameCommit(newestOwnReview()?.commitId, changes.from)) return new Map()
  return new Map(changes.files.map((file) => [file.path, file]))
}

// Check whether the page shows only the hunks changed since the last review.
export function scopeActive() { return state.reviewer.scope !== 'all' && sinceFiles().size > 0 }

// Check whether a hunk is shown in the current scope.
export function inScope(hunkId) {
  const files = sinceFiles()
  return state.reviewer.scope === 'all' || !files.size || files.has(hunkById(hunkId)?.file)
}

// Get what changed in the file of a hunk since the last review, or null.
export function fileChange(hunkId) { return sinceFiles().get(hunkById(hunkId)?.file) || null }

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
