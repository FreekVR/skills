// Whether an agent watches the review, and the question it waits on.
// A review the agent still prepares has no review.json yet, and its page asks this to know that.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'application/json')
  return JSON.stringify(agentStatus(reviewDirOf(event, { withoutReview: true })))
})
