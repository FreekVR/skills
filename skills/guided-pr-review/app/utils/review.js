import { state, LINE_COLORS, LINE_SHAPES, flowLetter, OPINIONS, STATUS_LABELS, SEVERITY_TONES } from './state.js'
import { githubStatus, hasOwnReview, postedInEarlierRound, postedReview, standingOwnRemarks } from './posting.js'

// Get a reviewer state with every field set.
export function emptyReviewer() {
  return { seen: [], seenIn: {}, decisions: {}, edits: {}, severities: {}, remarks: [], summary: '', verdict: null, hunkVerdicts: {}, threadCalls: {}, threadReplies: {}, knownHunks: [], sent: [], imported: [] }
}

// Lines, hunks and stations only change with review.json, so index them once per change.
export function setReview(review, json = JSON.stringify(review)) {
  // The agent writes review.json as soon as it has the PR and its hunks, and adds the rest as it goes.
  state.review = { findings: [], context: {}, conventions: {}, ...review }
  state.reviewJson = json
  state.hunks = new Map(review.hunks.map((hunk) => [hunk.id, hunk]))
  state.lines = buildLines(review)
  const stations = new Map()
  for (const line of state.lines) {
    line.stops.forEach((stop, index) => {
      if (!stations.has(stop.hunkId)) stations.set(stop.hunkId, [])
      stations.get(stop.hunkId).push({ line, index })
    })
  }
  state.stations = stations
}

// Get the flows of a review as lines of stops. Without flows, one line holds all files.
export function buildLines(review) {
  if (review.layout === 'directory' || !review.flows || review.flows.length === 0) {
    const sorted = [...review.hunks].sort((a, b) => a.file.localeCompare(b.file) || (a.newStart || 0) - (b.newStart || 0))
    return [{ id: '__files', letter: 'F', name: 'All files', explanation: 'Files in directory order.', color: 'unplaced', stops: sorted.map((hunk) => ({ hunkId: hunk.id, why: '' })), acceptanceCriteria: [] }]
  }
  const result = review.flows.map((flow, index) => ({
    id: flow.id,
    letter: flowLetter(index),
    name: flow.name,
    entry: flow.entry,
    end: flow.end,
    explanation: flow.explanation,
    acceptanceCriteria: flow.acceptanceCriteria || [],
    noCriteria: flow.noCriteria || '',
    icon: flow.icon,
    color: LINE_COLORS[index % LINE_COLORS.length],
    shape: LINE_SHAPES[Math.floor(index / LINE_COLORS.length) % LINE_SHAPES.length],
    stops: flow.steps.map((step) => ({ hunkId: step.hunkId, why: step.why })),
  }))
  if (review.notInAnyFlow && review.notInAnyFlow.length) {
    result.push({ id: '__none', letter: 'X', name: 'Not in a flow', explanation: 'Changes that are not part of a flow.', color: 'unplaced', acceptanceCriteria: [], stops: review.notInAnyFlow.map((hunkId) => ({ hunkId, why: '' })) })
  }
  return result
}

export function lines() { return state.lines }
export function hunkById(id) { return state.hunks.get(id) }
export function lineById(id) { return state.lines.find((line) => line.id === id) || state.lines[0] }
export function isSeen(hunkId) { return state.seen.has(hunkId) }
export function allHunkIds() { return state.review.hunks.map((hunk) => hunk.id) }
export function unseenHunks() { return state.review.hunks.filter((hunk) => !isSeen(hunk.id)) }

export function plural(count, word, many = `${word}s`) { return `${count} ${count === 1 ? word : many}` }

export function stationCode(line, index) { return `${line.letter}${index + 1}` }
export function stationsOf(hunkId) { return state.stations.get(hunkId) || [] }
export function linesOf(hunkId) { return stationsOf(hunkId).map((station) => station.line) }
export function firstStationOf(hunkId) { return stationsOf(hunkId)[0] || null }

// Get the acceptance criterion with this ID from the linked tickets.
export function criterionById(id) {
  for (const ticket of state.review.context.tickets || []) {
    for (const criterion of ticket.acceptanceCriteria || []) {
      if (criterion.id === id) return criterion
    }
  }
  return null
}

