import { d as defineEventHandler, a as readBody, c as createError } from '../../../../../../nitro/nitro.mjs';
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

const paused_post = defineEventHandler(async (event) => {
  const file = path.join(reviewDirOf(event), "paused");
  const { paused } = await readBody(event) || {};
  if (typeof paused !== "boolean") throw createError({ statusCode: 400, statusMessage: "paused must be true or false" });
  if (paused) fs.writeFileSync(file, "");
  else fs.rmSync(file, { force: true });
  return { paused };
});

export { paused_post as default };
