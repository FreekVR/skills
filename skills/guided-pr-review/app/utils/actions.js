import { state, POLL_MS, CHECK_MS } from './state.js'
import { reviewPath, transport } from './api.js'
import { notify } from './notify.js'
import { acceptedItems, agentPr, decisionOf, emptyReviewer, firstStationOf, hunkById, isCurrentReview, isSeen, lines, noteFreshHunks, setReview, severities } from './review.js'
import { answerFor, applySummaryDraft, buildPost, ghCommand, importOwnReview, newComments, openOwnThreads, proposedVerdict, startNewRound, startRoundOnNewCommits } from './posting.js'
import { composerFor, diffRows, languageOf, firstChangedLine, lineLabel, rowIndexOf, rowLocation, rowMatches, wholeFileRows, wholeHunkComposer } from './diff.js'
import { go, goHome, goTerminus, markCurrentSeen, nextAfterVerdict, restorePosition } from './navigation.js'
import { composerKey } from './panels.js'
import { hasStack } from './stack.js'

let saveTimer = null
let pollTimer = null
let checkTimer = null
// A request still running when the page stops polling must not schedule the next one.
let polling = false
// Save the reviewer state soon. Changes that follow each other quickly are saved once.
export function saveReviewer() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveReviewerNow, 250)
}

// Save the reviewer state now, for example before the page goes to another review.
async function saveReviewerNow() {
  clearTimeout(saveTimer)
  try { await transport.saveReviewer(state.reviewer) }
  catch (error) { notify(`Your progress was not saved: ${error.message}. Keep this tab open and try again.`, true) }
}

// Keep a sent event in the reviewer state, so the page knows what it asked the agent.
function rememberSent(id, event, extra) {
  state.reviewer.sent.push({ id, type: event.type, hunkId: event.hunkId, question: event.question, kind: event.kind, ...extra })
}

// `lineId` is the flow the reviewer saw the hunk in first, so another flow can say they saw it there.
export function markSeen(hunkId, lineId) {
  if (!isSeen(hunkId)) {
    state.reviewer.seen.push(hunkId)
    state.reviewer.seenIn = { ...state.reviewer.seenIn, [hunkId]: lineId }
    state.seen.add(hunkId)
    state.freshHunks.delete(hunkId)
    state.reviewer.changedHunks = (state.reviewer.changedHunks || []).filter((id) => id !== hunkId)
    saveReviewer()
  }
}

// Send an event to the agent and keep it in the reviewer state. Returns the event ID, or null when it failed.
export async function sendEvent(event, extra = {}) {
  try {
    const { id } = await deliver(event)
    rememberSent(id, event, extra)
    saveReviewer()
    return id
  } catch (error) {
    notify(`The agent did not get this: ${error.message}`, true)
    return null
  }
}

// Every event names its pull request, so an agent never applies it to another review.
export function deliver(event) {
  const pr = state.review.pr
  return transport.sendEvent({ ...event, review: `${pr.owner}/${pr.repo}#${pr.number}` })
}

// The page cannot reach GitHub, so it asks the agent to look for new commits, comments and a changed PR state.
export function checkGitHub() {
  if (document.visibilityState === 'visible') deliver({ type: 'check' }).catch(() => {})
  if (polling) checkTimer = setTimeout(checkGitHub, CHECK_MS)
}

export async function loadReviews() {
  try {
    state.reviews = await transport.loadReviews()
  } catch {
    // Without the list the page works as before, only without the switch.
  }
}

// The stack switch is optional: when this call fails, the page keeps what it had. A PR in no stack sends no request.
export async function loadStack() {
  if (hasStack()) state.stackStatus = await transport.loadStack().catch(() => state.stackStatus)
}

// Ask the agent to prepare the review of another PR in the stack, and open the page of that PR.
// That page shows that the agent prepares the review until review.json is there.
export async function startReview(number) {
  let page
  try {
    const sent = await transport.startReview(number)
    rememberSent(sent.id, { type: 'start-review' }, { number })
    page = sent.page
  } catch (error) {
    return notify(`The agent did not get this: ${error.message}`, true)
  }
  // The sent start keeps a second start away when the reviewer comes back, so it is saved before the page goes.
  await saveReviewerNow()
  window.location.assign(page)
}

