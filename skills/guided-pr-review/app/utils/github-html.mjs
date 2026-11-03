import { defineComarkPlugin } from 'comark'

// GitHub's allowlist for HTML in comments: html-pipeline's SanitizationFilter at commit 5470e4ebeba1
// (https://github.com/gjtorikian/html-pipeline/blob/5470e4ebeba1/lib/html_pipeline/sanitization_filter.rb), with the protocols and
// the removed contents of Selma's default config at commit 1f0b6d91074d
// (https://github.com/gjtorikian/selma/blob/1f0b6d91074d/lib/selma/sanitizer/config/default.rb).
const ELEMENTS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'b', 'i', 'strong', 'em', 'a', 'pre', 'code', 'img', 'tt', 'div', 'ins', 'del', 'sup', 'sub', 'p', 'picture', 'ol', 'ul', 'table', 'thead', 'tbody', 'tfoot', 'blockquote', 'dl', 'dt', 'dd', 'kbd', 'q', 'samp', 'var', 'hr', 'ruby', 'rt', 'rp', 'li', 'tr', 'td', 'th', 's', 'strike', 'summary', 'details', 'caption', 'figure', 'figcaption', 'abbr', 'bdo', 'cite', 'dfn', 'mark', 'small', 'source', 'span', 'time', 'wbr'])
const ATTRIBUTES = { a: ['href'], img: ['src', 'longdesc', 'loading', 'alt'], div: ['itemscope', 'itemtype'], blockquote: ['cite'], del: ['cite'], ins: ['cite'], q: ['cite'], source: ['srcset'] }
const ALL = new Set(['abbr', 'accept', 'accept-charset', 'accesskey', 'action', 'align', 'alt', 'aria-describedby', 'aria-hidden', 'aria-label', 'aria-labelledby', 'axis', 'border', 'char', 'charoff', 'charset', 'checked', 'clear', 'cols', 'colspan', 'compact', 'coords', 'datetime', 'dir', 'disabled', 'enctype', 'for', 'frame', 'headers', 'height', 'hreflang', 'hspace', 'id', 'ismap', 'label', 'lang', 'maxlength', 'media', 'method', 'multiple', 'name', 'nohref', 'noshade', 'nowrap', 'open', 'progress', 'prompt', 'readonly', 'rel', 'rev', 'role', 'rows', 'rowspan', 'rules', 'scope', 'selected', 'shape', 'size', 'span', 'start', 'summary', 'tabindex', 'title', 'type', 'usemap', 'valign', 'value', 'width', 'itemprop'])
const WEB = ['http', 'https']
const PROTOCOLS = { a: { href: [...WEB, 'mailto'] }, blockquote: { cite: WEB }, del: { cite: WEB }, ins: { cite: WEB }, q: { cite: WEB }, img: { src: WEB, longdesc: WEB } }
const REMOVE_CONTENTS = new Set(['iframe', 'math', 'noembed', 'noframes', 'noscript', 'plaintext', 'script', 'style', 'svg', 'xmp'])

// A URL without a scheme is relative, which GitHub allows. Control characters and spaces cannot hide a scheme.
function allowedUrl(value, protocols) {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec([...String(value)].filter((char) => char > ' ').join(''))
  return !scheme || protocols.includes(scheme[1].toLowerCase())
}

function cleanAttributes(tag, attributes) {
  const kept = {}
  for (const [key, value] of Object.entries(attributes || {})) {
    const name = key.toLowerCase()
    if (key === '$') kept.$ = value
    else if (!ALL.has(name) && !ATTRIBUTES[tag]?.includes(name)) continue
    else if (PROTOCOLS[tag]?.[name] && !allowedUrl(value, PROTOCOLS[tag][name])) continue
    // GitHub prefixes ids and names, so a comment cannot take an id the page uses or shadow a property of `document`.
    else kept[name] = name === 'id' || name === 'name' ? `user-content-${value}` : value
  }
  return kept
}

// Only HTML that the author wrote is filtered; the markdown parser makes the other elements itself.
function clean(nodes) {
  return nodes.flatMap((node) => {
    if (typeof node === 'string' || node[0] === null) return [node]
    const [tag, attributes, ...children] = node
    if (!attributes?.$?.html) return [[tag, attributes, ...clean(children)]]
    const name = String(tag).toLowerCase()
    if (REMOVE_CONTENTS.has(name)) return []
    if (!ELEMENTS.has(name)) return clean(children)
    return [[name, cleanAttributes(name, attributes), ...clean(children)]]
  })
}

// Get the comark plugin that filters HTML in markdown as GitHub does.
export const githubHtml = defineComarkPlugin(() => ({
  name: 'github-html',
  post(state) { state.tree.nodes = clean(state.tree.nodes) },
}))
