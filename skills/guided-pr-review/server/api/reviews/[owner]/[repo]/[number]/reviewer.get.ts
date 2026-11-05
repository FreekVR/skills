import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler((event) => {
  const file = path.join(reviewDirOf(event), 'reviewer.json')
  setResponseHeader(event, 'Content-Type', 'application/json')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}'
})
