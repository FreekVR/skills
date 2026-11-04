import { d as defineEventHandler, a as readBody } from '../../../../../../nitro/nitro.mjs';
import { a as appendEvent, r as reviewDirOf } from '../../../../../../_/review.mjs';
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

const events_post = defineEventHandler(async (event) => appendEvent(reviewDirOf(event), await readBody(event)));

export { events_post as default };
