<script lang="ts">
import { createHighlighterCore } from 'shiki/core'
import type { HighlighterCore, LanguageInput } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { extensionOf, languageOf } from '~/utils/diff.js'

// One coloured part of a line. A part without colours takes the colour of its row.
export interface CodeToken { content: string, light?: string, dark?: string }

// Only these languages ship, each loaded the first time a file needs it.
const LOADERS: Record<string, LanguageInput> = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
}

// languageOf gives highlight.js names, which put Vue and HTML under xml. The extension tells them apart.
const BY_EXTENSION: Record<string, string> = { vue: 'vue', html: 'html', htm: 'html', phtml: 'php', jsx: 'jsx', tsx: 'tsx', xml: 'xml', svg: 'xml' }

const THEMES = { light: 'github-light', dark: 'github-dark' }

let highlighter: Promise<HighlighterCore> | null = null
const loaded = new Map<string, Promise<void>>()

// Get the Shiki language of a file, or null when the page does not colour it.
export function shikiLanguage(path: string): string | null {
  const language = BY_EXTENSION[extensionOf(path)] || languageOf(path)
  return LOADERS[language] ? language : null
}

// Colour lines of one file as one text, so a line inside a multi-line comment or string keeps that context.
// Returns null for a file the page does not colour.
export async function highlightLines(texts: string[], path: string): Promise<CodeToken[][] | null> {
  const language = shikiLanguage(path)
  if (!language) return null
  highlighter ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  })
  const shiki = await highlighter
  if (!loaded.has(language)) loaded.set(language, shiki.loadLanguage(LOADERS[language]!))
  await loaded.get(language)
  const { tokens } = shiki.codeToTokens(texts.join('\n'), { lang: language, themes: THEMES, defaultColor: false })
  const light = shiki.getTheme(THEMES.light).fg.toLowerCase()
  const dark = shiki.getTheme(THEMES.dark).fg.toLowerCase()
  return tokens.map((line) => line.map((token) => {
    const style = (token.htmlStyle || {}) as Record<string, string>
    const colours = { light: style['--shiki-light'], dark: style['--shiki-dark'] }
    // Plain text keeps the add and remove ink of its row.
    const plain = colours.light?.toLowerCase() === light && colours.dark?.toLowerCase() === dark
    return plain ? { content: token.content } : { content: token.content, ...colours }
  }))
}

// Colour the rows of a diff. Context and added rows take the new side; removed rows the old side.
export async function highlightRows(rows: { kind: string, text: string }[], path: string): Promise<(CodeToken[] | null)[] | null> {
  const result: (CodeToken[] | null)[] = rows.map(() => null)
  for (const side of ['old', 'new']) {
    const sideRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind !== 'meta' && row.kind !== (side === 'old' ? 'add' : 'del'))
    const lines = await highlightLines(sideRows.map(({ row }) => row.text), path)
    if (!lines) return null
    sideRows.forEach(({ row, index }, at) => {
      if (side === 'new' || row.kind === 'del') result[index] = lines[at] || null
    })
  }
  return result
}
</script>

<script setup lang="ts">
// One line of code: its coloured parts, or the plain text while the colours load.
defineProps<{ text: string, tokens?: CodeToken[] | null }>()
</script>

<template>
  <template v-if="tokens && tokens.length">
    <span
      v-for="(token, index) in tokens"
      :key="index"
      :class="token.light && 'text-(--shiki-light) dark:text-(--shiki-dark)'"
      :style="token.light ? { '--shiki-light': token.light, '--shiki-dark': token.dark } : undefined"
    >{{ token.content }}</span>
  </template>
  <template v-else>{{ text || ' ' }}</template>
</template>
