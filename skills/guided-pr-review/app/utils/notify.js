// Messages for the reviewer. A component shows them.
export const notices = reactive([])

let lastNoticeId = 0

// Show a message to the reviewer. An error stays until the reviewer closes it; other messages go after five seconds.
export function notify(message, isError = false) {
  const id = ++lastNoticeId
  notices.push({ id, message, isError })
  if (!isError) setTimeout(() => dismissNotice(id), 5000)
}

// Remove a message, for example when the reviewer closes it.
export function dismissNotice(id) {
  const index = notices.findIndex((notice) => notice.id === id)
  if (index !== -1) notices.splice(index, 1)
}
