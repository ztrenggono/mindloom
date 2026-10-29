/**
 * Conversion between this app's diagram code and Mermaid, so diagrams can be pasted into
 * GitHub, GitLab or Notion, and Mermaid diagrams brought in. Structure converts both ways;
 * icons and colours have no Mermaid equivalent and are dropped on export.
 */
import type { DiagramType } from '../types'
import { parseErd, parseFlow, parseMindmap, parseSequence, type MindNode, type SeqItem } from './parse'

/* ------------------------------------------ Export ------------------------------------------ */

export function toMermaid(type: DiagramType, code: string): string {
  if (type === 'erd') return erdToMermaid(code)
  if (type === 'sequence') return seqToMermaid(code)
  if (type === 'mindmap') return mindToMermaid(code)
  return flowToMermaid(code)
}

const frontmatter = (title?: string) => (title ? `---\ntitle: ${title}\n---\n` : '')
/** Mermaid labels are double-quoted; a quote inside one is written as an entity. */
const q = (s: string) => `"${s.replace(/"/g, '#quot;')}"`
/** Mermaid ids: letters, digits and underscores. */
const safeId = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || '_'

function idMaker() {
  const used = new Map<string, string>()
  const taken = new Set<string>()
  return (name: string) => {
    let id = used.get(name)
    if (id) return id
    const base = safeId(name)
    id = base
    for (let i = 2; taken.has(id); i++) id = `${base}_${i}`
    used.set(name, id)
    taken.add(id)
    return id
  }
}

function erdToMermaid(code: string) {
  const d = parseErd(code)
  const id = idMaker()
  const out = ['erDiagram']
  for (const e of d.entities.values()) {
    if (!e.columns.length) {
      out.push(`  ${id(e.name)}`)
      continue
    }
    out.push(`  ${id(e.name)} {`)
    for (const c of e.columns) {
      const keys = c.flags.flatMap((f) => (f === 'pk' ? ['PK'] : f === 'fk' ? ['FK'] : f === 'unique' ? ['UK'] : []))
      out.push(`    ${safeId(c.type || 'string')} ${safeId(c.name)}${keys.length ? ' ' + keys.join(', ') : ''}`)
    }
    out.push('  }')
  }
  const CARD: Record<string, string> = { '>': '}o--||', '<': '||--o{', '-': '||--||', '<>': '}o--o{' }
  for (const r of d.rels) {
    const cols = r.from.column || r.to.column ? `${r.from.column ?? r.from.entity} to ${r.to.column ?? r.to.entity}` : 'relates to'
    out.push(`  ${id(r.from.entity)} ${CARD[r.op] ?? '||--||'} ${id(r.to.entity)} : ${q(cols)}`)
  }
  return frontmatter(d.title) + out.join('\n') + '\n'
}

function flowToMermaid(code: string) {
  const d = parseFlow(code)
  const id = idMaker()
  const DIR = { down: 'TD', right: 'LR', up: 'BT', left: 'RL' } as const
  const out = [`flowchart ${DIR[d.direction]}`]
  const shape = (label: string, s: string) => {
    const l = q(label)
    if (s === 'oval' || s === 'ellipse') return `([${l}])`
    if (s === 'circle') return `((${l}))`
    if (s === 'diamond') return `{${l}}`
    if (s === 'cylinder') return `[(${l})]`
    return `[${l}]`
  }
  const nodeLine = (n: { id: string; label: string; shape: string }) => `${id(n.id)}${shape(n.label, n.shape)}`
  const emit = (parent: string | undefined, depth: number) => {
    const pad = '  '.repeat(depth)
    for (const g of d.groups.values()) {
      if (g.parent !== parent) continue
      out.push(`${pad}subgraph ${id(g.id)} [${q(g.label)}]`)
      emit(g.id, depth + 1)
      out.push(`${pad}end`)
    }
    for (const n of d.nodes.values()) if (n.group === parent) out.push(pad + nodeLine(n))
  }
  emit(undefined, 1)
  const ARROW: Record<string, string> = { '>': '-->', '<': '-->', '<>': '<-->', '-': '---', '--': '-.-', '-->': '-.->', '<--': '-.->' }
  for (const e of d.edges) {
    const back = e.op === '<' || e.op === '<--'
    const [a, b] = back ? [e.to, e.from] : [e.from, e.to]
    const arrow = ARROW[e.op] ?? '-->'
    out.push(`  ${id(a)} ${arrow}${e.label ? `|${q(e.label)}|` : ''} ${id(b)}`)
  }
  return frontmatter(d.title) + out.join('\n') + '\n'
}

