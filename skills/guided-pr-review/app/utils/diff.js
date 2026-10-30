import { state, LANGUAGE_BY_EXTENSION, PHPSTORM_EXTENSIONS } from './state.js'
import { hunkById, reviewCommentsOn } from './review.js'

// Get the rows of a hunk with their old and new line numbers.
export function diffRows(hunk) {
  const rows = []
  let oldLine = hunk.oldStart || 0
  let newLine = hunk.newStart || 0
  for (const text of hunk.lines) {
    const sign = text[0]
    if (sign === '\\') { rows.push({ kind: 'meta', text: text.slice(2) }); continue }
    // A hunk joined from several (--whole) keeps the header of each part; the lines between them did not change.
    const gap = text.startsWith('@@') && text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/)
    if (gap) {
      oldLine = Number(gap[1])
      newLine = Number(gap[2])
      rows.push({ kind: 'meta', gap: true, text: `⋯ unchanged lines skipped, continues at line ${newLine}` })
      continue
    }
    if (sign === '+') rows.push({ kind: 'add', newNo: newLine++, text: text.slice(1) })
    else if (sign === '-') rows.push({ kind: 'del', oldNo: oldLine++, text: text.slice(1) })
    else rows.push({ kind: 'ctx', oldNo: oldLine++, newNo: newLine++, text: text.slice(1) })
  }
  return rows
}

export function extensionOf(path) { return path.split('.').pop().toLowerCase() }

// Get the highlighter language for a file.
export function languageOf(path) {
  const extension = extensionOf(path)
  return LANGUAGE_BY_EXTENSION[extension] || extension
}

export function rowLocation(row) {
  const side = row.kind === 'del' ? 'LEFT' : 'RIGHT'
  return { side, line: side === 'LEFT' ? row.oldNo : row.newNo }
}

export function lineLabel(item) {
  return item.startLine && (item.startLine !== item.line || item.startSide !== item.side) ? `lines ${item.startLine}–${item.line}` : `line ${item.line}`
}

// A range keeps GitHub's shape: start_line/start_side for the first selected row, line/side for the last.
export function composerFor(hunk, fromIndex, toIndex) {
  const rows = diffRows(hunk)
  let [from, to] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
  // GitHub only accepts a range inside one part of the diff, so a range stops at a gap of skipped lines.
  const gap = rows.slice(from, to).findLastIndex((row) => row.gap)
  if (gap !== -1) from += gap + 1
  const [first, last] = [rows[from], rows[to]]
  const start = rowLocation(first)
  const end = rowLocation(last)
  return { hunkId: hunk.id, startLine: start.line, startSide: start.side, line: end.line, side: end.side }
}

// A hunk without line changes (a rename or a binary file) has no line to attach a remark to.
export function wholeHunkComposer(hunk) {
  const changed = diffRows(hunk).map((row, index) => (row.kind === 'add' || row.kind === 'del' ? index : -1)).filter((index) => index !== -1)
  return changed.length ? composerFor(hunk, changed[0], changed[changed.length - 1]) : null
}

export function rowIndexOf(rows, line, side) {
  return rows.findIndex((row) => row.kind !== 'meta' && rowLocation(row).line === line && rowLocation(row).side === side)
}

export function rowMatches(row, item) {
  if (item.side === 'LEFT') return row.oldNo === item.line && row.kind !== 'add'
  return row.newNo === item.line && row.kind !== 'del'
}

