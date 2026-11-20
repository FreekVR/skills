import { state } from './state.js'
import { hunkById, standingSeverities, stationsOf, verdictOf } from './review.js'
import { markSeen, saveReviewer } from './actions.js'
import { nextAfterVerdict } from './navigation.js'

// Not in state.lines: a line there would make the generated hunks stops for go() and nextStopWhere.
export const GENERATED_LINE = { id: '__generated', name: 'Generated files', letter: '', color: 'generated', shape: 'square' }

// A null label means the file's own detail says why.
export const REASON_LABELS = { gitattributes: '.gitattributes', 'generator-list': null, header: 'Header says generated', name: 'Lockfile or snapshot name', confirmed: 'You confirmed' }

const SEVERITY_ORDER = ['approved', 'comment', 'changes']

// Get the IDs of the hunks of the generated files. Each generated file is one hunk, so a file's hunk is the one on its path.
export function generatedHunkIds(review) {
  const paths = new Set((review.generated?.files || []).map((file) => file.path))
  return review.hunks.filter((hunk) => paths.has(hunk.file)).map((hunk) => hunk.id)
}

// Check whether the review has a group of generated files.
export function hasGenerated() { return Boolean(state.generated) }

// Check whether a hunk belongs to the group of generated files.
export function isGenerated(hunkId) { return Boolean(state.generated?.hunkIds.has(hunkId)) }

// Get the generated files with their hunk and the flow steps that hold the same hunk.
export function generatedFiles() {
  const hunkOf = new Map([...(state.generated?.hunkIds || [])].map((id) => [hunkById(id)?.file, id]))
  return (state.review.generated?.files || []).filter((file) => hunkOf.has(file.path)).map((file) => {
    const hunkId = hunkOf.get(file.path)
    return { ...file, hunkId, shared: stationsOf(hunkId).map(({ line, index }) => ({ line, index })) }
  })
}

// Get the text that tells why a file counts as generated.
export function reasonLabel(file) { return REASON_LABELS[file.reason] ?? file.detail ?? '' }

// Get the reviewer's own verdict on the group.
export function groupVerdict() { return state.reviewer.generatedVerdict || null }

// Get the verdict the group counts as: a shared hunk the reviewer judged in its flow can be worse than the group verdict.
export function groupCountsAs() {
  if (!hasGenerated() || !groupVerdict()) return null
  const levels = [...state.generated.hunkIds].map((id) => SEVERITY_ORDER.indexOf(verdictOf(id)))
  return SEVERITY_ORDER[Math.max(...levels)]
}

// Get the severities that stand on the generated hunks, for the suggested verdict.
export function groupSeverities() { return [...(state.generated?.hunkIds || [])].flatMap((id) => standingSeverities(id)) }

// Give the group the reviewer's verdict, mark its hunks seen and go on.
export function setGeneratedVerdict(verdict) {
  state.reviewer.generatedVerdict = verdict
  for (const id of state.generated.hunkIds) markSeen(id, GENERATED_LINE.id)
  saveReviewer()
  return nextAfterVerdict()
}