// Pause or play the agent of a review. Play sends one check, so the page catches up with GitHub.
export async function setPaused(review, paused) {
  try {
    await transport.setPaused(review, paused)
  } catch (error) {
    notify(`The agent did not get this: ${error.message}`, true)
    return
  }
  review.paused = paused
  if (!paused && state.review && isCurrentReview(review)) deliver({ type: 'check' }).catch(() => {})
}

// Delete a review from the sessions list. An error stays with the caller, which shows it next to the review.
export async function removeSession(review) {
  await transport.removeReview(review)
  state.reviews = state.reviews.filter((other) => other !== review)
}

// Resume the agent of the open review, or of the review the start came from while the agent prepares this one.
// The page's own flag and the switch's entry for this review both follow once the server accepts it.
export async function resumeAgent() {
  const { owner, repo, number } = agentPr()
  const entry = state.review && (state.reviews || []).find(isCurrentReview)
  const review = entry || { owner, repo, number, paused: true }
  await setPaused(review, false)
  if (!review.paused && state.agent) state.agent.paused = false
}

// Open or close the list of open reviews.
export function toggleSwitcher(open) {
  if (open === Boolean(state.ui.switcherOpen)) return
  state.ui.switcherOpen = open
  // Another review may have started or stopped since the list was read.
  if (open) loadReviews()
}

// Mark the new comments as known and open the first one.
export function showNewComments() {
  const first = newComments()[0]
  state.reviewer.knownComments = (state.review.reviewComments || []).map((comment) => comment.id)
  saveReviewer()
  const at = first?.hunkId ? firstStationOf(first.hunkId) : null
  return at ? go(at.line.id, at.index) : goHome()
}

// The reason the page cannot post this yet, shown to the reviewer, or null.
function postProblem(kind, event, contents) {
  if (kind === 'draft' && contents.length === 0) return 'There is nothing to put in a draft yet. Accept a finding, write a remark or a summary first.'
  if (kind === 'final' && event.verdict !== 'APPROVE' && !event.body) return 'Write a summary first. GitHub needs a review body for request changes and comment.'
  return null
}

// Post the review ('final') or a draft to GitHub, through the agent.
export async function post(kind) {
  const { event, contents } = buildPost(kind)
  const problem = postProblem(kind, event, contents)
  if (problem) return notify(problem, true)
  const payload = { body: event.body, comments: event.comments, verdict: event.verdict, replies: event.replies, resolve: event.resolve }
  const id = await sendEvent(event, { contents, at: new Date().toISOString(), headSha: state.review.pr.headSha, payload })
  if (!id) return
  // Sent replies are not sent again; a thread left open keeps its call until new commits start the next round.
  for (const reply of event.replies || []) state.reviewer.threadReplies[reply.threadId] = ''
  saveReviewer()
  notify(kind === 'final' ? 'The review is on its way to GitHub.' : 'The draft is on its way to GitHub.')
}

// Show the gh command that posts the final review and put it on the clipboard, for a static page that has no agent to post it.
export async function copyGhCommand() {
  const { event, contents } = buildPost('final')
  const problem = postProblem('final', event, contents)
  if (problem) return notify(problem, true)
  state.ui.ghCommand = ghCommand(event)
  try {
    await navigator.clipboard.writeText(state.ui.ghCommand)
    notify('The gh command is on your clipboard.')
  } catch {
    notify('The browser did not let the page use the clipboard. Copy the command below.', true)
  }
}

export function setTheme(choice) {
  state.reviewer.theme = choice
  saveReviewer()
}

// Resolve a posted comment of the reviewer, leave it open, unresolve a resolved thread, or keep it resolved. A thread left open starts with the AI's draft reply.
// A call of null takes the choice back, so the comment needs a decision again.
export function setThreadCall(threadId, call) {
  const own = openOwnThreads().find((candidate) => candidate.threadId === threadId)
  const { [threadId]: _previous, ...others } = state.reviewer.threadCalls
  state.reviewer.threadCalls = call ? { ...others, [threadId]: call } : others
  if (call === 'open' && state.reviewer.threadReplies[threadId] === undefined) state.reviewer.threadReplies[threadId] = own?.fix?.reply || ''
  saveReviewer()
}

// Accept, dismiss or reopen ('open') an AI finding.
export function decideFinding(id, decision) {
  if (decision === 'open') delete state.reviewer.decisions[id]
  else state.reviewer.decisions[id] = decision
  saveReviewer()
}

// Start editing the text of a finding or a remark.
export function startEdit(id) { state.ui.editing = id }