function seqToMermaid(code: string) {
  const d = parseSequence(code)
  const id = idMaker()
  const out = ['sequenceDiagram']
  if (d.autoNumber) out.push('  autonumber')
  for (const p of d.participants) {
    const pid = id(p.name)
    out.push(pid === p.name ? `  participant ${pid}` : `  participant ${pid} as ${p.name}`)
  }
  const ARROW: Record<string, string> = { '>': '->>', '<': '->>', '-->': '-->>', '<--': '-->>', '-': '->', '--': '-->', '<>': '<<->>' }
  const walk = (items: SeqItem[], depth: number) => {
    const pad = '  '.repeat(depth)
    for (const it of items) {
      if (it.kind === 'msg') {
        const back = it.op === '<' || it.op === '<--'
        const [a, b] = back ? [it.to, it.from] : [it.from, it.to]
        out.push(`${pad}${id(a)}${ARROW[it.op] ?? '->>'}${id(b)}: ${it.label ?? ''}`.trimEnd())
      } else if (it.kind === 'act') out.push(`${pad}${it.on ? 'activate' : 'deactivate'} ${id(it.who)}`)
      else {
        it.sections.forEach((s, i) => {
          const kw = i === 0 ? it.type : it.type === 'par' ? 'and' : it.type === 'critical' ? 'option' : 'else'
          out.push(`${pad}${kw}${s.label ? ' ' + s.label : ''}`)
          walk(s.items, depth + 1)
        })
        out.push(`${pad}end`)
      }
    }
  }
  walk(d.items, 1)
  return frontmatter(d.title) + out.join('\n') + '\n'
}

function mindToMermaid(code: string) {
  const d = parseMindmap(code)
  // Mermaid mind maps have exactly one root.
  const roots: MindNode[] = d.roots.length === 1 ? d.roots : [{ label: d.title ?? 'Mind map', line: 0, depth: 0, children: d.roots }]
  const text = (s: string) => (/[()[\]{}]/.test(s) ? `[${q(s)}]` : s)
  const out = ['mindmap']
  const walk = (n: MindNode, depth: number, root: boolean) => {
    out.push('  '.repeat(depth) + (root ? `root((${q(n.label)}))` : text(n.label)))
    n.children.forEach((c) => walk(c, depth + 1, false))
  }
  roots.forEach((r) => walk(r, 1, true))
  return frontmatter(d.title) + out.join('\n') + '\n'
}

/* ------------------------------------------ Import ------------------------------------------ */

export interface Imported {
  type: DiagramType
  code: string
  title?: string
}

