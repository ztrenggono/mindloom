/**
 * Checks diagram code beyond what the parser rejects: references to tables or columns that
 * do not exist, likely typos, unknown icons, colours and properties, and links to missing notes.
 */
import type { DiagramType } from '../types'
import { parseAttrs, parseErd, parseFlow, parseMindmap, parseSequence, type ParseError, type SeqItem } from './parse'
import { iconFor } from './shared'
import { logoFor } from './logos'

export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  line: number
  severity: Severity
  message: string
}

const COLORS = new Set(['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray', 'grey', 'black', 'white'])
const SHAPES = new Set(['rectangle', 'oval', 'ellipse', 'diamond', 'circle', 'cylinder'])
const PROPS: Record<DiagramType, Set<string>> = {
  erd: new Set(['icon', 'color', 'link']),
  flowchart: new Set(['shape', 'icon', 'color', 'label', 'link']),
  cloud: new Set(['shape', 'icon', 'color', 'label', 'link']),
  sequence: new Set(['icon', 'color', 'label', 'link']),
  mindmap: new Set(['icon', 'color', 'label', 'link']),
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '')

/** `titles` are the vault's note titles, used to flag `link:` targets that do not exist yet. */
export function lintDiagram(type: DiagramType, code: string, titles: string[] = []): Issue[] {
  const out: Issue[] = []
  const add = (line: number | undefined, severity: Severity, message: string) => line && out.push({ line, severity, message })
  const known = new Set(titles.map((t) => t.toLowerCase()))

  // Property blocks, checked line by line so every `[...]` is covered whatever it belongs to.
  let depth = 0
  code.split('\n').forEach((raw, i) => {
    const line = i + 1
    const text = raw.replace(/\/\/.*$/, '')
    const inBody = type === 'erd' && depth > 0
    depth = Math.max(0, depth + (text.match(/\{/g)?.length ?? 0) - (text.match(/\}/g)?.length ?? 0))
    if (inBody) return
    for (const m of text.matchAll(/\[([^\]]*)\]/g)) {
      const attrs = parseAttrs(m[1])
      for (const [k, v] of Object.entries(attrs)) {
        if (!PROPS[type].has(k)) add(line, 'warning', `Unknown property "${k}"`)
        else if (k === 'icon' && !logoFor(v) && !iconFor(v)) add(line, 'warning', `Unknown icon "${v}"`)
        else if (k === 'color' && !COLORS.has(v.toLowerCase()) && !/^#[0-9a-f]{3,8}$|^rgb/i.test(v)) add(line, 'warning', `Unknown color "${v}"`)
        else if (k === 'shape' && !SHAPES.has(v.toLowerCase())) add(line, 'warning', `Shape "${v}" is drawn as a rectangle`)
        else if (k === 'link' && titles.length && !known.has(v.replace(/^"(.*)"$/, '$1').trim().toLowerCase()))
          add(line, 'info', `No note named "${v}" yet; opening the link creates it`)
      }
    }
  })

  let errors: ParseError[] = []
  if (type === 'erd') {
    const d = parseErd(code)
    errors = d.errors
    for (const r of d.rels) {
      for (const end of [r.from, r.to]) {
        const e = d.entities.get(end.entity)!
        if (e.line == null) add(r.line, 'warning', `Table "${end.entity}" is not defined`)
        else if (end.column && e.columns.length && !e.columns.some((c) => c.name === end.column))
          add(r.line, 'warning', `Column "${end.entity}.${end.column}" does not exist`)
      }
    }
    for (const e of d.entities.values()) {
      const seen = new Set<string>()
      for (const c of e.columns) {
        if (seen.has(c.name)) add(c.line, 'warning', `Duplicate column "${c.name}" in "${e.name}"`)
        seen.add(c.name)
      }
      if (e.line != null && !e.columns.length && !d.rels.some((r) => r.from.entity === e.name || r.to.entity === e.name))
        add(e.line, 'info', `"${e.name}" has no columns or relationships`)
    }
  } else if (type === 'sequence') {
    const d = parseSequence(code)
    errors = d.errors
    const used = new Set<string>()
    const active = new Map<string, number>()
    const walk = (items: SeqItem[]) => {
      for (const it of items) {
        if (it.kind === 'msg') used.add(it.from).add(it.to)
        else if (it.kind === 'act') {
          const n = active.get(it.who) ?? 0
          if (!it.on && n === 0) add(it.line, 'warning', `"${it.who}" is deactivated without being activated`)
          active.set(it.who, Math.max(0, n + (it.on ? 1 : -1)))
        } else it.sections.forEach((s) => walk(s.items))
      }
    }
    walk(d.items)
    for (const p of d.participants) if (!used.has(p.name)) add(p.line, 'info', `"${p.name}" never sends or receives a message`)
    nearDuplicates(d.participants.map((p) => ({ name: p.name, line: p.line })), add)
  } else if (type === 'mindmap') {
    const d = parseMindmap(code)
    errors = d.errors
    if (d.roots.length > 1) for (const r of d.roots.slice(1)) add(r.line, 'info', `Second root "${r.label}"; indent it to make it a branch`)
  } else {
    const d = parseFlow(code)
    errors = d.errors
    const linked = new Set(d.edges.flatMap((e) => [e.from, e.to]))
    if (d.edges.length)
      for (const n of d.nodes.values()) if (!linked.has(n.id)) add(n.line, 'info', `"${n.id}" is not connected to anything`)
    nearDuplicates([...d.nodes.values()].map((n) => ({ name: n.id, line: n.line })), add)
  }

  for (const e of errors) out.push({ line: e.line, severity: 'error', message: e.message })
  // Line 0 (whole-file) problems first, then by line.
  return out.sort((a, b) => a.line - b.line || rank(a.severity) - rank(b.severity))
}

const rank = (s: Severity) => (s === 'error' ? 0 : s === 'warning' ? 1 : 2)

/** Names that differ only in case, spaces or dashes are almost always typos. */
function nearDuplicates(items: { name: string; line?: number }[], add: (line: number | undefined, s: Severity, m: string) => void) {
  const first = new Map<string, string>()
  for (const it of items) {
    const k = norm(it.name)
    const prev = first.get(k)
    if (prev && prev !== it.name) add(it.line, 'warning', `"${it.name}" looks like a typo of "${prev}"`)
    else if (!prev) first.set(k, it.name)
  }
}