export function cancelEdit(id) {
  state.ui.editing = null
  delete state.ui.drafts[`edit:${id}`]
}

// Save the edited text of an AI finding. An empty text keeps the old one.
export function saveEdit(id, text) {
  const value = text.trim()
  if (value) state.reviewer.edits[id] = value
  state.ui.editing = null
  delete state.ui.drafts[`edit:${id}`]
  saveReviewer()
}

// Save an edited remark of the reviewer. An empty text keeps the old remark.
export function saveRemark(id, text, severity) {
  const remark = state.reviewer.remarks.find((candidate) => candidate.id === id)
  const body = text.trim()
  if (remark && body) {
    // A severity the reviewer changed is no longer the AI's.
    if (severity !== remark.severity) delete remark.severitySource
    Object.assign(remark, { body, severity })
  }
  state.ui.editing = null
  delete state.ui.drafts[`edit:${id}`]
  saveReviewer()
}

export function deleteRemark(id) {
  state.reviewer.remarks = state.reviewer.remarks.filter((remark) => remark.id !== id)
  saveReviewer()
}

// Open the remark form for a range of lines.
export function openComposer(composer) {
  state.ui.composer = composer
}

export function cancelRemark() { state.ui.composer = null }

// Open the remark form on one row. Mouse selection uses startRowDrag; this is for the keyboard.
export function remarkOnRow(hunkId, row) {
  return openComposer(composerFor(hunkById(hunkId), row, row))
}

// Open the remark form on all changed lines of a hunk.
export function remarkOnHunk(hunkId) {
  return openComposer(wholeHunkComposer(hunkById(hunkId)))
}

// Add the remark of the open remark form.
export function addRemark(text, severity) {
  const composer = state.ui.composer
  const body = text.trim()
  if (!body) return notify('Write the remark first.', true)
  state.reviewer.remarks.push({ id: crypto.randomUUID(), hunkId: composer.hunkId, startLine: composer.startLine, startSide: composer.startSide, line: composer.line, side: composer.side, severity, body, ...(composer.aiSuggested && { aiSuggested: true }), ...(composer.copiedFrom && { copiedFrom: composer.copiedFrom }) })
  delete state.ui.drafts[composerKey(composer)]
  state.ui.composer = null
  saveReviewer()
  if (composer.thenNext) return nextAfterVerdict()
}

// A press on a line number starts a selection. With shift, it extends the open remark form from its first line.
export function startRowDrag(hunkId, row, shiftKey) {
  const composer = state.ui.composer
  const anchor = shiftKey && composer && composer.hunkId === hunkId
    ? rowIndexOf(diffRows(hunkById(hunkId)), composer.startLine, composer.startSide)
    : row
  state.ui.drag = { hunkId, anchor, current: row }
}

export function moveRowDrag(row) {
  const drag = state.ui.drag
  if (!drag || row === drag.current) return
  drag.current = row
}

export function endRowDrag() {
  const drag = state.ui.drag
  if (!drag) return
  state.ui.drag = null
  openComposer(composerFor(hunkById(drag.hunkId), drag.anchor, drag.current))
}

// Turn the agent's answer to a question into a remark on the first changed line of its hunk.
export function answerToRemark(eventId) {
  const answer = answerFor(eventId)
  const hunk = answer && hunkById(answer.hunkId)
  if (!hunk) return
  const row = diffRows(hunk).find((candidate) => candidate.kind !== 'meta' && candidate.kind !== 'ctx') || diffRows(hunk)[0]
  const { side, line } = row ? rowLocation(row) : { side: 'RIGHT', line: null }
  return openComposer({ hunkId: hunk.id, startLine: line, startSide: side, line, side, text: answer.answer, aiSuggested: true })
}

// A colleague's comment becomes a remark of the reviewer on the same lines, or part of the review body when those lines are gone.
export function copyComment(comment) {
  const text = `> @${comment.author}: ${comment.body.replace(/\n/g, '\n> ')}\n\n`
  const hunk = comment.hunkId && hunkById(comment.hunkId)
  const at = hunk && comment.line && diffRows(hunk).some((row) => rowMatches(row, comment)) && firstStationOf(hunk.id)
  if (at) {
    go(at.line.id, at.index)
    // A copy starts at the lowest severity, so copying a question never raises the proposed verdict by itself.
    return openComposer({ hunkId: hunk.id, startLine: comment.startLine ?? comment.line, startSide: comment.startSide ?? comment.side, line: comment.line, side: comment.side, text, copiedFrom: comment.id, severity: severities()[0] })
  }
  state.reviewer.summary = [state.reviewer.summary.trim(), text.trim()].filter(Boolean).join('\n\n')
  state.reviewer.copiedToSummary = [...(state.reviewer.copiedToSummary || []), comment.id]
  saveReviewer()
  goTerminus()
  notify('Added to your review summary. Edit it there.')
}

