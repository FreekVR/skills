import { state, VERDICTS, REVIEW_EVENTS } from './state.js'
import { acceptedItems, hunkById, openReviewComments, plural, severities, severityRank, verdictOf, viewerLogin } from './review.js'
import { refreshState } from './panels.js'
import { saveReviewer } from './actions.js'
import { stackLine } from './stack.js'

// Posting replaces the user's pending GitHub review, so its remarks and body must be in the page first.
export function importOwnReview() {
  const imported = new Set(state.reviewer.imported)
  for (const own of state.review.ownRemarks || []) {
    if (own.state !== 'pending' || imported.has(own.id)) continue
    state.reviewer.remarks.push({ id: own.id, hunkId: own.hunkId, line: own.line, side: own.side, severity: own.severity ?? severities()[0], ...(own.severitySource === 'ai' && { severitySource: 'ai' }), body: own.body })
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

// A finding opens with a header line like a conventional commit, `**minor(rule): title**`; a remark has only its severity.
export function labelled(item) {
  if (!item.title) return `**${item.severity}:** ${item.body}`
  const stack = stackLine(item)
  const inStack = stack?.post ? `\n\nIn the stack: ${stack.text}` : ''
  return `**${item.severity}${item.rule ? `(${item.rule})` : ''}: ${item.title}**\n\n${item.body}${inStack}`
}

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
    const comment = { path: hunk.file, line: item.line, side: item.side || 'RIGHT', body: withDisclosure(labelled(item), item.source === 'ai' && disclosure.comment) }
    if (item.startLine && (item.startLine !== item.line || item.startSide !== item.side)) Object.assign(comment, { start_line: item.startLine, start_side: item.startSide })
    comments.push(comment)
  }
  const parts = []
  if (state.reviewer.summary.trim()) parts.push(state.reviewer.summary.trim())
  // Lines after the first are indented, so a finding with several paragraphs stays one list item under its label.
  if (general.length) parts.push(general.map((item) => `- ${labelled(item).replace(/\n(?=.)/g, '\n  ')}`).join('\n'))
  const body = withDisclosure(parts.join('\n\n'), (state.reviewer.summaryAiSuggested || general.some((item) => item.source === 'ai')) && disclosure.review).trim()
  const event = { type: 'post', kind, body, comments }
  // A reply or a resolved thread shows on GitHub at once, so only the final review takes them; a draft stays private.
  if (kind === 'final') Object.assign(event, { verdict: state.reviewer.verdict || proposedVerdict(), unresolve: threadsToUnresolve().map((thread) => thread.threadId), replies: pendingReplies(), resolve: threadsToResolve() })
  const contents = items.map((item) => ({ id: item.id, body: item.body }))
  if (state.reviewer.summary.trim()) contents.push({ id: 'summary', body: state.reviewer.summary.trim() })
  return { event, contents }
}

