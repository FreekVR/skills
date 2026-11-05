import { f as getRouterParam, c as createError, r as reviews } from '../nitro/nitro.mjs';
import fs from 'node:fs';
import path from 'node:path';
import nodeCrypto from 'node:crypto';

const NAME = /^[\w.-]+$/;
function reviewDirOf(event, { withoutReview = false } = {}) {
  const owner = getRouterParam(event, "owner") || "";
  const repo = getRouterParam(event, "repo") || "";
  const number = getRouterParam(event, "number") || "";
  if (!NAME.test(owner) || !NAME.test(repo) || owner.startsWith(".") || repo.startsWith(".") || !/^\d+$/.test(number)) {
    throw createError({ statusCode: 404, statusMessage: "not found" });
  }
  const dir = reviews.reviewDir(`${owner}/${repo}`, number);
  if (!fs.existsSync(withoutReview ? dir : path.join(dir, "review.json"))) throw createError({ statusCode: 404, statusMessage: "not found" });
  return dir;
}
function appendEvent(dir, body) {
  const stored = { ...body, id: nodeCrypto.randomUUID(), at: (/* @__PURE__ */ new Date()).toISOString() };
  fs.appendFileSync(path.join(dir, "events.jsonl"), JSON.stringify(stored) + "\n");
  return { id: stored.id };
}

export { appendEvent as a, reviewDirOf as r };