// Ask the agent a question about a hunk.
export function askAgent(hunkId, question) {
  const text = question.trim()
  if (!text) return notify('Type a question first.', true)
  delete state.ui.drafts[`ask:${hunkId}`]
  return sendEvent({ type: 'ask', hunkId, question: text })
}

// Ask the agent for a longer explanation of a hunk.
export function explainMore(hunkId) {
  state.ui.openExplain.add(hunkId)
  return sendEvent({ type: 'explain', hunkId })
}

// Give a hunk the reviewer's verdict and go to the next hunk. A verdict other than approve needs a remark first.
export function setHunkVerdict(hunkId, verdict) {
  state.reviewer.hunkVerdicts[hunkId] = verdict
  state.ui.stamp = hunkId
  saveReviewer()
  const hasRemark = state.reviewer.remarks.some((remark) => remark.hunkId === hunkId) || state.review.findings.some((finding) => finding.hunkId === hunkId && decisionOf(finding) === 'accepted')
  if (verdict !== 'approved' && !hasRemark) {
    const composer = wholeHunkComposer(hunkById(hunkId))
    if (!composer) return nextAfterVerdict()
    openComposer({ ...composer, thenNext: true })
    return notify(verdict === 'changes' ? 'Say what should change in a remark. Adding it takes you to the next hunk.' : 'Write your comment. Adding it takes you to the next hunk.')
  }
  return nextAfterVerdict()
}

// Choose the verdict of the review: APPROVE, REQUEST_CHANGES or COMMENT.
export function setVerdict(verdict) {
  state.reviewer.verdict = verdict
  saveReviewer()
}

// Change the severity of an AI finding. The AI's severity removes the change.
export function setFindingSeverity(id, severity) {
  const finding = state.review.findings.find((candidate) => candidate.id === id)
  if (severity === finding?.severity) delete state.reviewer.severities[id]
  else state.reviewer.severities[id] = severity
  saveReviewer()
}

// Ask the agent to load the new commits of the PR.
export function refresh() {
  state.reviewer.hunkChanges = null
  return sendEvent({ type: 'refresh' })
}

// Hide the banner about loaded commits until the next load.
export function closeRefreshResult(eventId) {
  state.reviewer.closedRefresh = eventId
  saveReviewer()
}

// Open the first hunk that is new or changed since the last load, in reading order.
export function showFirstChangedHunk() {
  for (const line of lines()) {
    const index = line.stops.findIndex((stop) => state.freshHunks.has(stop.hunkId))
    if (index !== -1) return go(line.id, index)
  }
}

export function finish() { return sendEvent({ type: 'finish' }) }

export function newRound() { startNewRound() }

// Ask the agent to write a review summary from the remarks that will be posted.
export function summarize() {
  return sendEvent({ type: 'summarize', verdict: state.reviewer.verdict || proposedVerdict(), remarks: acceptedItems().map((item) => ({ severity: item.severity, where: item.hunkId ? `${hunkById(item.hunkId)?.file || ''} ${lineLabel(item)}` : 'the whole PR', body: item.body })) })
}

// Keep the reviewer's own summary and hide the AI draft of this event.
export function dismissSummaryDraft(eventId) {
  state.reviewer.summaryFrom = eventId
  saveReviewer()
}

export function setSummary(text) {
  state.reviewer.summary = text
  // Once the reviewer clears the AI draft, what they write is their own.
  if (!text.trim()) state.reviewer.summaryAiSuggested = false
  saveReviewer()
}

export function setThreadReply(threadId, text) {
  state.reviewer.threadReplies[threadId] = text
  saveReviewer()
}

// Load the whole file of a hunk into `state.ui.wholeFile`, for the file dialog.
export async function showWholeFile(hunk) {
  let text
  try {
    text = await transport.loadFile(hunk.file)
  } catch (error) {
    return notify(`Cannot show ${hunk.file}: ${error.message}`, true)
  }
  state.ui.wholeFile = { hunkId: hunk.id, file: hunk.file, language: languageOf(hunk.file), rows: wholeFileRows(hunk, text), focusLine: firstChangedLine(hunk) }
}

