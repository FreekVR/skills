import path from 'node:path'

export default defineEventHandler(async (event) => {
  const dir = reviewDirOf(event)
  const body = await readRawBody(event) || ''
  try {
    JSON.parse(body)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'reviewer state is not JSON' })
  }
  writeAtomic(path.join(dir, 'reviewer.json'), body)
  setResponseStatus(event, 204)
  return null
})