// Get the gh command that posts the final review, for a static page that has no agent to post it.
// The payload holds the fields of the reviews endpoint (references/posting.md); a ' in it is closed, escaped and opened again for the shell.
export function ghCommand(event) {
  const { owner, repo, number, headSha } = state.review.pr
  const payload = JSON.stringify({ commit_id: headSha, body: event.body, event: event.verdict, comments: event.comments })
  return `printf '%s\\n' '${payload.replaceAll("'", "'\\''")}' | gh api --method POST repos/${owner}/${repo}/pulls/${number}/reviews --input -`
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
// A developer may resolve the reviewer's comment without fixing it. The agent then checks the code,
// and a comment it does not call fixed needs the reviewer's call: unresolve, or keep it resolved.
export function resolvedByOthers(own) { return Boolean(own.resolved && own.resolvedBy && viewerLogin() && own.resolvedBy !== viewerLogin()) }
export function doubtfulResolved(own) { return resolvedByOthers(own) && Boolean(own.fix) && own.fix.verdict !== 'fixed' }
export function doubtfulResolvedThreads() { return postedOwnRemarks().filter((own) => own.threadId && doubtfulResolved(own)) }

// A call only counts while it fits the thread on GitHub: unresolve or keep for a resolved thread, resolve or open for an open one.
// After a post, GitHub's new state makes the old call stale, so the thread gets its buttons back.
export function threadCall(own) {
  const call = state.reviewer.threadCalls?.[own.threadId]
  return (own.resolved ? ['unresolve', 'keep'] : ['resolve', 'open']).includes(call) ? call : undefined
}
// The reviewer's comments that take a call: the open ones, and the resolved ones the AI doubts.
export function threadsNeedingCall() { return [...openOwnThreads(), ...doubtfulResolvedThreads()] }
export function threadsWithoutCall() { return threadsNeedingCall().filter((own) => !threadCall(own)) }

// A comment needs the reviewer's look once commits came after it (the agent then wrote a fix check)
// or someone else replied last; until then there is nothing new to resolve or leave open.
export function threadsToCheck() { return threadsWithoutCall().filter((own) => checkReasons(own).length) }

// Why a comment needs the reviewer's decision, as the page shows it next to the comment.
export function checkReasons(own) {
  if (own.resolved) return doubtfulResolved(own) ? [`@${own.resolvedBy} resolved it; the AI ${own.fix.verdict === 'not-fixed' ? 'thinks it is not fixed' : 'is not sure it is fixed'}`] : []
  const last = own.replies?.at(-1)
  return [own.fix ? 'New commits since your comment' : '', last && last.author !== viewerLogin() ? `@${last.author} replied` : ''].filter(Boolean)
}

export function needsDecisionLabel(count) { return `${count} ${count === 1 ? 'needs' : 'need'} your decision` }

// A posted comment stands until GitHub shows it resolved or the reviewer chose to resolve it, and again once the reviewer chose to unresolve it.
export function standingOwnRemarks() { return postedOwnRemarks().filter((own) => (own.resolved ? threadCall(own) === 'unresolve' : threadCall(own) !== 'resolve')) }

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

// Events the agent answers, and how the page sees the answer: the sent events of these types wait until it does.
const ANSWERED = {
  ask: (sent) => answerFor(sent.id),
  summarize: (sent) => answerFor(sent.id),
  // A hunk that is not in the review has nothing to explain, so the request counts as answered.
  explain: (sent) => { const hunk = hunkById(sent.hunkId); return !hunk || hunk.explanationMore },
  post: (sent) => postFor(sent.id),
  // Waits by the rule of the banner: only the last refresh, and only while GitHub has newer commits.
  refresh: (sent) => { const load = refreshState(); return load?.status !== 'loading' || load.eventId !== sent.id },
  // Waits until the other PR's review exists. When the stack falls apart or the agent refuses the start, the count keeps it
  // until the reviewer starts a new round or the PR's review appears.
  'start-review': (sent) => state.stackStatus.some((status) => status.number === sent.number && status.hasReview),
}

// Get the sent events that still wait for the agent's answer.
export function waitingRequests() {
  return state.reviewer.sent
    .filter((sent) => ANSWERED[sent.type] && !ANSWERED[sent.type](sent))
    .map((sent) => ({ id: sent.id, type: sent.type, hunkId: sent.hunkId }))
}

// Get what the agent of this review does. It counts as working until the page has an answer, so the page does not flash "No agent" on boot.
export function agentState() {
  if (!state.agent) return 'working'
  return state.agent.connected ? 'working' : 'none'
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

// A finish ends the agent's session. Any event the page sent after it belongs to a later session, so Finish is offered again.
// Starting the review of another PR does not count: that is not the session of this review.
export function isFinishing() { return state.reviewer.sent.findLast((sent) => sent.type !== 'start-review')?.type === 'finish' }

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
  Object.assign(state.reviewer, { reopenedAfter: last.id, summary: '', summaryAiSuggested: false, verdict: null, remarks: [], threadCalls: {}, threadReplies: {}, copiedToSummary: [] })
  saveReviewer()
}

// New commits after a posted review start the next round.
export function startRoundOnNewCommits() {
  const last = postedReview()
  if (last?.headSha && last.headSha !== state.review.pr.headSha) startNewRound()
}

export function hasOwnReview() { return (state.review.reviews || []).some((review) => review.author === viewerLogin()) }

// The replies with text in any open thread, the reviewer's own and those of others, and in threads the review unresolves.
// A reply that is still the AI's draft gets the disclosure.
export function pendingReplies() {
  const disclosure = state.review.conventions.disclosure || {}
  return [...openOwnThreads(), ...openReviewComments(), ...threadsToUnresolve()].filter((thread) => thread.threadId)
    .map((thread) => ({ thread, body: (state.reviewer.threadReplies[thread.threadId] || '').trim() })).filter(({ body }) => body)
    .map(({ thread, body }) => ({ threadId: thread.threadId, body: withDisclosure(body, body === thread.fix?.reply?.trim() && disclosure.comment) }))
}

// The resolved threads, the reviewer's own and those of others, that the reviewer chose to unresolve.
export function threadsToUnresolve() {
  return [...postedOwnRemarks(), ...(state.review.reviewComments || [])]
    .filter((thread) => thread.threadId && thread.resolved && thread.canUnresolve !== false && threadCall(thread) === 'unresolve')
}

// The reviewer's own open threads they chose to resolve, as thread IDs for the post.
export function threadsToResolve() {
  return openOwnThreads().filter((own) => threadCall(own) === 'resolve' && own.canResolve !== false).map((own) => own.threadId)
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