// Show a file of the local clone in its folder.
export function showInFolder(file) {
  return transport.openFolder(file).catch((error) => notify(`Cannot open the folder: ${error.message}`, true))
}

// Keep the agent status, and the question it waits on, as the overlay reads it.
function setAgent(agent) {
  state.agent = agent
  state.waiting = agent?.waiting ?? null
}

// The agent writes review.json in steps. The page needs the PR and its hunks before it can show anything.
function isComplete(review) {
  return Boolean(review?.pr?.owner && review.pr.repo && review.pr.number && Array.isArray(review.hunks))
}

// Load review.json again every few seconds, so the agent's changes show up.
export async function poll() {
  try {
    // Only this request tells whether the server still answers; fetch then rejects with a TypeError.
    const review = await transport.loadReview().catch((error) => {
      if (error instanceof TypeError) error.serverGone = true
      throw error
    })
    const json = JSON.stringify(review)
    if (json !== state.reviewJson && isComplete(review)) {
      setReview(review, json)
      noteFreshHunks()
      importOwnReview()
      startRoundOnNewCommits()
      applySummaryDraft()
      markCurrentSeen()
    }
    // The overlay and the stack switch are optional: when a call fails, the page keeps what it had.
    await Promise.all([transport.loadAgent().then(setAgent, () => {}), loadStack()])
    if (state.offline) state.offline = false
  } catch (error) {
    if (!error.serverGone) notify(`Cannot reach the agent: ${error.message}`, true)
    else if (!state.offline) state.offline = true
  }
  if (polling) pollTimer = setTimeout(poll, POLL_MS)
}

// Stop loading review.json and asking the agent to check GitHub, for example when the page goes away.
export function stopPolling() {
  polling = false
  clearTimeout(pollTimer)
  clearTimeout(checkTimer)
}

// A review that a start-review made has a directory but no review.json yet. Its page shows whether the agent prepares it,
// and boots as soon as review.json is there. Returns false when the review directory does not exist.
async function waitForReview() {
  const agent = await transport.loadAgent().catch(() => null)
  if (!agent) return false
  state.preparing = reviewPath()
  // The agent removes `preparing` when it stops, so the page keeps the review the start came from for its back link.
  const show = (status) => {
    setAgent(status)
    if (status.preparing?.from) state.preparing = { ...state.preparing, from: status.preparing.from }
  }
  show(agent)
  polling = true
  pollTimer = setTimeout(async function check() {
    const found = await transport.loadReview().then(isComplete, () => false)
    if (!polling) return
    if (found) return boot()
    await transport.loadAgent().then(show, () => {})
    if (polling) pollTimer = setTimeout(check, POLL_MS)
  }, POLL_MS)
  return true
}

// Load the review and the reviewer state, then start polling. Call setReviewPath first.
export async function boot() {
  stopPolling()
  try {
    const [review, reviewer, agent] = await Promise.all([transport.loadReview(), transport.loadReviewer(), transport.loadAgent().catch(() => null)])
    // A review.json that is not complete yet is handled like a missing one.
    if (!isComplete(review) && await waitForReview()) return
    setReview(review)
    setAgent(agent)
    state.preparing = null
    state.reviewer = { ...emptyReviewer(), ...reviewer }
    state.seen = new Set(state.reviewer.seen)
    noteFreshHunks()
    importOwnReview()
    startRoundOnNewCommits()
    applySummaryDraft()
    // Comments that were there when the review first opened are not new.
    state.reviewer.knownComments ??= (review.reviewComments || []).map((comment) => comment.id)
    saveReviewer()
    const first = lines()[0]
    const index = first.stops.findIndex((stop) => !isSeen(stop.hunkId))
    state.view = { kind: 'station', line: first.id, index: index === -1 ? 0 : index }
    // A static page has no server to poll and no agent to check GitHub.
    if (!state.static) {
      polling = true
      pollTimer = setTimeout(poll, POLL_MS)
      checkGitHub()
    }
    if (!restorePosition()) state.view = { kind: 'home' }
    markCurrentSeen()
    // The switch is optional, so the page does not wait for the list.
    loadReviews()
    loadStack()
  } catch (error) {
    if (error.statusCode === 404 && await waitForReview()) return
    state.bootError = `The review data did not load: ${error.message}. Check that the agent is still running and reload this page.`
  }
}
