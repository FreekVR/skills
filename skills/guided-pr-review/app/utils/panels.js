// The data parts of the old page's render functions. The view draws them; icon names here are names, not icons:
// verdict icons (approved, changes, comment, undecided) and status icons (ok, bad, warn, finding, none, coverage, notRead, progress, link).
import { state, VERDICTS, FIX_LABELS, REVIEW_STATES, AC_VERDICTS, POST_NOUNS } from './state.js'
import { acceptedItems, criterionById, isCurrentReview, decisionOf, findingSeverity, firstStationOf, hunkById, isSeen, liveFindings, openReviewComments, outdatedRemarks, plural, resumeHelp, severities, severityRank, severityTone, ticketCriteria, timeLabel, unseenHunks, viewerLogin, worstOf } from './review.js'
import { answerFor, buildPost, githubStatus, isFinishing, newComments, openOwnThreads, postFor, postedOwnRemarks, postedReview, postedVerdict, proposedVerdict, sentEvents, threadCall, threadsToCheck, threadsWithoutCall, hunksWithoutVerdict, pendingSummaryDraft } from './posting.js'
import { diffRows, lineLabel } from './diff.js'

// Each kind of change on GitHub comes with the one action that deals with it.
// `key` changes when the banner says something new, so the view can announce it once.
export function updates() {
  const remote = state.review.remote || {}
  const banners = []
  if (state.offline) {
    const { owner, repo, number } = state.review.pr
    const current = (state.reviews || []).find(isCurrentReview) || { owner, repo, number }
    banners.push({ kind: 'offline', key: 'offline', resume: resumeHelp(current) })
  }
  if (remote.state === 'merged' || remote.state === 'closed') {
    banners.push({ kind: 'state', key: `state-${remote.state}`, state: remote.state, finishing: isFinishing() })
  }
  if (remote.headSha && remote.headSha !== state.review.pr.headSha) {
    banners.push({ kind: 'head', key: `head-${remote.headSha}`, updating: state.ui.updatingTo === remote.headSha, canStartRound: Boolean(postedReview()) })
  }
  const fresh = newComments()
  if (fresh.length) {
    banners.push({ kind: 'comments', key: `comments-${fresh.length}`, count: fresh.length, authors: [...new Set(fresh.map((comment) => comment.author))] })
  }
  return banners
}

// The advice follows from the findings and the repo's own severity cutoff, so it never contradicts them.
export function advice(hunk) {
  const findings = state.review.findings.filter((finding) => finding.hunkId === hunk.id)
  const cutoff = state.review.conventions.requestChangesFrom || 'minor'
  const threshold = severityRank(cutoff)
  const open = findings.filter((finding) => decisionOf(finding) !== 'dismissed')
  const blocking = open.filter((finding) => severityRank(findingSeverity(finding)) >= threshold)
  const count = (list) => plural(list.length, 'finding')
  const result = blocking.length
    ? { kind: 'changes', title: 'Request changes', text: `${count(blocking)} at ${cutoff} or higher.` }
    : open.length
      ? { kind: 'feedback', title: 'Leave feedback', text: `${count(open)} below the request-changes level.` }
      : { kind: 'ok', title: 'Looks good', text: 'The AI found nothing to change in this hunk.' }
  // Only a hunk with a line can get a remark on the whole hunk.
  return { ...result, canRemark: diffRows(hunk).some((row) => row.kind !== 'meta') }
}

export function explainPending(hunk) { return sentEvents('explain', hunk.id).length > 0 && !hunk.explanationMore }

// The hunk in view is also in an earlier stop, so the reviewer saw it there.
export function seenBefore(hunkId) {
  const first = firstStationOf(hunkId)
  return Boolean(first && (first.line.id !== state.view.line || first.index !== state.view.index))
}

export function fixLine(own) {
  if (!own.fix || own.resolved) return null
  return { verdict: own.fix.verdict, label: FIX_LABELS[own.fix.verdict] || FIX_LABELS.unclear, note: own.fix.note || '' }
}

// Resolve or leave open. The AI's recommendation is the stronger button; a thread left open can get a reply.
export function threadActions(own) {
  if (own.resolved) return { resolved: true }
  if (!own.threadId) return null
  const call = threadCall(own)
  return {
    resolved: false,
    threadId: own.threadId,
    call,
    suggested: own.fix?.verdict === 'fixed' ? 'resolve' : own.fix?.verdict === 'not-fixed' ? 'open' : null,
    canResolve: own.canResolve !== false,
    reply: call === 'open' ? (state.reviewer.threadReplies[own.threadId] ?? '') : null,
    replyFromAi: Boolean(own.fix?.reply),
  }
}

