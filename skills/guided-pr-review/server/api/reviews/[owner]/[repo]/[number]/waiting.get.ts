// The question the agent waits on in the chat, or null.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'application/json')
  return JSON.stringify(readWaiting(reviewDirOf(event)))
})
