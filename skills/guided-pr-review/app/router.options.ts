import type { RouterConfig } from 'nuxt/schema'
import { createMemoryHistory } from 'vue-router'
import { STATIC_REVIEW } from './utils/state.js'

// A static page opens from a file, so its address names no PR. The route of its review is kept in memory instead.
export default {
  history: (base) => {
    if (!STATIC_REVIEW) return null
    const history = createMemoryHistory(base)
    const { owner, repo, number } = STATIC_REVIEW.pr
    history.replace(`/${owner}/${repo}/${number}`)
    return history
  },
} satisfies RouterConfig
