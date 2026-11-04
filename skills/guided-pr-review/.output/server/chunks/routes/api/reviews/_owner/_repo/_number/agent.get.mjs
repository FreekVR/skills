import { d as defineEventHandler, s as setResponseHeader, r as reviews } from '../../../../../../nitro/nitro.mjs';
import { r as reviewDirOf } from '../../../../../../_/review.mjs';
import 'unhead/server';
import 'vue';
import 'unhead/legacy';
import 'unhead/plugins';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'fs';
import 'os';
import 'path';
import 'child_process';
import 'node:url';

const agent_get = defineEventHandler((event) => {
  setResponseHeader(event, "Content-Type", "application/json");
  return JSON.stringify(reviews.agentStatus(reviewDirOf(event)));
});

export { agent_get as default };
