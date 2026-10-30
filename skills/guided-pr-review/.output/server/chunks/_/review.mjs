import { f as getRouterParam, c as createError, r as reviews } from '../nitro/nitro.mjs';
import fs from 'node:fs';
import path from 'node:path';

const NAME = /^[\w.-]+$/;
function reviewDirOf(event) {
  const owner = getRouterParam(event, "owner") || "";
  const repo = getRouterParam(event, "repo") || "";
  const number = getRouterParam(event, "number") || "";
  if (!NAME.test(owner) || !NAME.test(repo) || owner.startsWith(".") || repo.startsWith(".") || !/^\d+$/.test(number)) {
    throw createError({ statusCode: 404, statusMessage: "not found" });
  }
  const dir = reviews.reviewDir(`${owner}/${repo}`, number);
  if (!fs.existsSync(path.join(dir, "review.json"))) throw createError({ statusCode: 404, statusMessage: "not found" });
  return dir;
}

export { reviewDirOf as r };
