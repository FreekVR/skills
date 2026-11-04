import { defineComarkPlugin } from 'comark'

// GitHub links references in comment text, but not inside links and code.
const SKIP = new Set(['a', 'code', 'pre'])

function linkText(nodes, split) {
  return nodes.flatMap((node) => {
    if (typeof node === 'string') {
      const parts = split(node)
      return parts.length === 1 && parts[0].type === 'text' ? [node] : parts.map((part) => (part.type === 'link' ? ['a', { href: part.url, title: part.title }, part.text] : part.text))
    }
    if (node[0] === null || SKIP.has(String(node[0]).toLowerCase())) return [node]
    const [tag, attributes, ...children] = node
    return [[tag, attributes, ...linkText(children, split)]]
  })
}

// Get the comark plugin that links references in text as GitHub does. `split` turns a text into text and link parts.
export const githubLinks = defineComarkPlugin((split) => ({
  name: 'github-links',
  post(state) { state.tree.nodes = linkText(state.tree.nodes, split) },
}))
