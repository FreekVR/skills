// The data parts of the old page's render functions. The view draws them; icon names here are names, not icons:
// verdict icons (approved, changes, comment, undecided) and status icons (ok, bad, warn, finding, none, coverage, notRead, progress, link).
import { state, VERDICTS, FIX_LABELS, REVIEW_STATES, AC_VERDICTS, POST_NOUNS } from './state.js'
import { acceptedItems, criterionById, isCurrentReview, decisionOf, findingSeverity, hunkById, isSeen, liveFindings, openReviewComments, outdatedRemarks, plural, resumeHelp, severities, severityRank, severityTone, ticketCriteria, timeLabel, unseenHunks, viewerLogin, worstOf } from './review.js'
import { answerFor, buildPost, githubStatus, isFinishing, newComments, pendingReplies, postFor, postedOwnRemarks, postedReview, postedVerdict, proposedVerdict, sentEvents, threadCall, threadsToCheck, threadsToUnresolve, threadsWithoutCall, doubtfulResolved, resolvedByOthers, threadsNeedingCall, hunksWithoutVerdict, pendingSummaryDraft } from './posting.js'
import { diffRows, lineLabel } from './diff.js'

// A merged or closed PR whose review was quiet this many days folds away in the sessions list.
const QUIET_DAYS = 14

// Get the reviews of the sessions list by repository: the group of this page first, then by their newest review.
// In a group the newest review comes first; merged and closed ones that were quiet for QUIET_DAYS go in `older`.
export function sessionGroups() {
  const groups = new Map()
  const now = Date.now()
  const newestFirst = [...(state.reviews || [])].sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || '') || b.number - a.number)
  for (const review of newestFirst) {
    const repo = `${review.owner}/${review.repo}`
    if (!groups.has(repo)) groups.set(repo, { repo, recent: [], older: [] })
    const quiet = review.state !== 'open' && !isCurrentReview(review) && now - Date.parse(review.lastActivity) > QUIET_DAYS * 24 * 3600 * 1000
    groups.get(repo)[quiet ? 'older' : 'recent'].push(review)
  }
  return [...groups.values()].sort((a, b) => Number(b.recent.some(isCurrentReview)) - Number(a.recent.some(isCurrentReview)))
}

// Each kind of change on GitHub comes with the one action that deals with it.
// `key` changes when the banner says something new, so the view can announce it once.
export function updates() {
  const remote = state.review.remote || {}
  const banners = []
  const current = (state.reviews || []).find(isCurrentReview)
  if (state.offline) {
    const { owner, repo, number } = state.review.pr
    banners.push({ kind: 'offline', key: 'offline', resume: resumeHelp(current || { owner, repo, number }) })
  }
  if (state.agent?.paused) banners.push({ kind: 'paused', key: 'paused' })
  if (state.agent?.preparing) banners.push({ kind: 'preparing', key: 'preparing', step: state.agent.preparing.step })
  if (remote.state === 'merged' || remote.state === 'closed') {
    banners.push({ kind: 'state', key: `state-${remote.state}`, state: remote.state, finishing: isFinishing() })
  }
  // One banner about new commits at a time: loading, then the result of the last load, else an offer to load them.
  const load = refreshState()
  const shown = load && state.reviewer.closedRefresh !== load.eventId
  const newer = remote.headSha && remote.headSha !== state.review.pr.headSha
  const loading = load?.status === 'loading'
  if (shown && !loading && (load.status === 'error' || !newer)) banners.push({ kind: 'refreshed', key: `refreshed-${load.eventId}`, ...load })
  else if (loading || newer) banners.push({ kind: 'head', key: 'head', updating: loading, canStartRound: Boolean(postedReview()) })
  if (remote.error) banners.push({ kind: 'remote-error', key: `remote-error-${remote.error}`, message: remote.error })
  const fresh = newComments()
  if (fresh.length) {
    banners.push({ kind: 'comments', key: `comments-${fresh.length}`, count: fresh.length, authors: [...new Set(fresh.map((comment) => comment.author))] })
  }
  return banners
}

