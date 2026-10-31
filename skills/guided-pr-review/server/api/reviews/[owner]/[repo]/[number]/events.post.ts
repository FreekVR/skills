import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// The agent's watch process reads events.jsonl and passes each new line to the agent.
export default defineEventHandler(async (event) => {
  const dir = reviewDirOf(event)
  const stored = { ...await readBody(event), id: crypto.randomUUID(), at: new Date().toISOString() }
  fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(stored) + '\n')
  return { id: stored.id }
})