export function severities() { return state.review.conventions.severities || ['nit', 'minor', 'medium', 'major'] }
export function severityRank(severity) { return Math.max(0, severities().indexOf(severity)) }
// The conventions may list any number of severities; the page has four colour levels.
export function severityLevel(severity) {
  const count = severities().length
  return Math.min(3, Math.round((severityRank(severity) / Math.max(1, count - 1)) * 3))
}
export function severityTone(severity) { return SEVERITY_TONES[severityLevel(severity)] }

export function verdictOf(hunkId) { return state.reviewer.hunkVerdicts[hunkId] }

export function findingText(finding) { return state.reviewer.edits[finding.id] ?? finding.body }
export function findingSeverity(finding) { return state.reviewer.severities[finding.id] ?? finding.severity }
export function decisionOf(finding) { return state.reviewer.decisions[finding.id] || 'open' }

// The AI suggests a severity; the reviewer can change it, and the tooltip keeps the suggestion in view.
export function severitySelect(finding) {
  const current = findingSeverity(finding)
  const changed = current !== finding.severity
  const title = changed ? `Severity. The AI suggested ${finding.severity}.` : 'Severity. Change it if you disagree with the AI.'
  return { current, suggested: finding.severity, changed, title }
}

// Get the findings and remarks the next post sends.
export function acceptedItems() {
  const findings = state.review.findings
    .filter((finding) => decisionOf(finding) === 'accepted' && !postedInEarlierRound(finding.id))
    .map((finding) => ({ id: finding.id, hunkId: finding.hunkId, startLine: finding.startLine, startSide: finding.startSide, line: finding.line, side: finding.side, severity: findingSeverity(finding), title: finding.title, rule: finding.rule, stack: finding.stack, body: findingText(finding), source: 'ai' }))
  const remarks = state.reviewer.remarks
    .filter((remark) => remark.hunkId === null || hunkById(remark.hunkId))
    .map((remark) => ({ ...remark, source: remark.aiSuggested ? 'ai' : 'reviewer' }))
  return [...findings, ...remarks]
}

// GitHub serves every account's avatar at github.com/<login>.png.
export function avatar(login) {
  if (!login) return ''
  return `https://github.com/${encodeURIComponent(login)}.png?size=64`
}

export function viewerLogin() { return state.review.viewer?.login }

// Get what the AI thinks of a comment: kind, label and text.
export function opinionLine(opinion) {
  if (!opinion || !opinion.text) return null
  const kind = OPINIONS[opinion.stance] ? opinion.stance : 'unsure'
  return { kind, label: OPINIONS[kind].label, text: opinion.text }
}

export function openReviewComments() { return (state.review.reviewComments || []).filter((comment) => !comment.resolved) }
export function reviewCommentsOn(hunkId) { return openReviewComments().filter((comment) => comment.hunkId === hunkId) }

export function ownRemark(id) { return (state.review.ownRemarks || []).find((own) => own.id === id) }

export function outdatedRemarks() {
  return state.reviewer.remarks.filter((remark) => remark.hunkId !== null && !hunkById(remark.hunkId))
}

// Get the GitHub status of a remark with its label and hint.
export function statusBadge(id, body) {
  const status = githubStatus(id, body)
  const hint = status === 'local' ? 'Not on GitHub yet. Post a draft or the review to send it.' : status === 'changed' ? 'Post again to update GitHub.' : ''
  return { status, label: STATUS_LABELS[status], hint }
}

// Get the PR whose agent the page shows. Until the agent wrote review.json, that is the review the start came from.
export function agentPr() {
  if (state.review) return state.review.pr
  const page = state.preparing
  return { ...page, number: state.agent?.preparing?.from ?? page.number }
}

// The shared server lists all reviews without marking one as current, so the page compares the pull request.
export function isCurrentReview(review) {
  const pr = state.review.pr
  return review.owner === pr.owner && review.repo === pr.repo && Number(review.number) === Number(pr.number)
}

