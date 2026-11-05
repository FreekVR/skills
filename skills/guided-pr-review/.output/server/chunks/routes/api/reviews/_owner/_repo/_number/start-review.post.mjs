import { d as defineEventHandler, f as getRouterParam, a as readBody, c as createError, r as reviews } from '../../../../../../nitro/nitro.mjs';
import { r as reviewDirOf, a as appendEvent } from '../../../../../../_/review.mjs';
import fs from 'node:fs';
import path from 'node:path';
import 'unhead/server';
import 'vue';
import 'unhead/legacy';
import 'unhead/plugins';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:crypto';
import 'fs';
import 'os';
import 'path';
import 'child_process';
import 'node:url';

const startReview_post = defineEventHandler(async (event) => {
  var _a, _b;
  const dir = reviewDirOf(event);
  const owner = getRouterParam(event, "owner");
  const repo = getRouterParam(event, "repo");
  const number = Number(getRouterParam(event, "number"));
  const target = (_a = await readBody(event)) == null ? void 0 : _a.number;
  const review = JSON.parse(fs.readFileSync(path.join(dir, "review.json"), "utf8"));
  if (!Number.isInteger(target) || target === number || !(((_b = review.stack) == null ? void 0 : _b.prs) || []).some((pr) => pr.number === target)) {
    throw createError({ statusCode: 400, statusMessage: "number must be another PR in the stack of this review" });
  }
  const page = `/${owner}/${repo}/${target}`;
  const targetDir = reviews.reviewDir(`${owner}/${repo}`, target);
  if (fs.existsSync(path.join(targetDir, "review.json")) || fs.existsSync(path.join(targetDir, "preparing"))) return { id: null, page };
  const { id } = appendEvent(dir, { type: "start-review", number: target, review: `${owner}/${repo}#${number}` });
  fs.mkdirSync(targetDir, { recursive: true });
  reviews.writeAtomic(path.join(targetDir, "preparing"), JSON.stringify({ step: "Waiting for the agent to start", since: (/* @__PURE__ */ new Date()).toISOString(), from: number }) + "\n");
  return { id, page };
});

export { startReview_post as default };
