import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { DiagramType } from '../types'
import { escapeAttr, wikiToHtml } from './links'

marked.setOptions({ gfm: true, breaks: false })

export type Segment = { kind: 'html'; html: string } | { kind: 'diagram'; type: DiagramType; code: string }

const FENCE = /^```(erd|flowchart|sequence|cloud)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm

/** Splits a note into rendered HTML and live diagram blocks. */
export function renderNote(md: string): Segment[] {
  const out: Segment[] = []
  const ctr = { n: 0 }
  let last = 0
  for (const m of md.matchAll(FENCE)) {
    if (m.index! > last) out.push({ kind: 'html', html: toHtml(md.slice(last, m.index), ctr) })
    out.push({ kind: 'diagram', type: m[1] as DiagramType, code: m[2] })
    last = m.index! + m[0].length
  }
  if (last < md.length) out.push({ kind: 'html', html: toHtml(md.slice(last), ctr) })
  return out
}

/** Applies Obsidian syntax (wikilinks, tags, highlights) outside of code, then markdown. */
function toHtml(md: string, ctr: { n: number }): string {
  const parts = md.split(/(```[\s\S]*?```|`[^`\n]*`)/g)
  const pre = parts
    .map((p, i) => {
      if (i % 2) return p
      return wikiToHtml(p)
        .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
        .replace(/(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu, (_, s: string, t: string) => `${s}<a class="tag" data-tag="${escapeAttr(t)}">#${t}</a>`)
    })
    .join('')
  let html = marked.parse(pre, { async: false }) as string
  html = html.replace(
    /<blockquote>\s*<p>\[!(\w+)\]([+-]?)\s*([^\n<]*)(?:\n|<br>)?([\s\S]*?)<\/blockquote>/g,
    (_, type: string, _fold: string, title: string, body: string) =>
      `<div class="callout" data-callout="${type.toLowerCase()}"><div class="callout-title">${title || cap(type)}</div><div class="callout-content"><p>${body}</div></div>`,
  )
  html = html.replace(/<input (checked="" )?disabled="" type="checkbox">/g, (_, c) => `<input type="checkbox" data-task="${ctr.n++}" ${c ? 'checked' : ''}>`)
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1)
}

/** Toggles the nth task checkbox in the source. */
export function toggleTask(md: string, index: number): string {
  let i = 0
  return md.replace(/^(\s*[-*+] \[)( |x|X)(\])/gm, (m, a, c, b) => (i++ === index ? `${a}${c === ' ' ? 'x' : ' '}${b}` : m))
}

export function wordCount(md: string) {
  return (md.replace(/```[\s\S]*?```/g, '').match(/[\p{L}\p{N}]+/gu) ?? []).length
}