export function reviewRef(review) { return `${review.owner}/${review.repo}#${review.number}` }

// The quotes keep a directory with spaces in one piece; a quote in the path is closed, escaped and opened again.
export function shellQuote(text) { return `'${text.replaceAll("'", `'\\''`)}'` }

// How to bring back the agent session of a review whose page does not run. Without a session, `command` is null
// and the reviewer asks the agent to resume the review named by `ref`.
export function resumeHelp(review) {
  const session = review.session
  return { ref: reviewRef(review), command: session?.sessionId ? `cd ${shellQuote(session.cwd)} && claude --resume ${session.sessionId}` : null }
}

// Severities of everything still standing: AI findings not dismissed and the reviewer's remarks. Without a hunk, the whole PR.
export function standingSeverities(hunkId) {
  const on = (item) => hunkId === undefined || item.hunkId === hunkId
  return [
    ...state.review.findings.filter((finding) => on(finding) && decisionOf(finding) !== 'dismissed').map(findingSeverity),
    ...state.reviewer.remarks.filter(on).map((remark) => remark.severity),
    ...standingOwnRemarks().filter(on).map((own) => own.severity),
  ]
}

// Format a time as a short label: only the time for today.
export function timeLabel(at) {
  const date = new Date(at)
  const today = date.toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat(undefined, today ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function fileName(path) { return path.split('/').pop() }

// Get the title of the current view, for the review strip.
export function viewTitle() {
  if (state.view.kind === 'home') return 'Home'
  if (state.view.kind === 'terminus') return postedReview() ? 'Review posted' : hasOwnReview() ? 'Post a new review' : 'Submit review'
  if (state.view.kind === 'reviews') return 'Existing reviews'
  const line = lineById(state.view.line)
  const hunk = hunkById(line.stops[state.view.index]?.hunkId)
  return `${stationCode(line, state.view.index)} ${hunk ? fileName(hunk.file) : ''}`
}

// A flow only gets a verdict once each of its hunks has one: one request for changes decides it, approval needs all.
export function flowVerdict(line) {
  const verdicts = line.stops.map((stop) => verdictOf(stop.hunkId))
  if (!verdicts.length || verdicts.some((verdict) => !verdict)) return null
  if (verdicts.includes('changes')) return 'changes'
  return verdicts.every((verdict) => verdict === 'approved') ? 'approved' : 'comment'
}

// Hunks that are new or gone since the page last loaded the review. The counts add up until the next refresh, because the
// agent can write the new hunks in several passes; they are kept, so a reload can still show them.
export function noteFreshHunks() {
  const known = state.reviewer.knownHunks || []
  const current = allHunkIds()
  // Hunks marked changed in an earlier load stay marked until the reviewer opens them.
  for (const id of state.reviewer.changedHunks || []) if (current.includes(id) && !isSeen(id)) state.freshHunks.add(id)
  if (known.length) {
    for (const id of current) if (!known.includes(id) && !isSeen(id)) state.freshHunks.add(id)
    const added = current.filter((id) => !known.includes(id)).length
    const gone = known.filter((id) => !current.includes(id)).length
    const before = state.reviewer.hunkChanges || { added: 0, gone: 0 }
    if (added || gone) state.reviewer.hunkChanges = { added: before.added + added, gone: before.gone + gone }
  }
  state.reviewer.knownHunks = current
  state.reviewer.changedHunks = [...state.freshHunks]
}

export function ticketCriteria() { return (state.review.context.tickets || []).flatMap((ticket) => ticket.acceptanceCriteria || []) }

export function criteriaHaveVerdicts(line) { return line.acceptanceCriteria.some((id) => criterionById(id)?.verdict) }

// Findings on hunks that are no longer in the PR do not count.
export function liveFindings() { return state.review.findings.filter((finding) => finding.hunkId === null || hunkById(finding.hunkId)) }

export function worstOf(findings) { return findings.reduce((worst, finding) => (severityRank(finding.severity) > severityRank(worst.severity) ? finding : worst)) }

export function othersReviewCount() { return (state.review.reviews || []).filter((review) => review.author !== viewerLogin()).length }
