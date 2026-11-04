// Whether an agent watches the review, whether it is paused, and the question it waits on.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'application/json')
  return JSON.stringify(agentStatus(reviewDirOf(event)))
})
