import { d as defineEventHandler, a as readBody } from '../../../../../../nitro/nitro.mjs';
import { r as reviewDirOf } from '../../../../../../_/review.mjs';
import fs from 'node:fs';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import 'unhead/server';
import 'vue';
import 'unhead/legacy';
import 'unhead/plugins';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'fs';
import 'os';
import 'path';
import 'child_process';
import 'node:url';

const events_post = defineEventHandler(async (event) => {
  const dir = reviewDirOf(event);
  const stored = { ...await readBody(event), id: nodeCrypto.randomUUID(), at: (/* @__PURE__ */ new Date()).toISOString() };
  fs.appendFileSync(path.join(dir, "events.jsonl"), JSON.stringify(stored) + "\n");
  return { id: stored.id };
});

export { events_post as default };
