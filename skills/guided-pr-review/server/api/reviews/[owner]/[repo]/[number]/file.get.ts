import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler((event) => {
  const dir = reviewDirOf(event)
  const file = changedFile(dir, getQuery(event).path as string | undefined)
  const full = file && path.join(file.localPath || path.join(dir, 'files'), file.path)
  if (!full || !fs.existsSync(full)) throw createError({ statusCode: 404, statusMessage: 'not found' })
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return fs.readFileSync(full, 'utf8')
})
