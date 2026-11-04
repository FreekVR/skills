'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// A stand-in for linkReferences: it links every "#1".
const split = (text) => text.split(/(#1)/).filter(Boolean).map((part) => (part === '#1' ? { type: 'link', text: part, url: 'https://example.test/1', title: 'One' } : { type: 'text', text: part }));

const load = async () => {
  const { parseMarkdown } = await import('comark');
  const { githubLinks } = await import(path.join(__dirname, '..', 'app', 'utils', 'github-links.mjs'));
  return async (text) => (await parseMarkdown(text, { registerDefaultPlugins: false, plugins: [githubLinks(split)] })).nodes;
};

test('links references in text, also inside emphasis and lists', async () => {
  const parse = await load();
  const link = ['a', { href: 'https://example.test/1', title: 'One' }, '#1'];
  assert.deepStrictEqual(await parse('see #1 now'), [['p', {}, 'see ', link, ' now']]);
  assert.deepStrictEqual(await parse('**#1**'), [['p', {}, ['strong', {}, link]]]);
  assert.match(JSON.stringify(await parse('- item #1')), /example\.test\/1/);
});

test('leaves references in code, code blocks and links as they are', async () => {
  const parse = await load();
  for (const text of ['`#1`', '```\n#1\n```', '[#1](https://example.test/other)']) {
    assert.doesNotMatch(JSON.stringify(await parse(text)), /example\.test\/1"/, text);
  }
});
