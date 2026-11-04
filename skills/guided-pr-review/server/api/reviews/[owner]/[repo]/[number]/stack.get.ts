import fs from 'node:fs'
import path from 'node:path'

// The review state of each PR in the stack of this review, or an empty list for a PR in no stack.
export default defineEventHandler((event) => {
  const review = JSON.parse(fs.readFileSync(path.join(reviewDirOf(event), 'review.json'), 'utf8'))
  const numbers = (review.stack?.prs || []).map((pr: { number: number }) => pr.number)
  return stackStatus(getRouterParam(event, 'owner') || '', getRouterParam(event, 'repo') || '', numbers)
})