// The last request to load new commits and what came of it: loading until the agent writes a result to `refreshes`.
// Without a result, it only counts as loading while GitHub still has newer commits, so a refresh from before the page
// read results, or one the agent never answered, does not keep the banner on.
export function refreshState() {
  const sent = sentEvents('refresh').at(-1)
  if (!sent) return null
  const result = (state.review.refreshes || []).find((candidate) => candidate.eventId === sent.id)
  const newer = state.review.remote?.headSha && state.review.remote.headSha !== state.review.pr.headSha
  if (!result) return newer ? { status: 'loading', eventId: sent.id } : null
  // A changed hunk gets a new ID, so its old ID counts as gone too; removed hunks only count when nothing is new.
  const { added = 0, gone = 0 } = state.reviewer.hunkChanges || {}
  const counts = added ? `${plural(added, 'hunk')} new or changed` : gone ? `${plural(gone, 'hunk')} removed` : 'No hunk changed'
  // Home shows the summary in a panel of its own.
  return { ...result, counts, summary: state.view.kind === 'home' ? '' : changesSince()?.summary || '' }
}

// What changed since the reviewer's last review, while the page shows the commit the summary is about.
export function changesSince() {
  const changes = state.review.changesSince
  return changes?.summary && changes.to === state.review.pr.headSha ? changes : null
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

// The reviewer saw the hunk in view first in another flow.
export function seenBefore(hunkId) {
  const where = state.reviewer.seenIn[hunkId]
  return Boolean(where && where !== state.view.line)
}

// A resolved comment only has a current check when someone else resolved it.
export function fixLine(own) {
  if (!own.fix || (own.resolved && !resolvedByOthers(own))) return null
  return { verdict: own.fix.verdict, label: FIX_LABELS[own.fix.verdict] || FIX_LABELS.unclear, note: own.fix.note || '' }
}

// Resolve or leave open. The AI's recommendation is the stronger button; a thread left open can get a reply.
// A resolved thread, of the reviewer or of someone else, can only be unresolved, and then gets a reply.
// When the AI doubts a fix of the reviewer's comment that someone else resolved, the reviewer can also keep it resolved.
export function threadActions(own) {
  if (!own.threadId) return null
  const call = threadCall(own)
  if (own.resolved) {
    const doubtful = doubtfulResolved(own)
    const calls = [...(own.canUnresolve !== false ? ['unresolve'] : []), ...(doubtful ? ['keep'] : [])]
    return { resolved: true, threadId: own.threadId, call, calls, suggested: doubtful && own.fix.verdict === 'not-fixed' ? 'unresolve' : null, canReply: call === 'unresolve' }
  }
  return {
    resolved: false,
    threadId: own.threadId,
    call,
    suggested: own.fix?.verdict === 'fixed' ? 'resolve' : own.fix?.verdict === 'not-fixed' ? 'open' : null,
    calls: own.canResolve !== false ? ['resolve', 'open'] : ['open'],
    canReply: true,
  }
}

// The first entry is the comment itself; the rest are replies.
export function conversation(comment) {
  return [{ author: comment.author || viewerLogin(), body: comment.body }, ...(comment.replies || [])]
}

export function isCopied(comment) {
  return state.reviewer.remarks.some((remark) => remark.copiedFrom === comment.id) || (state.reviewer.copiedToSummary || []).includes(comment.id)
}

// Whose thread it is and where, for the preview of what a post sends. The reviewer's own threads have no author.
export function threadLabel(threadId) {
  const thread = [...(state.review.ownRemarks || []), ...(state.review.reviewComments || [])].find((candidate) => candidate.threadId === threadId)
  if (!thread) return 'a thread'
  return `${thread.author ? `@${thread.author}'s comment` : 'your comment'} on ${threadPlace(thread)}`
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
  const open = criteria.filter((criterion) => !['met', 'not-met', 'elsewhere'].includes(criterion.verdict)).length
  const elsewhere = criteria.some((criterion) => criterion.verdict === 'elsewhere')
  if (!criteria.length) return { tone: 'quiet', icon: 'none', label: 'No acceptance criteria' }
  if (notMet) return { tone: 'bad', icon: 'bad', label: `${notMet} of ${plural(criteria.length, 'criterion', 'criteria')} not met`, count: `${notMet}/${criteria.length}` }
  if (open) return { tone: 'warn', icon: 'warn', label: `${plural(open, 'criterion', 'criteria')} unclear or not checked`, count: String(open) }
  return { tone: 'ok', icon: 'ok', label: `All ${plural(criteria.length, 'criterion', 'criteria')} met${elsewhere ? ' in the stack' : ''}`, count: String(criteria.length) }
}

// The badge colour of each criterion verdict, in the criteria rows and in a flow's criteria.
export const AC_VERDICT_COLORS = { 'met': 'success', 'not-met': 'error', 'unclear': 'warning', 'elsewhere': 'info' }

// A criterion that another PR of the stack meets names that PR.
export function criterionVerdictLabel(criterion) {
  if (criterion.verdict === 'elsewhere' && criterion.pr) return `In #${criterion.pr}`
  return AC_VERDICTS[criterion.verdict || ''] || 'Not checked'
}

export function findingsStatus() {
  const open = liveFindings().filter((finding) => decisionOf(finding) === 'open')
  if (!liveFindings().length) return { tone: 'ok', icon: 'ok', label: 'No AI findings', open }
  if (!open.length) return { tone: 'ok', icon: 'ok', label: 'All AI findings decided', open, count: String(liveFindings().length) }
  return { tone: severityTone(worstOf(open).severity), icon: 'finding', label: plural(open.length, 'open AI finding'), open, count: `${open.length}/${liveFindings().length}` }
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
    { target: 'home-criteria', tone: criteria.tone, icon: criteria.icon, text: criteria.label, count: criteria.count },
    liveFindings().length && { target: 'home-findings', tone: findings.tone, icon: findings.icon, text: findings.label, count: findings.count },
    general.length && { target: 'home-comments', tone: 'warn', icon: 'comment', text: `${plural(general.length, 'open comment')} outside the diff`, count: String(general.length) },
    skipped.length && { target: 'home-skipped', tone: 'warn', icon: 'notRead', text: `${skipped.length} not read by the AI`, count: String(skipped.length) },
    { target: 'home-progress', tone: seen === total ? 'ok' : 'info', icon: 'progress', text: `${seen} of ${plural(total, 'hunk')} seen`, count: `${seen}/${total}` },
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
  const counts = Object.entries(AC_VERDICTS).map(([id, label]) => [criteria.filter((criterion) => criterion.verdict === id).length, label[0].toLowerCase() + label.slice(1)]).filter(([count]) => count).map(([count, label]) => `${count} ${label}`)
  return { done: criteria.every((criterion) => ['met', 'elsewhere'].includes(criterion.verdict)), counts: [criteria.length, ...counts].join(' · '), criteria }
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
    posts: [post.body ? 'the review body' : '', plural(post.comments.length, 'comment'), post.replies.length ? plural(post.replies.length, 'reply', 'replies') : '', post.resolve.length ? `${plural(post.resolve.length, 'thread')} to resolve` : ''].filter(Boolean).join(', '),
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

// Posts of kind `update` came from an older version of the page and carry no comments; GitHub lists them as reviews.
export function sentPosts() {
  return sentEvents('post').filter((sent) => sent.kind !== 'update').reverse()
}

export function threadCallCounts() {
  const threads = threadsNeedingCall()
  const count = (call) => threads.filter((own) => threadCall(own) === call).length
  const left = threadsWithoutCall().length
  const unresolve = threadsToUnresolve().length
  return `${count('resolve')} to resolve · ${count('open')} left open${unresolve ? ` · ${unresolve} to unresolve` : ''}${count('keep') ? ` · ${count('keep')} kept resolved` : ''}${left ? ` · ${left} without a decision` : ''}`
}

// Under the reviewer's newest review: their decisions and replies wait for the next review they post.
function hasPendingThreadWork() { return threadsNeedingCall().length > 0 || pendingReplies().length > 0 }

// Which commit a review on GitHub was made on, compared with the commit this page shows.
export function commitWhere(sha) {
  if (!sha) return null
  return sha === state.review.pr.headSha ? 'the commit on this page' : sha === state.review.remote?.headSha ? 'a newer commit than this page' : 'an older commit'
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
    commitWhere: commitWhere(review.commitId),
    key,
    // After an update, the comments still open sit in an older review; that review stays open so they are in reach.
    open: state.ui.terminusOpen?.[key] ?? (current || (mine ? toCheck > 0 : review.state !== 'APPROVED')),
    pending: current && hasPendingThreadWork(),
  }
}