// The first entry is the comment itself; the rest are replies.
export function conversation(comment) {
  return [{ author: comment.author || viewerLogin(), body: comment.body }, ...(comment.replies || [])]
}

export function isCopied(comment) {
  return state.reviewer.remarks.some((remark) => remark.copiedFrom === comment.id) || (state.reviewer.copiedToSummary || []).includes(comment.id)
}

export function threadPlace(item) { return `${item.path || hunkById(item.hunkId)?.file || ''}${item.line ? ` ${lineLabel(item)}` : ''}` }

// The key of the remark form's draft text in state.ui.drafts.
export function composerKey(composer) { return `remark:${composer.hunkId}:${composer.startLine}:${composer.line}:${composer.side}` }

export function composerSeverity(composer) { return composer.severity || severities()[1] || severities()[0] }

// The questions about a hunk, each with the agent's answer or null while the agent works on it.
export function askQuestions(hunk) {
  return sentEvents('ask', hunk.id).map((asked) => ({ asked, answer: answerFor(asked.id) || null }))
}

export function flowFindingsPill(line) {
  const hunks = new Set(line.stops.map((stop) => stop.hunkId))
  const open = state.review.findings.filter((finding) => hunks.has(finding.hunkId) && decisionOf(finding) === 'open')
  return open.length ? { tone: severityTone(worstOf(open).severity), text: plural(open.length, 'finding') } : null
}

export function criteriaStatus() {
  const criteria = ticketCriteria()
  const notMet = criteria.filter((criterion) => criterion.verdict === 'not-met').length
  const open = criteria.filter((criterion) => !['met', 'not-met'].includes(criterion.verdict)).length
  if (!criteria.length) return { tone: 'quiet', icon: 'none', label: 'No acceptance criteria' }
  if (notMet) return { tone: 'bad', icon: 'bad', label: `${notMet} of ${plural(criteria.length, 'criterion', 'criteria')} not met` }
  if (open) return { tone: 'warn', icon: 'warn', label: `${plural(open, 'criterion', 'criteria')} unclear or not checked` }
  return { tone: 'ok', icon: 'ok', label: `All ${plural(criteria.length, 'criterion', 'criteria')} met` }
}

export function findingsStatus() {
  const open = liveFindings().filter((finding) => decisionOf(finding) === 'open')
  if (!liveFindings().length) return { tone: 'ok', icon: 'ok', label: 'No AI findings', open }
  if (!open.length) return { tone: 'ok', icon: 'ok', label: 'All AI findings decided', open }
  return { tone: severityTone(worstOf(open).severity), icon: 'finding', label: plural(open.length, 'open AI finding'), open }
}

// The findings on the whole PR, the count on hunks and the open findings per severity, worst first.
export function findingsPanel() {
  const status = findingsStatus()
  const whole = liveFindings().filter((finding) => finding.hunkId === null)
  const bySeverity = [...severities()].reverse().map((severity) => ({ severity, count: status.open.filter((finding) => finding.severity === severity).length })).filter(({ count }) => count)
  return { status, whole, onHunks: liveFindings().length - whole.length, bySeverity }
}

// The data of the overview page.
export function home() {
  const review = state.review
  const context = review.context
  const total = review.hunks.length
  const seen = total - unseenHunks().length
  const verdicts = Object.values(state.reviewer.hunkVerdicts)
  const count = (verdict) => verdicts.filter((value) => value === verdict).length
  const items = acceptedItems()
  const onGitHub = items.filter((item) => ['posted', 'draft'].includes(githubStatus(item.id, item.body))).length
  const proposal = VERDICTS.find((option) => option.id === (state.reviewer.verdict || proposedVerdict()))
  const general = openReviewComments().filter((comment) => !comment.hunkId || !hunkById(comment.hunkId))
  const skipped = context.skipped || []
  const relatedCounts = [
    (context.tickets || []).length && plural(context.tickets.length, 'ticket'),
    (context.linkedPrs || []).length && plural(context.linkedPrs.length, 'linked pull request'),
  ].filter(Boolean)
  const criteria = criteriaStatus()
  const findings = findingsStatus()
  const glance = [
    { target: 'home-criteria', tone: criteria.tone, icon: criteria.icon, text: criteria.label },
    liveFindings().length && { target: 'home-findings', tone: findings.tone, icon: findings.icon, text: findings.label },
    general.length && { target: 'home-comments', tone: 'warn', icon: 'comment', text: `${plural(general.length, 'open comment')} outside the diff` },
    skipped.length && { target: 'home-skipped', tone: 'warn', icon: 'notRead', text: `${skipped.length} not read by the AI` },
    { target: 'home-progress', tone: seen === total ? 'ok' : 'info', icon: 'progress', text: `${seen} of ${plural(total, 'hunk')} seen` },
  ].filter(Boolean)
  const proposalTone = { APPROVE: 'ok', REQUEST_CHANGES: 'bad', COMMENT: 'info' }[proposal?.id] || 'quiet'
  return { total, seen, verdictCounts: { approved: count('approved'), changes: count('changes'), comment: count('comment') }, items, onGitHub, proposal, proposalTone, general, skipped, relatedCounts, glance }
}

