import { d as defineEventHandler, s as setResponseHeader } from '../../../../../../nitro/nitro.mjs';
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

const review_get = defineEventHandler((event) => {
  setResponseHeader(event, "Content-Type", "application/json");
  return fs.readFileSync(path.join(reviewDirOf(event), "review.json"), "utf8");
});

export { review_get as default };