/** Converts Mermaid source, or returns null for a diagram kind this app cannot draw. */
export function fromMermaid(src: string): Imported | null {
  let text = src.replace(/\r\n?/g, '\n')
  let title: string | undefined
  const fm = /^\s*---\n([\s\S]*?)\n---\s*\n/.exec(text)
  if (fm) {
    title = /^title:\s*(.+)$/m.exec(fm[1])?.[1].trim().replace(/^["']|["']$/g, '')
    text = text.slice(fm[0].length)
  }
  const lines = text
    .split('\n')
    .map((l) => l.replace(/%%.*$/, ''))
    .filter((l) => l.trim())
  const head = lines.shift()?.trim() ?? ''
  const withTitle = (type: DiagramType, body: string): Imported => ({ type, title, code: (title ? `title ${title}\n\n` : '') + body.trimEnd() + '\n' })
  if (/^erDiagram\b/.test(head)) return withTitle('erd', erdFrom(lines))
  if (/^sequenceDiagram\b/.test(head)) return withTitle('sequence', seqFrom(lines))
  if (/^mindmap\b/.test(head)) return withTitle('mindmap', mindFrom(lines))
  const flow = /^(?:flowchart|graph)\b\s*(\w+)?/.exec(head)
  if (flow) return withTitle('flowchart', flowFrom(lines, flow[1]))
  return null
}

const unq = (s: string) => s.trim().replace(/^"(.*)"$/, '$1').replace(/#quot;/g, '"')
/** Attribute values cannot hold commas or brackets in this app's syntax. */
const attrSafe = (s: string) => s.replace(/[,[\]]/g, ' ').replace(/\s+/g, ' ').trim()

function erdFrom(lines: string[]) {
  const out: string[] = []
  const rels: string[] = []
  let open = false
  for (const raw of lines) {
    const t = raw.trim()
    if (open) {
      if (t === '}') {
        out.push('}', '')
        open = false
        continue
      }
      const m = /^([\w-]+(?:\[\])?)\s+([\w-]+)\s*((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?/.exec(t)
      if (!m) continue
      const flags = (m[3] ?? '').split(/\s*,\s*/).filter(Boolean).map((k) => (k === 'PK' ? 'pk' : k === 'FK' ? 'fk' : 'unique'))
      out.push(`  ${m[2]} ${m[1].replace('[]', '')}${flags.length ? ' ' + flags.join(' ') : ''}`)
      continue
    }
    let m = /^([\w-]+)(?:\s*\[[^\]]*\])?\s*\{\s*$/.exec(t)
    if (m) {
      out.push(`${m[1]} {`)
      open = true
      continue
    }
    m = /^([\w-]+)\s+([|}][|o]|[|o][|}])(--|\.\.)([|o][|{]|[|{][|o])\s+([\w-]+)/.exec(t)
    if (m) {
      const leftMany = m[2].startsWith('}')
      const rightMany = m[4].endsWith('{')
      const op = leftMany && rightMany ? '<>' : leftMany ? '>' : rightMany ? '<' : '-'
      rels.push(`${m[1]} ${op} ${m[5]}`)
      continue
    }
    m = /^([\w-]+)\s*$/.exec(t)
    if (m) out.push(m[1], '')
  }
  return [...out, ...rels].join('\n')
}

interface FlowNodeIn {
  id: string
  label: string
  shape: string
  group?: string
}

function flowFrom(lines: string[], dir = 'TD') {
  const DIR: Record<string, string> = { TD: 'down', TB: 'down', BT: 'up', LR: 'right', RL: 'left' }
  const nodes = new Map<string, FlowNodeIn>()
  const groups: { id: string; label: string; parent?: string }[] = []
  const edges: { from: string; to: string; op: string; label?: string }[] = []
  const stack: string[] = []

  const SHAPES: [RegExp, string][] = [
    [/^\(\[([\s\S]*)\]\)$/, 'oval'],
    [/^\[\(([\s\S]*)\)\]$/, 'cylinder'],
    [/^\(\(\(([\s\S]*)\)\)\)$/, 'circle'],
    [/^\(\(([\s\S]*)\)\)$/, 'circle'],
    [/^\{\{([\s\S]*)\}\}$/, 'rectangle'],
    [/^\{([\s\S]*)\}$/, 'diamond'],
    [/^\[\[([\s\S]*)\]\]$/, 'rectangle'],
    [/^\[[/\\]([\s\S]*)[/\\]\]$/, 'rectangle'],
    [/^\[([\s\S]*)\]$/, 'rectangle'],
    [/^\(([\s\S]*)\)$/, 'oval'],
    [/^>([\s\S]*)\]$/, 'rectangle'],
  ]
  const declare = (id: string, body?: string) => {
    let n = nodes.get(id)
    if (!n) {
      // A subgraph id used as an edge end refers to the group, not a new node.
      if (groups.some((g) => g.id === id)) return id
      n = { id, label: id, shape: 'rectangle', group: stack.at(-1) }
      nodes.set(id, n)
    } else if (stack.length) n.group = stack.at(-1) // Like Mermaid: listing a node in a subgraph moves it there.
    if (body) {
      for (const [re, shape] of SHAPES) {
        const m = re.exec(body)
        if (m) {
          n.label = unq(m[1])
          n.shape = shape
          break
        }
      }
    }
    return id
  }

  // One node reference: an id, optionally followed by a bracketed shape and label.
  const NODE = /^\s*([\w.-]+)\s*((?:\(\[|\[\(|\(\(\(|\(\(|\{\{|\[\[|\[[/\\]|\[|\(|\{|>)(?:"[^"]*"|[^"])*?(?:\]\)|\)\]|\)\)\)|\)\)|\}\}|\]\]|[/\\]\]|\]|\)|\}))?(:::\w+)?/
  const LINK = /^\s*(<)?(-{2,}|={2,}|-?\.+-?)(>|o|x)?(?:\|([^|]*)\|)?/
  const LINK_TEXT = /^\s*(<)?(--|==|-\.)\s+(.+?)\s+(-{2,}|={2,}|\.+-)(>|o|x)?/

  const statement = (s: string) => {
    let rest = s
    let prev: string[] | null = null
    let pending: { op: string; label?: string } | null = null
    while (rest.trim()) {
      const ids: string[] = []
      for (;;) {
        const m = NODE.exec(rest)
        if (!m) return
        ids.push(declare(m[1], m[2]))
        rest = rest.slice(m[0].length)
        const amp = /^\s*&/.exec(rest)
        if (!amp) break
        rest = rest.slice(amp[0].length)
      }
      if (prev && pending) for (const f of prev) for (const t of ids) edges.push({ from: f, to: t, ...pending })
      prev = ids
      const lt = LINK_TEXT.exec(rest)
      const l = lt ? null : LINK.exec(rest)
      if (!lt && !l) return
      const both = !!(lt ?? l)![1]
      const line = lt ? lt[2] : l![2]
      const head = lt ? lt[5] : l![3]
      const dotted = line.includes('.')
      const arrow = !!head
      const op = both ? (dotted ? '<--' : '<>') : dotted ? (arrow ? '-->' : '--') : arrow ? '>' : '-'
      // "<-.->" has no dotted two-way form here, so it becomes a plain two-way link.
      pending = { op: both && dotted ? '<>' : op, label: lt ? unq(lt[3]) : l![4] ? unq(l![4]) : undefined }
      rest = rest.slice((lt ?? l)![0].length)
    }
  }

  for (const raw of lines) {
    const t = raw.trim()
    const m = /^subgraph\s+([\w.-]+)?\s*(?:\[(.*)\])?\s*(.*)$/.exec(t)
    if (m) {
      const gid = m[1] ?? `group${groups.length + 1}`
      const label = unq(m[2] ?? (m[3] || gid))
      groups.push({ id: gid, label, parent: stack.at(-1) })
      stack.push(gid)
      continue
    }
    if (t === 'end') {
      stack.pop()
      continue
    }
    if (/^(direction|classDef|class|style|linkStyle|click)\b/.test(t)) continue
    for (const s of t.split(';')) if (s.trim()) statement(s)
  }

  // Names in this app are what the diagram shows, so use the label when it is unique and plain.
  const labels = new Map<string, number>()
  for (const n of nodes.values()) labels.set(n.label, (labels.get(n.label) ?? 0) + 1)
  const groupLabels = new Set(groups.map((g) => g.label))
  const plain = (s: string) => !/[[\]{}:,"]|\s(>|<|-|--|<>|-->|<--)\s/.test(s) && !/^(title|direction)\b/i.test(s)
  const nameOf = new Map<string, string>()
  const groupName = new Map<string, string>()
  for (const g of groups) groupName.set(g.id, plain(g.label) && !nodes.has(g.label) ? g.label : g.id)
  for (const n of nodes.values()) {
    const ok = plain(n.label) && labels.get(n.label) === 1 && !groupLabels.has(n.label)
    nameOf.set(n.id, ok ? n.label : n.id)
  }
  const ref = (id: string) => nameOf.get(id) ?? groupName.get(id) ?? id
  const decl = (n: FlowNodeIn) => {
    const attrs = [n.shape !== 'rectangle' && `shape: ${n.shape}`, nameOf.get(n.id) !== n.label && `label: ${attrSafe(n.label)}`].filter(Boolean)
    return ref(n.id) + (attrs.length ? ` [${attrs.join(', ')}]` : '')
  }

  const out = [`direction ${DIR[dir.toUpperCase()] ?? 'down'}`, '']
  const emit = (parent: string | undefined, depth: number) => {
    const pad = '  '.repeat(depth)
    for (const g of groups) {
      if (g.parent !== parent) continue
      const name = groupName.get(g.id)!
      out.push(`${pad}${name}${name !== g.label ? ` [label: ${attrSafe(g.label)}]` : ''} {`)
      emit(g.id, depth + 1)
      out.push(`${pad}}`)
    }
    for (const n of nodes.values()) if (n.group === parent) out.push(pad + decl(n))
  }
  emit(undefined, 0)
  out.push('')
  for (const e of edges) out.push(`${ref(e.from)} ${e.op} ${ref(e.to)}${e.label ? `: ${e.label}` : ''}`)
  return out.join('\n')
}

function seqFrom(lines: string[]) {
  const names = new Map<string, string>()
  const out: string[] = []
  // Mermaid closes every block with "end"; "rect" and "box" have no equivalent and are skipped.
  const blocks: boolean[] = []
  let depth = 0
  const pad = () => '  '.repeat(depth)
  const name = (id: string) => names.get(id) ?? id
  const label = (s?: string) => (s?.trim() ? ` [label: ${attrSafe(s)}]` : '')

  for (const raw of lines) {
    const t = raw.trim()
    let m: RegExpExecArray | null
    if (/^autonumber\b/.test(t)) {
      out.unshift('autoNumber on')
      continue
    }
    if ((m = /^(?:participant|actor)\s+(\S+?)(?:\s+as\s+(.+))?$/.exec(t))) {
      const display = m[2] ? unq(m[2]) : m[1]
      names.set(m[1], display)
      out.push(display)
      continue
    }
    if ((m = /^(activate|deactivate)\s+(\S+)$/.exec(t))) {
      out.push(`${pad()}${m[1]} ${name(m[2])}`)
      continue
    }
    if ((m = /^(loop|alt|opt|par|break|critical)\b\s*(.*)$/.exec(t))) {
      out.push(`${pad()}${m[1]}${label(m[2])} {`)
      blocks.push(true)
      depth++
      continue
    }
    if ((m = /^(else|and|option)\b\s*(.*)$/.exec(t))) {
      depth--
      out.push(`${pad()}}`, `${pad()}${m[1] === 'and' ? 'and' : 'else'}${label(m[2])} {`)
      depth++
      continue
    }
    if (/^(rect|box)\b/.test(t)) {
      blocks.push(false)
      continue
    }
    if (t === 'end') {
      if (blocks.pop()) {
        depth--
        out.push(`${pad()}}`)
      }
      continue
    }
    if ((m = /^([^\s:<>+-]+)\s*(<<-->>|<<->>|-->>|->>|-->|->|--x|-x|--\))(\+|-)?\s*([^\s:]+)\s*:?\s*(.*)$/.exec(t))) {
      const [, a, arrow, act, b, text] = m
      const op = arrow.startsWith('<<') ? '<>' : arrow.startsWith('--') ? '-->' : '>'
      out.push(`${pad()}${name(a)} ${op} ${name(b)}${text.trim() ? `: ${text.trim()}` : ''}`)
      if (act === '+') out.push(`${pad()}activate ${name(b)}`)
      if (act === '-') out.push(`${pad()}deactivate ${name(a)}`)
    }
    // Notes and other Mermaid-only statements have no equivalent and are left out.
  }
  return out.join('\n')
}

function mindFrom(lines: string[]) {
  const out: string[] = []
  const indents: number[] = []
  for (const raw of lines) {
    const t = raw.trim()
    if (t.startsWith('::icon') || t.startsWith(':::')) continue
    const indent = raw.length - raw.trimStart().length
    while (indents.length && indents[indents.length - 1] >= indent) indents.pop()
    const depth = indents.length
    indents.push(indent)
    const m = /^(?:[\w-]+)?\s*(?:\(\(|\)\)|\(-|\{\{|\(|\[|\))(.*?)(?:\)\)|\(\(|-\)|\}\}|\)|\]|\()$/.exec(t)
    const label = attrSafe(unq(m ? m[1] : t)).replace(/^`|`$/g, '')
    out.push('  '.repeat(depth) + label)
  }
  return out.join('\n')
}

/** Rewrites ```mermaid fences in a Markdown note as this app's diagram fences where possible. */
export function convertMermaidFences(md: string) {
  return md.replace(/^```mermaid[^\n]*\n([\s\S]*?)^```[ \t]*$/gm, (whole, body: string) => {
    const r = fromMermaid(body)
    return r ? '```' + r.type + '\n' + r.code + '```' : whole
  })
}
