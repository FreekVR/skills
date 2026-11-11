// The data parts of the old page's render functions. The view draws them; icon names here are names, not icons:
// verdict icons (approved, changes, comment, undecided) and status icons (ok, bad, warn, finding, none, coverage, notRead, progress, link).
import { state, VERDICTS, FIX_LABELS, REVIEW_STATES, AC_VERDICTS, POST_NOUNS } from './state.js'
import { acceptedItems, commentsOutsideDiff, criterionById, isCurrentReview, decisionOf, findingSeverity, hunkById, isSeen, liveFindings, outdatedFindings, outdatedRemarks, plural, resumeHelp, severities, severityLevel, severityRank, severityTone, stationCode, stationsOf, ticketCriteria, timeLabel, unseenHunks, viewerLogin, worstOf } from './review.js'
import { agentState, answerFor, buildPost, isFinishing, missingComments, newComments, pendingReplies, postFor, postedOwnRemarks, postedReview, postedVerdict, proposedVerdict, sentEvents, threadCall, threadsToCheck, threadsToUnresolve, threadsWithoutCall, doubtfulResolved, threadsNeedingCall, hunksWithoutVerdict, pendingSummaryDraft } from './posting.js'
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
  if (state.otherTabs.size) banners.push({ kind: 'tabs', key: 'tabs' })
  if (state.agent?.preparing) banners.push({ kind: 'preparing', key: 'preparing', step: state.agent.preparing.step })
  else if (state.openCheckSince && !state.offline && !remote.error) banners.push({ kind: 'checking', key: 'checking' })
  if (remote.state === 'merged' || remote.state === 'closed') {
    banners.push({ kind: 'state', key: `state-${remote.state}`, state: remote.state, finishing: isFinishing() })
  }
  // One banner about new commits at a time: loading, then the result of the last load, else an offer to load them.
  const load = refreshState()
  const shown = load && state.reviewer.closedRefresh !== load.eventId
  const newer = newerOnGitHub()
  const loading = load?.status === 'loading'
  if (shown && !loading && (load.status === 'error' || !newer)) banners.push({ kind: 'refreshed', key: `refreshed-${load.eventId}`, ...load })
  else if (newer) banners.push({ kind: 'head', key: 'head', updating: loading, canStartRound: Boolean(postedReview()) })
  if (remote.error) banners.push({ kind: 'remote-error', key: `remote-error-${remote.error}`, message: remote.error })
  const missing = missingComments()
  if (missing.length) banners.push({ kind: 'missing-comments', key: `missing-comments-${missing.length}`, count: missing.length })
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
  const newer = newerOnGitHub()
  if (!result) return newer || headUnchecked() ? { status: 'loading', eventId: sent.id } : null
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
  const findings = liveFindings().filter((finding) => finding.hunkId === hunk.id)
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

// A resolved comment and a posted comment of the reviewer always get a take, so a missing one shows as not checked.
export function fixLine(own) {
  if (own.fix) return { verdict: own.fix.verdict, label: FIX_LABELS[own.fix.verdict] || FIX_LABELS.unclear, note: own.fix.note || '' }
  return own.resolved || own.state === 'posted' ? { verdict: 'unchecked', label: 'not checked', note: '' } : null
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
    return { resolved: true, threadId: own.threadId, call, calls, suggested: doubtful && own.fix.verdict === 'not-fixed' ? 'unresolve' : null, canReply: true }
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
  return [{ author: comment.author || viewerLogin(), body: comment.body, at: comment.at }, ...(comment.replies || [])]
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
  const open = liveFindings().filter((finding) => hunks.has(finding.hunkId) && decisionOf(finding) === 'open')
  return open.length ? { tone: severityTone(worstOf(open).severity), text: plural(open.length, 'finding') } : null
}

