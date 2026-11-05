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

const reviewer_get = defineEventHandler((event) => {
  const file = path.join(reviewDirOf(event), "reviewer.json");
  setResponseHeader(event, "Content-Type", "application/json");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "{}";
});

export { reviewer_get as default };
