import { d as defineEventHandler, r as reviews, g as getQuery, c as createError, s as setResponseHeader } from '../../../../../../nitro/nitro.mjs';
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

const file_get = defineEventHandler((event) => {
  const dir = reviewDirOf(event);
  const file = reviews.changedFile(dir, getQuery(event).path);
  const full = file && path.join(file.localPath || path.join(dir, "files"), file.path);
  if (!full || !fs.existsSync(full)) throw createError({ statusCode: 404, statusMessage: "not found" });
  setResponseHeader(event, "Content-Type", "text/plain; charset=utf-8");
  return fs.readFileSync(full, "utf8");
});

export { file_get as default };
