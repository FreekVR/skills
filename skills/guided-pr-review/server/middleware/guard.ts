const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/
const MAX_BODY_BYTES = 5 * 1024 * 1024

// Events reach the agent as if the reviewer sent them, so only the review page may send them.
// Another site cannot set a custom header without a CORS preflight, which this server never allows,
// and a DNS-rebound name fails the Host check.
export default defineEventHandler((event) => {
  if (!LOCAL_HOST.test(getHeader(event, 'host') || '')) throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  if (event.method === 'GET' || event.method === 'HEAD') return
  if (getHeader(event, 'x-guided-review') !== '1') throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  if (Number(getHeader(event, 'content-length') || 0) > MAX_BODY_BYTES) throw createError({ statusCode: 413, statusMessage: 'body too large' })
})
