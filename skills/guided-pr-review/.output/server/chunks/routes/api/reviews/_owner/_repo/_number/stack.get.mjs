import { d as defineEventHandler, r as reviews, f as getRouterParam } from '../../../../../../nitro/nitro.mjs';
import { r as reviewDirOf } from '../../../../../../_/review.mjs';
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

const stack_get = defineEventHandler((event) => {
  var _a;
  const review = JSON.parse(fs.readFileSync(path.join(reviewDirOf(event), "review.json"), "utf8"));
  const numbers = (((_a = review.stack) == null ? void 0 : _a.prs) || []).map((pr) => pr.number);
  return reviews.stackStatus(getRouterParam(event, "owner") || "", getRouterParam(event, "repo") || "", numbers);
});

export { stack_get as default };
