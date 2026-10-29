/**
 * Semantic diff of two versions of a diagram: what was added, removed or changed, by name
 * rather than by text, so reordering or reformatting the code is not reported as a change.
 * Marks are keyed by source line, which the renderers expose as `data-line`.
 */
import type { DiagramType } from '../types'
import { parseErd, parseFlow, parseMindmap, parseSequence, type ErdRel, type MindNode, type SeqItem } from './parse'

export type Mark = 'added' | 'removed' | 'changed'

export interface Change {
  kind: Mark
  what: string
  detail?: string
}

export interface DiffResult {
  changes: Change[]
  /** Marks for the old version (removed, changed) and the new one (added, changed). */
  before: Record<number, Mark>
  after: Record<number, Mark>
}

export function diffDiagrams(type: DiagramType, oldCode: string, newCode: string): DiffResult {
  const r: DiffResult = { changes: [], before: {}, after: {} }
  const mark = (side: Record<number, Mark>, line: number | undefined, m: Mark) => {
    if (line && !side[line]) side[line] = m
  }
  const added = (what: string, line?: number, detail?: string) => (r.changes.push({ kind: 'added', what, detail }), mark(r.after, line, 'added'))
  const removed = (what: string, line?: number, detail?: string) => (r.changes.push({ kind: 'removed', what, detail }), mark(r.before, line, 'removed'))
  const changed = (what: string, detail: string, oldLine?: number, newLine?: number) => {
    r.changes.push({ kind: 'changed', what, detail })
    mark(r.before, oldLine, 'changed')
    mark(r.after, newLine, 'changed')
  }

  /** Compares named items and reports property changes as "a → b". */
  const byName = <T>(label: string, a: Map<string, T>, b: Map<string, T>, line: (x: T) => number | undefined, props: (x: T) => Record<string, string | undefined>) => {
    for (const [k, x] of a) if (!b.has(k)) removed(`${label} ${k}`, line(x))
    for (const [k, y] of b) {
      const x = a.get(k)
      if (!x) {
        added(`${label} ${k}`, line(y))
        continue
      }
      const pa = props(x)
      const pb = props(y)
      const diffs = Object.keys({ ...pa, ...pb })
        .filter((p) => (pa[p] ?? '') !== (pb[p] ?? ''))
        .map((p) => `${p}: ${pa[p] || '—'} → ${pb[p] || '—'}`)
      if (diffs.length) changed(`${label} ${k}`, diffs.join(', '), line(x), line(y))
    }
  }

  /** Items keyed by an identity string; a matching key with different details counts as changed. */
  const byKey = <T>(label: string, a: T[], b: T[], key: (x: T) => string, line: (x: T) => number, detail: (x: T) => string = () => '') => {
    const left = new Map<string, T[]>()
    for (const x of a) left.set(key(x), [...(left.get(key(x)) ?? []), x])
    for (const y of b) {
      const k = key(y)
      const x = left.get(k)?.shift()
      if (!x) added(`${label} ${k}`, line(y), detail(y) || undefined)
      else if (detail(x) !== detail(y)) changed(`${label} ${k}`, `${detail(x) || '—'} → ${detail(y) || '—'}`, line(x), line(y))
    }
    for (const [k, rest] of left) for (const x of rest) removed(`${label} ${k}`, line(x), detail(x) || undefined)
  }

  if (type === 'erd') {
    const a = parseErd(oldCode)
    const b = parseErd(newCode)
    const declared = (m: typeof a.entities) => new Map([...m].filter(([, e]) => e.line != null))
    byName('Table', declared(a.entities), declared(b.entities), (e) => e.line, (e) => ({ icon: e.icon, color: e.color, link: e.link }))
    for (const [name, eb] of b.entities) {
      const ea = a.entities.get(name)
      if (!ea || ea.line == null || eb.line == null) continue
      const cols = (e: typeof eb) => new Map(e.columns.map((c) => [`${name}.${c.name}`, c]))
      byName('Column', cols(ea), cols(eb), (c) => c.line, (c) => ({ type: c.type, flags: c.flags.join(' ') }))
    }
    byKey('Relationship', a.rels, b.rels, relKey, (x) => x.line)
  } else if (type === 'sequence') {
    const a = parseSequence(oldCode)
    const b = parseSequence(newCode)
    const ps = (d: typeof a) => new Map(d.participants.map((p) => [p.name, p]))
    byName('Participant', ps(a), ps(b), (p) => p.line, (p) => ({ icon: p.icon, color: p.color, link: p.link }))
    // Messages are an ordered script, so match them by longest common subsequence.
    const sa = steps(a.items)
    const sb = steps(b.items)
    const keep = lcs(sa.map((s) => s.key), sb.map((s) => s.key))
    sa.forEach((s, i) => !keep.a.has(i) && removed(s.what, s.line))
    sb.forEach((s, i) => !keep.b.has(i) && added(s.what, s.line))
  } else if (type === 'mindmap') {
    const paths = (code: string) => {
      const m = new Map<string, MindNode>()
      const walk = (n: MindNode, prefix: string) => {
        const p = prefix ? `${prefix} / ${n.label}` : n.label
        m.set(p, n)
        n.children.forEach((c) => walk(c, p))
      }
      parseMindmap(code).roots.forEach((n) => walk(n, ''))
      return m
    }
    byName('Topic', paths(oldCode), paths(newCode), (n) => n.line, (n) => ({ icon: n.icon, color: n.color, link: n.link }))
  } else {
    const a = parseFlow(oldCode)
    const b = parseFlow(newCode)
    byName('Group', a.groups, b.groups, (g) => g.line, (g) => ({ label: g.label, color: g.color, icon: g.icon, parent: g.parent }))
    byName('Node', a.nodes, b.nodes, (n) => n.line, (n) => ({ label: n.label, shape: n.shape, icon: n.icon, color: n.color, group: n.group, link: n.link }))
    byKey(
      'Connection',
      a.edges,
      b.edges,
      (e) => {
        // "a < b" is the same connection as "b > a".
        const back = e.op === '<' || e.op === '<--'
        return back ? `${e.to} ${e.op === '<' ? '>' : '-->'} ${e.from}` : `${e.from} ${e.op} ${e.to}`
      },
      (e) => e.line,
      (e) => [e.label, e.color && `color ${e.color}`].filter(Boolean).join(', '),
    )
  }
  return r
}

