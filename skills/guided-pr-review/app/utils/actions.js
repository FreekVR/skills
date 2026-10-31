import { state, POLL_MS, CHECK_MS } from './state.js'
import { transport } from './api.js'
import { notify } from './notify.js'
import { acceptedItems, decisionOf, emptyReviewer, firstStationOf, hunkById, isSeen, lines, noteFreshHunks, setReview, severities } from './review.js'
import { answerFor, applySummaryDraft, buildPost, importOwnReview, newComments, openOwnThreads, proposedVerdict, startNewRound, startRoundOnNewCommits, threadPayload } from './posting.js'
import { composerFor, diffRows, languageOf, firstChangedLine, lineLabel, rowIndexOf, rowLocation, rowMatches, wholeFileRows, wholeHunkComposer } from './diff.js'
import { go, goHome, goTerminus, markCurrentSeen, restorePosition, step } from './navigation.js'
import { composerKey } from './panels.js'

let saveTimer = null
let pollTimer = null
let checkTimer = null
// A request still running when the page stops polling must not schedule the next one.
let polling = false
// Save the reviewer state soon. Changes that follow each other quickly are saved once.
export function saveReviewer() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try { await transport.saveReviewer(state.reviewer) }
    catch (error) { notify(`Your progress was not saved: ${error.message}. Keep this tab open and try again.`, true) }
  }, 250)
}

// `lineId` is the flow the reviewer saw the hunk in first, so another flow can say they saw it there.
export function markSeen(hunkId, lineId) {
  if (!isSeen(hunkId)) {
    state.reviewer.seen.push(hunkId)
    state.reviewer.seenIn = { ...state.reviewer.seenIn, [hunkId]: lineId }
    state.seen.add(hunkId)
    state.freshHunks.delete(hunkId)
    saveReviewer()
  }
}

// Send an event to the agent and keep it in the reviewer state. Returns the event ID, or null when it failed.
export async function sendEvent(event, extra = {}) {
  try {
    const { id } = await deliver(event)
    state.reviewer.sent.push({ id, type: event.type, hunkId: event.hunkId, question: event.question, kind: event.kind, ...extra })
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

// Post the review ('final') or a draft to GitHub, through the agent.
export async function post(kind) {
  const { event, contents } = buildPost(kind)
  if (kind === 'draft' && contents.length === 0) {
    notify('There is nothing to put in a draft yet. Accept a finding, write a remark or a summary first.', true)
    return
  }
  const payload = { body: event.body, comments: event.comments, verdict: event.verdict }
  const id = await sendEvent(event, { contents, at: new Date().toISOString(), headSha: state.review.pr.headSha, payload })
  if (id) notify(kind === 'final' ? 'The review is on its way to GitHub.' : 'The draft is on its way to GitHub.')
}

// An update adds a review on top of the reviewer's earlier one. It carries no new line comments.
export async function postUpdate(verdict) {
  const body = (state.reviewer.updateNote || '').trim()
  if (verdict !== 'APPROVE' && !body) return notify('Write a note to the author first. GitHub needs a body for this verdict.', true)
  const event = { type: 'post', kind: 'update', verdict, body, comments: [], ...threadPayload() }
  const id = await sendEvent(event, { at: new Date().toISOString(), payload: { verdict, body, resolve: event.resolve, replies: event.replies } })
  if (!id) return
  // Sent replies are not sent again; a thread left open keeps its call until new commits start the next round.
  for (const reply of event.replies) state.reviewer.threadReplies[reply.threadId] = ''
  state.reviewer.updateNote = ''
  saveReviewer()
  notify('The update is on its way to GitHub.')
}

export function setTheme(choice) {
  state.reviewer.theme = choice
  saveReviewer()
}

// Resolve a posted comment of the reviewer, or leave it open. A thread left open starts with the AI's draft reply.
export function setThreadCall(threadId, call) {
  const own = openOwnThreads().find((candidate) => candidate.threadId === threadId)
  state.reviewer.threadCalls = { ...state.reviewer.threadCalls, [threadId]: call }
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
  if (remark && body) Object.assign(remark, { body, severity })
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
  if (composer.thenNext) return step(1)
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
    if (!composer) return step(1)
    openComposer({ ...composer, thenNext: true })
    return notify(verdict === 'changes' ? 'Say what should change in a remark. Adding it takes you to the next hunk.' : 'Write your comment. Adding it takes you to the next hunk.')
  }
  return step(1)
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
  state.ui.updatingTo = state.review.remote.headSha
  return sendEvent({ type: 'refresh' })
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

export function setUpdateNote(text) {
  state.reviewer.updateNote = text
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

// Load review.json again every few seconds, so the agent's changes show up.
export async function poll() {
  try {
    // Only this request tells whether the server still answers; fetch then rejects with a TypeError.
    const review = await transport.loadReview().catch((error) => {
      if (error instanceof TypeError) error.serverGone = true
      throw error
    })
    const json = JSON.stringify(review)
    if (json !== state.reviewJson) {
      setReview(review, json)
      noteFreshHunks()
      importOwnReview()
      startRoundOnNewCommits()
      applySummaryDraft()
      markCurrentSeen()
    }
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

// Load the review and the reviewer state, then start polling. Call setReviewPath first.
export async function boot() {
  stopPolling()
  try {
    const [review, reviewer] = await Promise.all([transport.loadReview(), transport.loadReviewer()])
    setReview(review)
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
    polling = true
    pollTimer = setTimeout(poll, POLL_MS)
    checkGitHub()
    if (!restorePosition()) state.view = { kind: 'home' }
    markCurrentSeen()
    // The switch is optional, so the page does not wait for the list.
    loadReviews()
  } catch (error) {
    state.bootError = `The review data did not load: ${error.message}. Check that the agent is still running and reload this page.`
  }
}
