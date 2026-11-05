import { anyAgentConnected } from '../../scripts/reviews.js'

const CHECK_MS = 60_000
const IDLE_MS = 10 * 60_000

// Nobody has to find and stop this process: it stops after IDLE_MS with no agent watching a review.
export default defineNitroPlugin(() => {
  let lastConnected = Date.now()
  setInterval(() => {
    if (anyAgentConnected()) lastConnected = Date.now()
    else if (Date.now() - lastConnected > IDLE_MS) process.exit(0)
  }, CHECK_MS).unref()
})
