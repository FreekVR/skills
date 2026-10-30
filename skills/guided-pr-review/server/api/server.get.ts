// The launcher checks with this that the server answering on its port is the process it started.
export default defineEventHandler(() => ({ pid: process.pid }))
