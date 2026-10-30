import fs from 'node:fs'
import path from 'node:path'
import type { H3Event } from 'h3'
import { reviewDir } from '../../scripts/reviews.js'

export { writeAtomic, changedFile, revealInFolder } from '../../scripts/reviews.js'

const NAME = /^[\w.-]+$/

// The review directory of the PR in the URL; owner and repo may not walk out of the state directory.
export function reviewDirOf(event: H3Event) {
  const owner = getRouterParam(event, 'owner') || ''
  const repo = getRouterParam(event, 'repo') || ''
  const number = getRouterParam(event, 'number') || ''
  if (!NAME.test(owner) || !NAME.test(repo) || owner.startsWith('.') || repo.startsWith('.') || !/^\d+$/.test(number)) {
    throw createError({ statusCode: 404, statusMessage: 'not found' })
  }
  const dir = reviewDir(`${owner}/${repo}`, number)
  if (!fs.existsSync(path.join(dir, 'review.json'))) throw createError({ statusCode: 404, statusMessage: 'not found' })
  return dir
}

