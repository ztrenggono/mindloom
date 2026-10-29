/**
 * Syntax colouring for the diagram-as-code editor, close to Eraser's: names blue,
 * keywords green, property keys yellow with green values, ERD types orange.
 * Line-based and forgiving, so half-typed code still colours sensibly.
 */
import { Fragment, type ReactNode } from 'react'
import type { DiagramType } from '../types'

const KEYWORDS = /^(title|direction|autoNumber|colorMode|styleMode|typeface|notation)\b/
const SEQ_ACT = /^(activate|deactivate)\b/
const BLOCK = /^(loop|alt|opt|par|break|critical|else|and)\b/
const OP = /(\s+(?:<>|-->|<--|>|<|--|-)\s+)/
const FLAGS = new Set(['pk', 'fk', 'unique', 'null', 'not', 'index'])

type Tok = [cls: string | null, text: string]

/** `[key: value, key: value]` */
function attrs(src: string): Tok[] {
  const out: Tok[] = [['tk-punct', '[']]
  const inner = src.slice(1, src.endsWith(']') ? -1 : undefined)
  inner.split(/(,)/).forEach((part) => {
    if (part === ',') return out.push([null, ','])
    const i = part.indexOf(':')
    if (i < 0) return out.push(['tk-key', part])
    out.push(['tk-key', part.slice(0, i)], [null, ':'], ['tk-val', part.slice(i + 1)])
  })
  if (src.endsWith(']')) out.push(['tk-punct', ']'])
  return out
}

/** A name, an optional `[props]` and an optional trailing `{`. */
function declaration(text: string, nameCls: string): Tok[] {
  const m = /^(.*?)(\s*)(\[[^\]]*\]?)?(\s*)(\{)?\s*$/.exec(text)!
  const out: Tok[] = [[nameCls, m[1]], [null, m[2]]]
  if (m[3]) out.push(...attrs(m[3]))
  out.push([null, m[4]])
  if (m[5]) out.push(['tk-punct', '{'])
  return out
}

/** `entity.attr`: entity blue, attribute plain. */
function ref(part: string): Tok[] {
  const m = /^(\s*)([^.\s]+)(\.\S+)?(.*)$/.exec(part)
  if (!m) return [[null, part]]
  return [
    [null, m[1]],
    ['tk-name', m[2]],
    [null, m[3] ?? ''],
    [null, m[4]],
  ]
}

function edge(text: string): Tok[] {
  const out: Tok[] = []
  let body = text
  let tail: Tok[] = []
  const am = /\s*\[[^\]]*\]?\s*$/.exec(body)
  if (am) {
    tail = attrs(am[0].trim())
    body = body.slice(0, am.index)
  }
  const parts = body.split(OP)
  parts.forEach((p, i) => {
    if (i % 2 === 1) return out.push(['tk-op', p])
    const li = i === parts.length - 1 ? p.indexOf(':') : -1
    if (li >= 0) {
      p.slice(0, li)
        .split(',')
        .forEach((x, j) => (j && out.push([null, ',']), out.push(...ref(x))))
      out.push([null, ':'], ['tk-label', p.slice(li + 1)])
    } else
      p.split(',').forEach((x, j) => {
        if (j) out.push([null, ','])
        out.push(...ref(x))
      })
  })
  if (tail.length) out.push([null, ' '], ...tail)
  return out
}

function erdColumn(text: string): Tok[] {
  const out: Tok[] = []
  const am = /\[[^\]]*\]?\s*$/.exec(text)
  const body = am ? text.slice(0, am.index) : text
  body.split(/(\s+)/).forEach((w, i) => {
    if (!w || /^\s+$/.test(w)) return out.push([null, w])
    if (i === 0) out.push(['tk-field', w])
    else if (FLAGS.has(w.toLowerCase())) out.push(['tk-flag', w])
    else if (i === 2) out.push(['tk-type', w])
    else out.push([null, w])
  })
  if (am) out.push(...attrs(am[0].trim()))
  return out
}

function tokenizeLine(raw: string, type: DiagramType, depth: number): Tok[] {
  const ci = raw.indexOf('//')
  const code = ci >= 0 ? raw.slice(0, ci) : raw
  const comment: Tok[] = ci >= 0 ? [['tk-comment', raw.slice(ci)]] : []
  const lead = /^\s*/.exec(code)![0]
  const text = code.slice(lead.length)
  const toks: Tok[] = [[null, lead]]
  let m: RegExpExecArray | null
  if (!text) {
    // blank or comment-only
  } else if ((m = KEYWORDS.exec(text))) {
    const rest = text.slice(m[0].length)
    toks.push(['tk-kw', m[0]], [m[0] === 'title' ? null : 'tk-val', rest])
  } else if (type === 'sequence' && (m = SEQ_ACT.exec(text))) {
    toks.push(['tk-kw', m[0]], ['tk-name', text.slice(m[0].length)])
  } else if (type === 'sequence' && (m = BLOCK.exec(text))) {
    toks.push(['tk-kw', m[0]], ...declaration(text.slice(m[0].length), 'tk-label'))
  } else if (/^}/.test(text)) {
    toks.push(['tk-punct', '}'], [null, text.slice(1)])
  } else if (OP.test(text)) {
    toks.push(...edge(text))
  } else if (type === 'erd' && depth > 0) {
    toks.push(...erdColumn(text))
  } else {
    toks.push(...declaration(text, 'tk-name'))
  }
  return [...toks, ...comment]
}

export function highlight(code: string, type: DiagramType): ReactNode[] {
  let depth = 0
  const lines = code.split('\n')
  return lines.map((line, i) => {
    const toks = tokenizeLine(line, type, depth)
    const bare = line.replace(/\/\/.*$/, '')
    depth = Math.max(0, depth + (bare.match(/\{/g)?.length ?? 0) - (bare.match(/\}/g)?.length ?? 0))
    // Plain text plus newlines inside a <pre>, so every line matches the textarea exactly.
    return (
      <Fragment key={i}>
        {toks.map(([cls, t], j) => (!t ? null : cls ? <span key={j} className={cls}>{t}</span> : t))}
        {i < lines.length - 1 && '\n'}
      </Fragment>
    )
  })
}
