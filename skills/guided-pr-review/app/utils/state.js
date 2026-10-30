// The page state of one review. Vue draws the page again when it changes.
export const state = reactive({
  review: null,
  reviewJson: '',
  reviewer: null,
  lines: [],
  hunks: new Map(),
  stations: new Map(),
  view: { kind: 'station', line: null, index: 0 },
  ui: { openExplain: new Set(), composer: null, drafts: {}, editing: null },
  freshHunks: new Set(),
  seen: new Set(),
  reviews: null,
  offline: false,
  bootError: null,
})

// Colour tokens of the flows. The view maps each one to a colour.
export const LINE_COLORS = ['line-a', 'line-b', 'line-c', 'line-d', 'line-e', 'line-f']
// Colour and shape together tell flows apart: the shape changes each time the colours run out.
export const LINE_SHAPES = ['circle', 'square', 'diamond', 'hexagon']

// X is kept for "Not in a flow". After Y come two-letter names: AA, AB, …
export const FLOW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWY'

// Get the letter of the flow at this index.
export function flowLetter(index) {
  const count = FLOW_LETTERS.length
  return index < count ? FLOW_LETTERS[index] : FLOW_LETTERS[Math.floor(index / count) - 1] + FLOW_LETTERS[index % count]
}

// `icon` names a verdict icon: approved, changes, comment or undecided. `button` names the button colour.
export const VERDICTS = [
  { id: 'APPROVE', label: 'Approve', done: 'Approved', hint: 'The PR can merge as it is.', icon: 'approved', button: 'ok' },
  { id: 'REQUEST_CHANGES', label: 'Request changes', done: 'Changes requested', hint: 'The author must change something first.', icon: 'changes', button: 'danger' },
  { id: 'COMMENT', label: 'Comment', done: 'Commented', hint: 'Feedback without a verdict.', icon: 'comment', button: 'ink' },
]
export const POLL_MS = 3000
export const CHECK_MS = 5 * 60 * 1000

export const THEMES = [
  { id: 'system', label: 'Use the system setting' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

// `action` names an entry of the shortcut actions in navigation.js.
export const SHORTCUTS = [
  { key: 'j', label: 'Next hunk', action: 'nextHunk' },
  { key: 'k', label: 'Previous hunk', action: 'previousHunk' },
  { key: 'n', label: 'Next unseen hunk', action: 'nextUnseen' },
  { key: 'a', label: 'Approve this hunk', action: 'approveHunk' },
  { key: 'r', label: 'Request changes on this hunk', action: 'requestChangesHunk' },
  { key: 'c', label: 'Comment on this hunk', action: 'commentHunk' },
  { key: 'h', label: 'Home', action: 'goHome' },
  { key: 's', label: 'Submit review', action: 'goTerminus' },
  { key: '?', label: 'Show these shortcuts', action: 'showShortcuts' },
]

export const OPINIONS = {
  agree: { label: 'The AI agrees', icon: 'approved' },
  disagree: { label: 'The AI disagrees', icon: 'changes' },
  unsure: { label: 'The AI is not sure', icon: 'comment' },
}

export const STATUS_LABELS = { local: 'Local only', draft: 'In GitHub draft', posted: 'Posted to GitHub', changed: 'Changed since posted' }

export const REVIEW_EVENTS = { approved: 'APPROVE', comment: 'COMMENT', changes: 'REQUEST_CHANGES' }

export const PAGE_VIEWS = ['home', 'reviews', 'terminus']

export const FLOW_VERDICT_LABELS = { approved: 'All hunks approved', changes: 'Changes requested', comment: 'Reviewed with comments' }

export const POSTED_HUNK_VERDICTS = { approved: 'You approved this hunk', changes: 'You requested changes', comment: 'You commented' }

export const REVIEW_STATES = {
  APPROVED: { label: 'approved', icon: 'approved' },
  CHANGES_REQUESTED: { label: 'requested changes', icon: 'changes' },
  COMMENTED: { label: 'commented', icon: 'comment' },
  DISMISSED: { label: 'review dismissed', icon: 'comment' },
}

export const FIX_LABELS = { fixed: 'Looks fixed', 'not-fixed': 'Not fixed', unclear: 'Unclear' }

export const SEVERITY_TONES = ['info', 'info', 'warn', 'bad']

export const AC_VERDICTS = { met: 'Met', 'not-met': 'Not met', unclear: 'Unclear' }

export const POST_NOUNS = { final: 'review', draft: 'draft', update: 'update' }

export const LANGUAGE_BY_EXTENSION = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', vue: 'xml', html: 'xml', phtml: 'xml', yml: 'yaml', md: 'markdown', sh: 'bash', py: 'python', rb: 'ruby' }

// Symfony documents the phpstorm:// scheme. No other JetBrains editor has a documented scheme.
export const PHPSTORM_EXTENSIONS = ['php', 'phtml']