export function criteriaStatus() {
  const criteria = ticketCriteria()
  const notMet = criteria.filter((criterion) => criterion.verdict === 'not-met').length
  const open = criteria.filter((criterion) => !['met', 'not-met', 'elsewhere'].includes(criterion.verdict)).length
  const elsewhere = criteria.some((criterion) => criterion.verdict === 'elsewhere')
  if (!criteria.length) return { tone: 'quiet', icon: 'none', label: 'No acceptance criteria' }
  if (notMet) return { tone: 'bad', icon: 'bad', label: `${notMet} of ${plural(criteria.length, 'criterion', 'criteria')} not met` }
  if (open) return { tone: 'warn', icon: 'warn', label: `${plural(open, 'criterion', 'criteria')} unclear or not checked` }
  return { tone: 'ok', icon: 'ok', label: `All ${plural(criteria.length, 'criterion', 'criteria')} met${elsewhere ? ' in the stack' : ''}` }
}

// The badge colour of each criterion verdict, in the criteria rows and in a flow's criteria.
export const AC_VERDICT_COLORS = { 'met': 'success', 'not-met': 'error', 'unclear': 'warning', 'elsewhere': 'info' }

// A criterion that another PR of the stack meets names that PR.
export function criterionVerdictLabel(criterion) {
  if (criterion.verdict === 'elsewhere' && criterion.pr) return `In #${criterion.pr}`
  return AC_VERDICTS[criterion.verdict || ''] || 'Not checked'
}

// The findings on the whole PR, the count on hunks and the open findings per severity, worst first.
export function findingsPanel() {
  const open = liveFindings().filter((finding) => decisionOf(finding) === 'open')
  const whole = liveFindings().filter((finding) => finding.hunkId === null)
  const bySeverity = [...severities()].reverse().map((severity) => ({ severity, count: open.filter((finding) => finding.severity === severity).length })).filter(({ count }) => count)
  return { whole, onHunks: liveFindings().length - whole.length, bySeverity }
}

// The data of the overview page.
export function home() {
  const review = state.review
  const context = review.context
  const total = review.hunks.length
  const seen = total - unseenHunks().length
  const items = acceptedItems()
  // Every comment outside the diff shows on Home, resolved ones too; only open ones need attention.
  const general = commentsOutsideDiff()
  const skipped = context.skipped || []
  return { total, seen, items, general, skipped }
}

// The checks on Home. `attention` holds what the reviewer must look at, worst first; `level` is the severity level (0 to 3)
// of its worst item, so the check takes the colour of a note with that severity, or null when nothing in it has a severity.
// An unmet criterion counts as the worst severity. `quiet` holds the checks that need no action.
export function homeChecks() {
  const attention = []
  const quiet = []
  const criteria = ticketCriteria()
  const status = criteriaStatus()
  const notMet = criteria.filter((criterion) => criterion.verdict === 'not-met')
  const unclear = criteria.filter((criterion) => !['met', 'not-met', 'elsewhere'].includes(criterion.verdict))
  const criterionLine = (criterion) => `${criterion.id} ${criterion.text}${criterion.note ? ` ${criterion.note}` : ''}`
  if (notMet.length) attention.push({ id: 'criteria', level: 3, severity: severities().at(-1), icon: 'bad', title: `${notMet.length} of ${plural(criteria.length, 'acceptance criterion', 'acceptance criteria')} not met`, line: criterionLine(notMet[0]) })
  // An unclear criterion takes the middle severity of the repository's conventions.
  else if (unclear.length) attention.push({ id: 'criteria', level: severityLevel(severities()[Math.floor((severities().length - 1) / 2)]), severity: severities()[Math.floor((severities().length - 1) / 2)], icon: 'warn', title: `${plural(unclear.length, 'acceptance criterion', 'acceptance criteria')} unclear or not checked`, line: criterionLine(unclear[0]) })
  else quiet.push({ id: 'criteria', tone: criteria.length ? 'ok' : 'quiet', title: status.label })

  const open = liveFindings().filter((finding) => decisionOf(finding) === 'open')
  if (open.length) {
    const worst = worstOf(open)
    const station = worst.hunkId ? stationsOf(worst.hunkId)[0] : null
    const where = station ? stationCode(station.line, station.index) : 'the whole PR'
    attention.push({ id: 'findings', level: severityLevel(findingSeverity(worst)), severity: findingSeverity(worst), icon: 'finding', title: plural(open.length, 'open AI finding'), line: `Worst: ${worst.title} (${where}, ${findingSeverity(worst)})` })
  } else if (liveFindings().length) quiet.push({ id: 'findings', tone: 'ok', title: 'All AI findings decided' })

  const own = threadsNeedingCall()
  if (own.length) {
    const first = own[0]
    const take = fixLine(first)
    const worstOwn = own.map((remark) => remark.severity || severities()[0]).reduce((worst, severity) => (severityRank(severity) > severityRank(worst) ? severity : worst))
    attention.push({ id: 'own', level: severityLevel(worstOwn), severity: worstOwn, icon: 'comment', title: `${plural(own.length, 'earlier comment')} of yours to decide`, line: `${first.path}${first.line ? ` line ${first.line}` : ''}${take ? `: AI says ${take.label}` : ''}` })
  }

  const general = commentsOutsideDiff().filter((comment) => !comment.resolved)
  if (general.length) attention.push({ id: 'comments', level: null, severity: null, icon: 'comment', title: `${plural(general.length, 'open comment')} by others outside the diff`, line: `@${general[0].author}${general[0].path ? ` on ${general[0].path}` : ''}: ${general[0].body.split('\n')[0]}` })
  // Resolved ones need no action, but stay in view: every comment on GitHub shows on the page.
  else {
    const resolved = commentsOutsideDiff().filter((comment) => comment.resolved)
    if (resolved.length) quiet.push({ id: 'comments', tone: 'quiet', title: `${plural(resolved.length, 'resolved comment')} by others outside the diff` })
  }

  const context = state.review.context
  if (context.coverage) quiet.push({ id: 'coverage', tone: 'quiet', title: `Coverage: ${context.coverage.summary}` })
  if (context.skipped?.length) quiet.push({ id: 'skipped', tone: 'quiet', title: `${context.skipped.length} not read by the AI` })
  attention.sort((a, b) => (b.level ?? -1) - (a.level ?? -1))
  return { attention, quiet }
}

