import { state } from './state.js'
import { criterionById } from './review.js'

// A part is { type: 'text', text }, { type: 'code', text } or { type: 'link', text, url, title }.

// Split text into parts: inline code between backticks, references to tickets and pull requests, and plain text.
export function inlineMarkup(text) {
  return String(text ?? '').split(/(`[^`]+`)/).flatMap((part) => (/^`[^`]+`$/.test(part) ? [{ type: 'code', text: part.slice(1, -1) }] : linkReferences(part)))
}

const REFERENCE = /([\w.-]+\/[\w.-]+)#(\d+)|\b([A-Z][A-Z0-9]+-\d+)(#\d+)?\b|(^|[^\w/&])#(\d+)\b/g

// Jira keys only link for projects the review read a ticket of, so text like UTF-8 stays plain.
export function linkReferences(text) {
  const tickets = linkableTickets()
  const jiraTicket = tickets.find((ticket) => /^[A-Z][A-Z0-9]+-\d+$/.test(ticket.key) && ticket.url)
  const jiraBase = jiraTicket ? jiraTicket.url.slice(0, jiraTicket.url.lastIndexOf(jiraTicket.key)) : null
  const projects = new Set(tickets.map((ticket) => ticket.key.split('-')[0]))
  const thisRepo = state.review ? `${state.review.pr.owner}/${state.review.pr.repo}` : null
  const parts = []
  const addText = (value) => { if (value) parts.push({ type: 'text', text: value }) }
  let last = 0
  for (const match of text.matchAll(REFERENCE)) {
    const [whole, repo, number, key, criterion, prefix, bareNumber] = match
    let link = null
    let before = ''
    if (repo) link = githubLink(`${repo}#${number}`, repo, number)
    else if (key && jiraBase && projects.has(key.split('-')[0])) link = jiraLink(key, criterion, tickets, jiraBase)
    else if (bareNumber && thisRepo) {
      before = prefix
      link = githubLink(`#${bareNumber}`, thisRepo, bareNumber)
    }
    if (!link) continue
    addText(text.slice(last, match.index) + before)
    parts.push(link)
    last = match.index + whole.length
  }
  addText(text.slice(last))
  return parts
}

// Linked tickets and open related tickets both get a link and a title tooltip; only linked ones carry criteria.
export function linkableTickets() {
  const context = state.review ? state.review.context : {}
  return [...(context.tickets || []), ...(context.relatedTickets || [])]
}

// Get the link part for a Jira key, with the ticket title and the criterion text in its title.
export function jiraLink(key, criterion, tickets, jiraBase) {
  const ticket = tickets.find((candidate) => candidate.key === key)
  const criterionText = criterion ? criterionById(key + criterion)?.text : null
  const title = [ticket ? `${key}: ${ticket.title}` : key, criterionText].filter(Boolean).join(' · ')
  return { type: 'link', text: key + (criterion || ''), url: ticket?.url || jiraBase + key, title }
}

// Get the link part for a GitHub issue or pull request, with its title when the review knows it.
export function githubLink(label, repo, number) {
  const context = state.review.context
  const pr = (context.linkedPrs || []).find((candidate) => candidate.repo === repo && String(candidate.number) === String(number))
  const issue = linkableTickets().find((ticket) => ticket.key === `${repo}#${number}` || (repo === `${state.review.pr.owner}/${state.review.pr.repo}` && ticket.key === `#${number}`))
  const own = repo === `${state.review.pr.owner}/${state.review.pr.repo}` && String(number) === String(state.review.pr.number) ? state.review.pr : null
  const known = pr || issue || own
  return { type: 'link', text: label, url: known?.url || `https://github.com/${repo}/issues/${number}`, title: known ? `${label}: ${known.title}` : label }
}

// A long qualified name may wrap after a namespace or path separator, never inside a name.
// The parts end at those separators, so the view can put a <wbr> between them.
export function codeName(name) {
  return String(name ?? '').replace(/(::|[\\/.:])/g, '$1\u0000').split('\u0000').filter(Boolean)
}