// Criteria that are not met stay in view; met ones fold away.
export function criteriaPanel() {
  const criteria = ticketCriteria()
  return {
    status: criteriaStatus(),
    met: criteria.filter((criterion) => criterion.verdict === 'met'),
    rest: criteria.filter((criterion) => criterion.verdict !== 'met'),
    reason: criteria.length ? '' : state.review.context.tickets?.length ? 'The linked tickets list no acceptance criteria, and the agent could not take any from their descriptions.' : 'No ticket is linked, so there are no acceptance criteria to check.',
  }
}

// Where the agent took a criterion from, or null when the data does not say.
export function criterionSource(criterion) {
  if (criterion.source === 'description') return { kind: 'description', label: 'inferred from the description', title: 'The ticket lists no acceptance criteria; the agent took this from its description' }
  if (criterion.source === 'ticket') return { kind: 'ticket', label: 'acceptance criterion', title: '' }
  return null
}

// The flows that cover a criterion.
export function criterionFlows(criterion) { return state.lines.filter((line) => line.acceptanceCriteria.includes(criterion.id)) }

// The criteria of one flow, with their text and verdict.
export function flowCriteria(line) {
  return line.acceptanceCriteria.map((id) => ({ id, criterion: criterionById(id) })).filter(({ criterion }) => criterion)
}

export function criteriaCheck() {
  const criteria = ticketCriteria()
  if (!criteria.length) return { done: true, counts: 'none in the linked tickets', criteria }
  const counts = Object.entries(AC_VERDICTS).map(([id, label]) => [criteria.filter((criterion) => criterion.verdict === id).length, label.toLowerCase()]).filter(([count]) => count).map(([count, label]) => `${count} ${label}`)
  return { done: criteria.every((criterion) => criterion.verdict === 'met'), counts: [criteria.length, ...counts].join(' · '), criteria }
}

// The findings on hunks that the reviewer left open. They are not posted, and leaving them open is a valid call.
export function notPostedFindings() {
  const open = state.review.findings.filter((finding) => finding.hunkId !== null && decisionOf(finding) === 'open')
  if (!open.length) return null
  const counts = [...severities()].reverse()
    .map((severity) => ({ severity, count: open.filter((finding) => findingSeverity(finding) === severity).length }))
    .filter(({ count }) => count)
  const hunks = [...new Set(open.map((finding) => finding.hunkId))].map(hunkById).filter(Boolean)
  return { counts: `${open.length}: ${counts.map(({ severity, count }) => `${count} ${severity}`).join(', ')}`, open, hunks }
}

export function hunkVerdictsCheck() {
  const verdicts = state.reviewer.hunkVerdicts
  const without = hunksWithoutVerdict()
  return {
    done: without.length === 0,
    approved: state.review.hunks.filter((hunk) => verdicts[hunk.id] === 'approved').length,
    changes: state.review.hunks.filter((hunk) => verdicts[hunk.id] === 'changes'),
    comments: state.review.hunks.filter((hunk) => verdicts[hunk.id] === 'comment').length,
    without,
  }
}

// The data of Submit review. When `posted` is set, the page shows the posted review instead of the form.
export function terminus() {
  const review = state.review
  const unseen = unseenHunks()
  const proposal = proposedVerdict()
  const verdict = state.reviewer.verdict || proposal
  const post = buildPost('final').event
  const general = review.findings.filter((finding) => finding.hunkId === null)
  const flows = state.lines.filter((line) => !line.id.startsWith('__'))
  return {
    posted: postedReview(),
    finishing: isFinishing(),
    // On a merged or closed PR the banner above says what Finish does instead.
    prOpen: !['merged', 'closed'].includes(review.remote?.state),
    unseen,
    proposal,
    verdict,
    finalVerdict: VERDICTS.find((option) => option.id === verdict),
    unseenWarning: (verdict === 'APPROVE' || verdict === 'REQUEST_CHANGES') && unseen.length ? `You have not seen ${unseen.length} of ${plural(review.hunks.length, 'hunk')}.` : '',
    post,
    posts: `${post.body ? 'the review body and ' : ''}${plural(post.comments.length, 'comment')}`,
    general,
    openGeneral: general.filter((finding) => decisionOf(finding) === 'open').length,
    openFindings: review.findings.filter((finding) => decisionOf(finding) === 'open'),
    outdated: outdatedRemarks(),
    flows,
    flowsDone: flows.filter((line) => line.stops.every((stop) => isSeen(stop.hunkId))).length,
    unseenByFlow: state.lines
      .map((line) => ({ line, open: line.stops.map((stop, index) => ({ stop, index })).filter(({ stop }) => !isSeen(stop.hunkId)) }))
      .filter(({ open }) => open.length),
  }
}

