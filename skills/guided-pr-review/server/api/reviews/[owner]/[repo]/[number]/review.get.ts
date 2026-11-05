import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'application/json')
  return fs.readFileSync(path.join(reviewDirOf(event), 'review.json'), 'utf8')
})
