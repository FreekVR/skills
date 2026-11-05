import { d as defineEventHandler, e as readRawBody, c as createError, r as reviews, b as setResponseStatus } from '../../../../../../nitro/nitro.mjs';
import { r as reviewDirOf } from '../../../../../../_/review.mjs';
import path from 'node:path';
import 'unhead/server';
import 'vue';
import 'unhead/legacy';
import 'unhead/plugins';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:crypto';
import 'fs';
import 'os';
import 'path';
import 'child_process';
import 'node:url';

const reviewer_put = defineEventHandler(async (event) => {
  const dir = reviewDirOf(event);
  const body = await readRawBody(event) || "";
  try {
    JSON.parse(body);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "reviewer state is not JSON" });
  }
  reviews.writeAtomic(path.join(dir, "reviewer.json"), body);
  setResponseStatus(event, 204);
  return null;
});

export { reviewer_put as default };
