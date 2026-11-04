export default defineEventHandler(async (event) => appendEvent(reviewDirOf(event), await readBody(event)))
