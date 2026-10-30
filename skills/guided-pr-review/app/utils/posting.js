import { state, VERDICTS, REVIEW_EVENTS } from './state.js'
import { acceptedItems, hunkById, plural, severityRank, verdictOf, viewerLogin } from './review.js'
import { saveReviewer } from './actions.js'

// Posting replaces the user's pending GitHub review, so its remarks and body must be in the page first.
export function importOwnReview() {
  const imported = new Set(state.reviewer.imported)
  for (const own of state.review.ownRemarks || []) {
    if (own.state !== 'pending' || imported.has(own.id)) continue
    state.reviewer.remarks.push({ id: own.id, hunkId: own.hunkId, line: own.line, side: own.side, severity: own.severity, body: own.body })
    imported.add(own.id)
  }
  const pending = state.review.ownPendingReview
  if (pending && !imported.has(`review:${pending.id}`)) {
    if (pending.body) state.reviewer.summary = [state.reviewer.summary, pending.body].filter(Boolean).join('\n\n')
    imported.add(`review:${pending.id}`)
  }
  if (imported.size !== state.reviewer.imported.length) {
    state.reviewer.imported = [...imported]
    saveReviewer()
  }
}

export function labelled(severity, body) { return `**${severity}:** ${body}` }

// Only text the AI wrote gets the disclosure: findings, and remarks that started from an AI answer.
export function withDisclosure(text, disclosure) { return disclosure ? `${text}\n\n${disclosure}` : text }

// Get the post event for GitHub and the contents it sends, by ID, so the page can tell later what is on GitHub.
export function buildPost(kind) {
  const disclosure = state.review.conventions.disclosure || {}
  const items = acceptedItems()
  const comments = []
  const general = []
  for (const item of items) {
    const hunk = item.hunkId ? hunkById(item.hunkId) : null
    if (!hunk || !item.line || hunk.lines.length === 0) {
      general.push(item)
      continue
    }
    const comment = { path: hunk.file, line: item.line, side: item.side || 'RIGHT', body: withDisclosure(labelled(item.severity, item.body), item.source === 'ai' && disclosure.comment) }
    if (item.startLine && (item.startLine !== item.line || item.startSide !== item.side)) Object.assign(comment, { start_line: item.startLine, start_side: item.startSide })
    comments.push(comment)
  }
  const parts = []
  if (state.reviewer.summary.trim()) parts.push(state.reviewer.summary.trim())
  // Lines after the first are indented, so a finding with several paragraphs stays one list item under its label.
  if (general.length) parts.push(general.map((item) => `- ${labelled(item.severity, item.body).replace(/\n(?=.)/g, '\n  ')}`).join('\n'))
  const body = withDisclosure(parts.join('\n\n'), (state.reviewer.summaryAiSuggested || general.some((item) => item.source === 'ai')) && disclosure.review).trim()
  const event = { type: 'post', kind, body, comments }
  if (kind === 'final') event.verdict = state.reviewer.verdict || proposedVerdict()
  const contents = items.map((item) => ({ id: item.id, body: item.body }))
  if (state.reviewer.summary.trim()) contents.push({ id: 'summary', body: state.reviewer.summary.trim() })
  return { event, contents }
}

// GitHub keeps every submitted review, but a new draft replaces the previous one, so only the latest draft counts.
export function githubStatus(id, body) {
  const done = sentEvents('post').filter((sent) => postFor(sent.id)?.status === 'posted')
  const holding = (sent) => (sent.contents || []).find((content) => content.id === id)
  const final = [...done].reverse().find((sent) => sent.kind === 'final' && holding(sent))
  const lastDraft = [...done].reverse().find((sent) => sent.kind === 'draft')
  const draft = lastDraft && !done.slice(done.indexOf(lastDraft) + 1).some((sent) => sent.kind === 'final') && holding(lastDraft) ? lastDraft : null
  const match = final || draft
  if (!match) return 'local'
  if (holding(match).body !== body) return 'changed'
  return final ? 'posted' : 'draft'
}

// The count sits on the button that sends those remarks to GitHub.
export function localCount() {
  return acceptedItems().filter((item) => ['local', 'changed'].includes(githubStatus(item.id, item.body))).length
}

export function postedOwnRemarks() { return (state.review.ownRemarks || []).filter((own) => own.state === 'posted') }

// The reviewer's posted comments that are still open on GitHub each need a call: resolve, or leave open.
export function openOwnThreads() { return postedOwnRemarks().filter((own) => own.threadId && !own.resolved) }
export function threadCall(own) { return state.reviewer.threadCalls?.[own.threadId] }
export function threadsWithoutCall() { return openOwnThreads().filter((own) => !threadCall(own)) }

// A comment needs the reviewer's look once commits came after it (the agent then wrote a fix check)
// or someone else replied last; until then there is nothing new to resolve or leave open.
export function threadsToCheck() {
  return threadsWithoutCall().filter((own) => own.fix || (own.replies?.length && own.replies.at(-1).author !== viewerLogin()))
}

// A posted comment stands until GitHub shows it resolved or the reviewer chose to resolve it.
export function standingOwnRemarks() { return postedOwnRemarks().filter((own) => !own.resolved && threadCall(own) !== 'resolve') }

