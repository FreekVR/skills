import path from 'node:path'

export default defineEventHandler(async (event) => {
  const dir = reviewDirOf(event)
  const file = changedFile(dir, (await readBody(event))?.path)
  if (!file?.localPath) throw createError({ statusCode: 404, statusMessage: 'not found' })
  await revealInFolder(path.join(file.localPath, file.path))
  setResponseStatus(event, 204)
  return null
})