// Whether GitHub has a newer head commit than the one on this page, as far as the agent's last check found.
export function newerOnGitHub() {
  const head = state.review.remote?.headSha
  return Boolean(head) && head !== state.review.pr.headSha
}

// Whether the agent has not taken the hunks of the page's head commit through its checks yet. A review from before
// `checkedSha` existed says nothing, so it never counts as unchecked.
export function headUnchecked() {
  const { checkedSha, pr } = state.review
  return Boolean(checkedSha) && checkedSha !== pr.headSha
}

// What changed since the reviewer last looked: the new or changed hunks, the open findings on them and the agent's summary.
// `sinceReview` is true when the summary starts at a commit the reviewer submitted a review on; without such a review it
// starts at the commit the page showed before, their last visit. `check` is `running` while the agent works on the
// head commit and `needed` when the head commit is not checked and nothing works on it. Null when nothing changed.
export function sinceLastTime() {
  const changes = changesSince()
  const fresh = [...state.freshHunks]
  // Without an agent nothing answers, so the reviewer gets the instruction to resume it.
  const working = () => agentState() !== 'none' && (Boolean(state.agent?.preparing || state.openCheckSince) || refreshState()?.status === 'loading')
  const check = headUnchecked() ? (working() ? 'running' : 'needed') : null
  if (!changes && !fresh.length && !check) return null
  const findings = liveFindings().filter((finding) => fresh.includes(finding.hunkId) && decisionOf(finding) === 'open')
  const sameCommit = (a, b) => Boolean(a && b) && (a.startsWith(b) || b.startsWith(a))
  const sinceReview = Boolean(changes) && (state.review.reviews || []).some((review) => review.author === viewerLogin() && sameCommit(review.commitId, changes.from))
  return { changes, fresh, findings, sinceReview, check }
}

// Criteria that are not met stay in view; met ones fold away.
export function criteriaPanel() {
  const criteria = ticketCriteria()
  return {
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
  const open = liveFindings().filter((finding) => finding.hunkId !== null && decisionOf(finding) === 'open')
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
  // Only what this review can include: a finding an earlier final review posted is on GitHub, in that review's body.
  const general = liveFindings().filter((finding) => finding.hunkId === null)
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
    openFindings: liveFindings().filter((finding) => decisionOf(finding) === 'open'),
    outdated: outdatedRemarks(),
    outdatedFindings: outdatedFindings(),
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
