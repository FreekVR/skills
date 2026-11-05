import { d as defineEventHandler, r as reviews, a as readBody, c as createError, b as setResponseStatus } from '../../../../../../nitro/nitro.mjs';
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

const open_post = defineEventHandler(async (event) => {
  var _a;
  const dir = reviewDirOf(event);
  const file = reviews.changedFile(dir, (_a = await readBody(event)) == null ? void 0 : _a.path);
  if (!(file == null ? void 0 : file.localPath)) throw createError({ statusCode: 404, statusMessage: "not found" });
  await reviews.revealInFolder(path.join(file.localPath, file.path));
  setResponseStatus(event, 204);
  return null;
});

export { open_post as default };
