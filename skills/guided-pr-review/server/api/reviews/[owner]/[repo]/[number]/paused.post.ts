import fs from 'node:fs'
import path from 'node:path'

// Pause or play the agent of this review. The agent's watch process holds events while the `paused` file exists.
export default defineEventHandler(async (event) => {
  const file = path.join(reviewDirOf(event), 'paused')
  const { paused } = await readBody(event) || {}
  if (typeof paused !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'paused must be true or false' })
  if (paused) fs.writeFileSync(file, '')
  else fs.rmSync(file, { force: true })
  return { paused }
})
