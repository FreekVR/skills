'use strict';
// Run with: node --test skills/guided-pr-review/tests/*.test.js

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const load = async () => {
  const { parseMarkdown } = await import('comark');
  const { default: html } = await import('comark/plugins/html');
  const { githubHtml } = await import(path.join(__dirname, '..', 'app', 'utils', 'github-html.mjs'));
  return async (text) => (await parseMarkdown(text, { registerDefaultPlugins: false, plugins: [html(), githubHtml()] })).nodes;
};

test('keeps the tags GitHub allows and unwraps the others, keeping their text', async () => {
  const parse = await load();
  assert.deepStrictEqual(await parse('a <sub>b</sub> <custom-el>c</custom-el>'), [['p', {}, 'a ', ['sub', { $: { html: 1, block: 0 } }, 'b'], ' ', 'c']]);
});

test('removes script, style, iframe and svg with their content', async () => {
  const parse = await load();
  for (const tag of ['script', 'style', 'iframe', 'svg']) {
    assert.doesNotMatch(JSON.stringify(await parse(`x <${tag}>secret</${tag}>`)), /secret/, tag);
  }
});

test('keeps links and images only with the protocols GitHub allows, and relative ones', async () => {
  const parse = await load();
  const href = async (value) => (await parse(`<a href="${value}">x</a>`))[0][1].href;
  assert.strictEqual(await href('https://example.test'), 'https://example.test');
  assert.strictEqual(await href('mailto:someone@example.test'), 'mailto:someone@example.test');
  assert.strictEqual(await href('/relative/path'), '/relative/path');
  assert.strictEqual(await href('javascript:alert(1)'), undefined);
  assert.strictEqual(await href(' java\tscript:alert(1)'), undefined);
  const src = async (value) => (await parse(`<img src="${value}" alt="a">`))[0][1].src;
  assert.strictEqual(await src('https://example.test/a.png'), 'https://example.test/a.png');
  assert.strictEqual(await src('mailto:someone@example.test'), undefined);
});

test('prefixes names too, so an element cannot shadow a property of document', async () => {
  const parse = await load();
  assert.strictEqual((await parse('<img name="getElementById" src="https://example.test/a.png">'))[0][1].name, 'user-content-getElementById');
});

test('drops event handlers, style and class, and prefixes ids as GitHub does', async () => {
  const parse = await load();
  const [[, , , span]] = await parse('x <span id="top" class="c" style="color: red" onclick="go()" title="t">y</span>');
  assert.deepStrictEqual(span[1], { $: { html: 1, block: 0 }, id: 'user-content-top', title: 't' });
});
