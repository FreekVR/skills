import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { H3Event } from 'h3'
import { reviewDir } from '../../scripts/reviews.js'

export { reviewDir, writeAtomic, changedFile, revealInFolder, stackStatus, agentStatus } from '../../scripts/reviews.js'

const NAME = /^[\w.-]+$/

// The review directory of the PR in the URL; owner and repo may not walk out of the state directory.
// `withoutReview` accepts a directory without review.json: the page of a review the agent still prepares.
export function reviewDirOf(event: H3Event, { withoutReview = false } = {}) {
  const owner = getRouterParam(event, 'owner') || ''
  const repo = getRouterParam(event, 'repo') || ''
  const number = getRouterParam(event, 'number') || ''
  if (!NAME.test(owner) || !NAME.test(repo) || owner.startsWith('.') || repo.startsWith('.') || !/^\d+$/.test(number)) {
    throw createError({ statusCode: 404, statusMessage: 'not found' })
  }
  const dir = reviewDir(`${owner}/${repo}`, number)
  if (!fs.existsSync(withoutReview ? dir : path.join(dir, 'review.json'))) throw createError({ statusCode: 404, statusMessage: 'not found' })
  return dir
}

// The agent's watch process reads events.jsonl and passes each new line to the agent.
export function appendEvent(dir: string, body: object) {
  const stored = { ...body, id: crypto.randomUUID(), at: new Date().toISOString() }
  fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(stored) + '\n')
  return { id: stored.id }
}

