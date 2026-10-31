import { d as defineEventHandler, r as reviews } from '../../nitro/nitro.mjs';
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

const reviews_get = defineEventHandler(() => reviews.listReviews().map(({ dir: _dir, ...review }) => review));

export { reviews_get as default };