export function undecidedLabel() { return plural(hunksWithoutVerdict().length, 'hunk') }

// Nothing standing → approve, only remarks below the cutoff → comment, anything else → request changes.
export function verdictFromSeverities(severities) {
  const threshold = severityRank(state.review.conventions.requestChangesFrom || 'minor')
  if (!severities.length) return 'approved'
  return severities.some((severity) => severityRank(severity) >= threshold) ? 'changes' : 'comment'
}

export function hunksWithoutVerdict() { return state.review.hunks.filter((hunk) => !verdictOf(hunk.id)) }

// The page proposes a verdict only after the reviewer made a call on every hunk. The proposal counts what the review
// posts and what is already on GitHub, not the findings the reviewer left open; the hunk verdicts can only raise it.
export function proposedVerdict() {
  if (hunksWithoutVerdict().length) return null
  const order = ['approved', 'comment', 'changes']
  const posted = standingOwnRemarks().map((own) => own.severity)
  const severities = [...acceptedItems().map((item) => item.severity), ...posted]
  const levels = [verdictFromSeverities(severities), ...Object.values(state.reviewer.hunkVerdicts)]
  return REVIEW_EVENTS[order[Math.max(...levels.map((level) => order.indexOf(level)))]]
}

export function newComments() {
  const known = state.reviewer.knownComments || []
  return (state.review.reviewComments || []).filter((comment) => !known.includes(comment.id))
}

export function sentEvents(type, hunkId) {
  return state.reviewer.sent.filter((event) => event.type === type && (hunkId === undefined || event.hunkId === hunkId))
}

export function answerFor(eventId) { return (state.review.answers || []).find((answer) => answer.eventId === eventId) }
export function postFor(eventId) { return (state.review.posts || []).find((post) => post.eventId === eventId) }

// GitHub keeps a submitted review. Once one is posted, the page shows what was sent until the reviewer starts a new round.
export function postedFinals() {
  return sentEvents('post').filter((sent) => sent.kind === 'final' && postFor(sent.id)?.status === 'posted')
}

export function postedReview() {
  const last = postedFinals().at(-1)
  return last && last.id !== state.reviewer.reopenedAfter ? last : null
}

export function isFinishing() { return sentEvents('finish').length > 0 }

export function postedInEarlierRound(id) {
  return postedFinals().some((sent) => (sent.contents || []).some((content) => content.id === id))
}

// After a new round the reviewer's verdict is empty, so a round posted before posts kept their payload has no verdict left.
export function postedVerdict(sent) {
  return VERDICTS.find((option) => option.id === (sent.payload?.verdict || state.reviewer.verdict || proposedVerdict())) || { icon: 'comment', done: 'Review posted' }
}

// A new round empties the form: its remarks, summary, accepted findings and thread calls are on GitHub already.
// Hunk verdicts stay, because a changed hunk gets a new ID and so has no verdict yet.
export function startNewRound() {
  const last = postedReview()
  if (!last) return
  Object.assign(state.reviewer, { reopenedAfter: last.id, summary: '', summaryAiSuggested: false, verdict: null, remarks: [], threadCalls: {}, threadReplies: {}, updateNote: '', copiedToSummary: [] })
  saveReviewer()
}

// New commits after a posted review start the next round.
export function startRoundOnNewCommits() {
  const last = postedReview()
  if (last?.headSha && last.headSha !== state.review.pr.headSha) startNewRound()
}

export function hasOwnReview() { return (state.review.reviews || []).some((review) => review.author === viewerLogin()) }

// Replies and resolved threads of an update: only threads the reviewer made a call on, and only replies with text.
export function threadPayload() {
  const disclosure = state.review.conventions.disclosure || {}
  const calls = (call) => openOwnThreads().filter((own) => threadCall(own) === call)
  return {
    resolve: calls('resolve').filter((own) => own.canResolve !== false).map((own) => own.threadId),
    replies: calls('open').map((own) => ({ own, body: (state.reviewer.threadReplies[own.threadId] || '').trim() })).filter(({ body }) => body)
      .map(({ own, body }) => ({ threadId: own.threadId, body: withDisclosure(body, body === own.fix?.reply?.trim() && disclosure.comment) })),
  }
}

export function pendingSummaryDraft() {
  const asked = sentEvents('summarize').at(-1)
  const answer = asked && answerFor(asked.id)
  return answer && state.reviewer.summaryFrom !== asked.id ? { eventId: asked.id, text: answer.answer } : null
}

// Replace the summary with the AI draft of this summarize event.
export function useSummaryDraft(eventId) {
  const draft = pendingSummaryDraft()
  if (!draft || draft.eventId !== eventId) return
  Object.assign(state.reviewer, { summary: draft.text.trim(), summaryFrom: eventId, summaryAiSuggested: true })
  saveReviewer()
}

// Text the reviewer wrote is never overwritten without asking.
export function applySummaryDraft() {
  const draft = pendingSummaryDraft()
  if (draft && !state.reviewer.summary.trim()) useSummaryDraft(draft.eventId)
}