// Get the diff of one hunk: its rows, the notes on each row, the notes without a row, the rows the notes mark and the
// rows the composer selects. A note is { type: 'comment' | 'finding' | 'remark' | 'posted', item }.
export function hunkDiff(hunk) {
  const findings = state.review.findings.filter((finding) => finding.hunkId === hunk.id)
  const remarks = state.reviewer.remarks.filter((remark) => remark.hunkId === hunk.id)
  // Like GitHub: the count of added and removed lines, with the line ranges in the tooltip.
  const rows = hunk.lines.length ? diffRows(hunk) : []
  const added = rows.filter((row) => row.kind === 'add').length
  const removed = rows.filter((row) => row.kind === 'del').length
  const range = (start, count) => (count ? `lines ${start}–${start + count - 1}` : 'none')
  const ranges = `In this hunk: ${added} added and ${removed} removed. Old file: ${range(hunk.oldStart || 0, hunk.oldLines || 0)}. New file: ${range(hunk.newStart || 0, hunk.newLines || 0)}.`
  const posted = (state.review.ownRemarks || []).filter((own) => own.state === 'posted' && own.hunkId === hunk.id)
  const notes = [...reviewCommentsOn(hunk.id).map((comment) => ({ type: 'comment', item: comment })), ...findings.map((finding) => ({ type: 'finding', item: finding })), ...remarks.map((remark) => ({ type: 'remark', item: remark })), ...posted.map((own) => ({ type: 'posted', item: own }))]
  if (hunk.lines.length === 0) {
    const empty = hunk.binary ? 'This is a binary file. Open it on GitHub to compare.' : `No line changes: the file is ${hunk.status}.`
    return { rows, added, removed, ranges, empty, rowNotes: [], loose: notes, marks: new Map(), selected: null, composer: null, composerRow: -1 }
  }
  const placed = new Set()
  const composer = state.ui.composer && state.ui.composer.hunkId === hunk.id ? state.ui.composer : null
  const selected = composer ? [rowIndexOf(rows, composer.startLine ?? composer.line, composer.startSide ?? composer.side), rowIndexOf(rows, composer.line, composer.side)].sort((a, b) => a - b) : null
  // Every line a note covers is marked; the reviewer's own remarks get the stronger mark.
  const marks = new Map()
  for (const note of notes) {
    if (!note.item.line) continue
    const end = rows.findIndex((row) => rowMatches(row, note.item))
    const start = note.item.startLine ? rows.findIndex((row) => rowMatches(row, { line: note.item.startLine, side: note.item.startSide || note.item.side })) : end
    if (end === -1) continue
    const mine = note.type === 'remark' || note.type === 'posted'
    for (let index = Math.max(0, Math.min(start, end)); index <= end; index++) if (mine || !marks.has(index)) marks.set(index, mine ? 'noted-mine' : 'noted')
  }
  const rowNotes = rows.map((row) => {
    if (row.kind === 'meta') return []
    const attached = notes.filter((note) => !placed.has(note) && note.item.line && rowMatches(row, note.item))
    attached.forEach((note) => placed.add(note))
    return attached
  })
  const loose = notes.filter((note) => !placed.has(note))
  return { rows, added, removed, ranges, empty: null, rowNotes, loose, marks, selected, composer, composerRow: composer ? rowIndexOf(rows, composer.line, composer.side) : -1 }
}

export function firstChangedLine(hunk) {
  return diffRows(hunk).find((row) => row.kind === 'add')?.newNo || hunk.newStart
}

export function fileKept(hunk) { return hunk.status !== 'removed' && !hunk.binary }

// The editor links and the folder button need the local clone, which the agent names in pr.localPath.
export function editorTools(hunk) {
  const tools = []
  const root = state.review.pr.localPath
  if (root && fileKept(hunk)) {
    const full = `${root.replace(/[\\/]$/, '')}/${hunk.file}`
    const line = firstChangedLine(hunk)
    const onMac = /Mac/.test(navigator.userAgentData?.platform || navigator.platform)
    tools.push({ kind: 'vscode', label: 'VS Code', url: `vscode://file${encodeURI(full.startsWith('/') ? full : `/${full}`)}:${line}`, title: `Open in VS Code at line ${line}` })
    if (PHPSTORM_EXTENSIONS.includes(extensionOf(hunk.file))) tools.push({ kind: 'phpstorm', label: 'PhpStorm', url: `phpstorm://open?file=${encodeURIComponent(full)}&line=${line}`, title: `Open in PhpStorm at line ${line}` })
    tools.push({ kind: 'folder', label: onMac ? 'Show in Finder' : 'Open folder', file: hunk.file, title: 'Show the file in its folder' })
  }
  return tools
}

// The whole file at the head of the pull request. Every hunk of the file marks its added lines,
// and puts its removed lines back where they were. Each row is { kind: 'add' | 'del' | 'ctx', number, text }.
export function wholeFileRows(hunk, text) {
  const added = new Set()
  const removedBefore = new Map()
  for (const other of state.review.hunks.filter((candidate) => candidate.file === hunk.file && candidate.lines.length)) {
    // A hunk without new lines starts at the line before the removal.
    let next = other.newLines === 0 ? other.newStart + 1 : other.newStart
    for (const row of diffRows(other)) {
      if (row.kind === 'add') added.add(row.newNo)
      if (row.newNo) next = row.newNo + 1
      if (row.kind === 'del') removedBefore.set(next, [...(removedBefore.get(next) || []), row.text])
    }
  }
  const removed = (number) => (removedBefore.get(number) || []).map((removedText) => ({ kind: 'del', number: null, text: removedText }))
  const lines = text.replace(/\n$/, '').split('\n')
  return [...lines.flatMap((line, index) => [...removed(index + 1), { kind: added.has(index + 1) ? 'add' : 'ctx', number: index + 1, text: line }]), ...removed(lines.length + 1)]
}

// GitHub's diff hunk ends at the commented line, so its last lines show the code the comment is about.
export function threadCode(comment) {
  if (!comment.diffHunk) return null
  const [header, ...lines] = comment.diffHunk.split('\n')
  const [, oldStart, newStart] = header.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/)
  const rows = diffRows({ lines, oldStart: Number(oldStart), newStart: Number(newStart) }).filter((row) => row.kind !== 'meta').slice(-4)
  return {
    language: languageOf(comment.path || hunkById(comment.hunkId)?.file || ''),
    rows: rows.map((row) => ({ kind: row.kind, number: (row.kind === 'del' || (row.kind === 'ctx' && comment.side === 'LEFT') ? row.oldNo : row.newNo) || null, text: row.text })),
  }
}
