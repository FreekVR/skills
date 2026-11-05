import { d as defineEventHandler, r as reviews, c as createError } from '../../../../../nitro/nitro.mjs';
import { r as reviewDirOf } from '../../../../../_/review.mjs';
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

const index_delete = defineEventHandler((event) => {
  const dir = reviewDirOf(event);
  try {
    reviews.removeReview(dir);
  } catch (error) {
    throw createError({ statusCode: 409, statusMessage: error.message });
  }
  return { removed: true };
});

export { index_delete as default };