export function postedCard(sent) {
  return {
    option: postedVerdict(sent),
    url: postFor(sent.id)?.url,
    at: sent.at,
    counts: sent.payload ? `${sent.payload.body ? 'Review body and ' : ''}${plural(sent.payload.comments.length, 'comment')}` : plural((sent.contents || []).length, 'item'),
  }
}

// A draft is a pending review on GitHub: the form stays, with a line that says the draft is there.
export function draftLine() {
  const last = sentEvents('post').at(-1)
  const result = last && postFor(last.id)
  if (!last || last.kind !== 'draft' || result?.status !== 'posted') return null
  return { at: last.at, url: result.url }
}

export function summaryTools() {
  const asked = sentEvents('summarize').at(-1)
  return { draft: pendingSummaryDraft(), waiting: Boolean(asked && !answerFor(asked.id)), count: acceptedItems().length }
}

// The result of one post: pending, posted or the status GitHub gave.
export function postResult({ id, kind, at }) {
  const result = postFor(id)
  const noun = POST_NOUNS[kind]
  if (!result) return { status: 'pending', text: `Posting the ${noun}…` }
  if (result.status !== 'posted') return { status: result.status, text: `GitHub refused the ${noun}: ${result.message}` }
  return { status: 'posted', url: result.url, text: `${noun[0].toUpperCase() + noun.slice(1)} posted${at ? ` at ${timeLabel(at)}` : ''}.` }
}

// Updates show under the review they update, not here.
export function sentPosts() {
  return sentEvents('post').filter((sent) => sent.kind !== 'update').reverse()
}

export function updateStatus() {
  const last = sentEvents('post').filter((sent) => sent.kind === 'update').at(-1)
  return last ? postResult(last) : null
}

export function threadCallCounts() {
  const threads = openOwnThreads()
  const count = (call) => threads.filter((own) => threadCall(own) === call).length
  const left = threadsWithoutCall().length
  return `${count('resolve')} to resolve · ${count('open')} left open${left ? ` · ${left} without a call` : ''}`
}

// Below the reviewer's newest review: the call on each open comment becomes an update of that review.
// A review that requests changes always gets the footer, so the reviewer can approve on top of it.
// `verdicts` lists the update buttons in order; it is empty while comments wait for a call.
export function updateFooter(review) {
  const threads = openOwnThreads()
  const requested = review.state === 'CHANGES_REQUESTED'
  if (!threads.length && !requested && !sentEvents('post').some((sent) => sent.kind === 'update')) return null
  const left = threadsWithoutCall().length
  const open = threads.filter((own) => threadCall(own) === 'open').length
  return {
    form: threads.length > 0 || requested,
    left,
    open,
    verdicts: left ? [] : open ? ['REQUEST_CHANGES', 'APPROVE', 'COMMENT'] : ['APPROVE', 'COMMENT'],
    intro: threads.length ? `${threadCallCounts()}. Replies and resolved comments go to GitHub with the update.` : 'Your review requests changes. Approving now replaces that as your verdict.',
    status: updateStatus(),
  }
}

// The reviews on GitHub, newest first, split into the reviewer's own and those of others.
export function existingReviews() {
  const reviews = [...(state.review.reviews || [])].sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
  return { reviews, mine: reviews.filter((review) => review.author === viewerLogin()), others: reviews.filter((review) => review.author !== viewerLogin()) }
}

// The reviewer's newest review is their current one: it holds the update. Their older ones and approvals are closed.
export function reviewCard(review, current) {
  const mine = review.author === viewerLogin()
  const comments = mine ? postedOwnRemarks().filter((own) => own.reviewId === review.id) : (state.review.reviewComments || []).filter((comment) => comment.reviewId === review.id)
  const toCheck = mine ? threadsToCheck().filter((own) => own.reviewId === review.id).length : 0
  const key = `review-${review.id}`
  return {
    kind: REVIEW_STATES[review.state] || REVIEW_STATES.COMMENTED,
    mine,
    comments,
    toCheck,
    key,
    // After an update, the comments still open sit in an older review; that review stays open so they are in reach.
    open: state.ui.terminusOpen?.[key] ?? (current || (mine ? toCheck > 0 : review.state !== 'APPROVED')),
    footer: current ? updateFooter(review) : null,
  }
}