function relKey(r: ErdRel) {
  const end = (x: ErdRel['from']) => (x.column ? `${x.entity}.${x.column}` : x.entity)
  if (r.op === '<') return `${end(r.to)} > ${end(r.from)}`
  if (r.op === '-' || r.op === '<>') return [end(r.from), end(r.to)].sort().join(` ${r.op} `)
  return `${end(r.from)} ${r.op} ${end(r.to)}`
}

function steps(items: SeqItem[]) {
  const out: { key: string; what: string; line: number }[] = []
  const walk = (list: SeqItem[]) => {
    for (const it of list) {
      if (it.kind === 'msg') {
        const what = `Message ${it.from} ${it.op} ${it.to}${it.label ? `: ${it.label}` : ''}`
        out.push({ key: what, what, line: it.line })
      } else if (it.kind === 'block') {
        const what = `Block ${it.type}${it.sections[0]?.label ? ` [${it.sections[0].label}]` : ''}`
        out.push({ key: what, what, line: it.line })
        it.sections.forEach((s) => walk(s.items))
      }
    }
  }
  walk(items)
  return out
}

/** Indexes of `a` and `b` that belong to a longest common subsequence. */
function lcs(a: string[], b: string[]) {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  const keep = { a: new Set<number>(), b: new Set<number>() }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      keep.a.add(i++)
      keep.b.add(j++)
    } else if (t[i + 1][j] >= t[i][j + 1]) i++
    else j++
  }
  return keep
}
