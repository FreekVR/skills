import { removeReview } from '../../../../../../scripts/reviews.js'

// Delete this review and its worktree, from the sessions list of another review's page.
export default defineEventHandler((event) => {
  const dir = reviewDirOf(event)
  try {
    removeReview(dir)
  } catch (error) {
    throw createError({ statusCode: 409, statusMessage: (error as Error).message })
  }
  return { removed: true }
})
