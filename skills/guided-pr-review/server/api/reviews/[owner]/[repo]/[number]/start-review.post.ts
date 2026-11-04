import fs from 'node:fs'
import path from 'node:path'

// Ask the agent to prepare the review of another PR in this review's stack. The page of that PR can open at once:
// its `preparing` file says that the agent prepares it, and `from` names this review, whose agent gets the event.
// A PR that has a review, or one the agent already prepares, gets no second start: the reviewer only goes to its page.
export default defineEventHandler(async (event) => {
  const dir = reviewDirOf(event)
  const owner = getRouterParam(event, 'owner')
  const repo = getRouterParam(event, 'repo')
  const number = Number(getRouterParam(event, 'number'))
  const target = (await readBody(event))?.number
  const review = JSON.parse(fs.readFileSync(path.join(dir, 'review.json'), 'utf8'))
  if (!Number.isInteger(target) || target === number || !(review.stack?.prs || []).some((pr: { number: number }) => pr.number === target)) {
    throw createError({ statusCode: 400, statusMessage: 'number must be another PR in the stack of this review' })
  }
  const page = `/${owner}/${repo}/${target}`
  const targetDir = reviewDir(`${owner}/${repo}`, target)
  if (fs.existsSync(path.join(targetDir, 'review.json')) || fs.existsSync(path.join(targetDir, 'preparing'))) return { id: null, page }
  const { id } = appendEvent(dir, { type: 'start-review', number: target, review: `${owner}/${repo}#${number}` })
  fs.mkdirSync(targetDir, { recursive: true })
  writeAtomic(path.join(targetDir, 'preparing'), JSON.stringify({ step: 'Waiting for the agent to start', since: new Date().toISOString(), from: number }) + '\n')
  return { id, page }
})
