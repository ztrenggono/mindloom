/**
 * Parsers for the diagram-as-code languages. The syntax follows Eraser's DSL closely
 * so code copied from Eraser renders here unchanged.
 */

export type Attrs = Record<string, string>

export function parseAttrs(src?: string): Attrs {
  const out: Attrs = {}
  if (!src) return out
  for (const part of src.split(',')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim()
  }
  return out
}

/** Splits `Name [k: v, ...]` into its name and attribute block. */
function nameAndAttrs(s: string): { name: string; attrs: Attrs } {
  const m = /^(.*?)\s*(?:\[([^\]]*)\])?\s*$/.exec(s.trim())!
  return { name: unquote(m[1].trim()), attrs: parseAttrs(m[2]) }
}

function unquote(s: string) {
  return s.replace(/^"(.*)"$/, '$1')
}

function lines(code: string) {
  return code
    .split('\n')
    .map((l, i) => ({ text: l.replace(/\/\/.*$/, '').trim(), line: i + 1 }))
    .filter((l) => l.text)
}

// Operators must have whitespace on both sides so names like "well-specced" survive.
const OP = /\s+(<>|-->|<--|>|<|--|-)\s+/

export interface ParseError {
  line: number
  message: string
}

/* ---------------------------------- Flowchart / cloud ---------------------------------- */

export interface FlowNode {
  id: string
  label: string
  shape: string
  icon?: string
  color?: string
  group?: string
  /** Title of a note this node opens, from `link: Note title`. */
  link?: string
  /** Declaration line, or the first edge that mentions it. */
  line?: number
}
export interface FlowGroup {
  id: string
  label: string
  color?: string
  icon?: string
  parent?: string
  line: number
}
export interface FlowEdge {
  from: string
  to: string
  label?: string
  op: string
  color?: string
  line: number
}
export interface FlowDiagram {
  title?: string
  direction: 'right' | 'left' | 'down' | 'up'
  nodes: Map<string, FlowNode>
  groups: Map<string, FlowGroup>
  edges: FlowEdge[]
  errors: ParseError[]
}

export function parseFlow(code: string): FlowDiagram {
  const d: FlowDiagram = { direction: 'down', nodes: new Map(), groups: new Map(), edges: [], errors: [] }
  const stack: string[] = []

  const ensureNode = (name: string, line: number) => {
    if (!d.nodes.has(name) && !d.groups.has(name)) {
      d.nodes.set(name, { id: name, label: name, shape: 'rectangle', group: stack.at(-1), line })
    }
  }

  for (const { text, line } of lines(code)) {
    let m: RegExpExecArray | null
    if ((m = /^direction\s+(right|left|down|up)$/i.exec(text))) {
      d.direction = m[1].toLowerCase() as FlowDiagram['direction']
      continue
    }
    if ((m = /^title\s+(.+)$/i.exec(text))) {
      d.title = m[1]
      continue
    }
    if (/^(colorMode|styleMode|typeface)\b/i.test(text)) continue
    if (text === '}') {
      if (!stack.pop()) d.errors.push({ line, message: 'Unexpected "}"' })
      continue
    }
    if (text.endsWith('{')) {
      const { name, attrs } = nameAndAttrs(text.slice(0, -1))
      d.groups.set(name, { id: name, label: attrs.label ?? name, color: attrs.color, icon: attrs.icon, parent: stack.at(-1), line })
      stack.push(name)
      continue
    }
    if (OP.test(text)) {
      parseEdgeChain(text, line, d.errors).forEach((e) => {
        e.from.forEach((n) => ensureNode(n, line))
        e.to.forEach((n) => ensureNode(n, line))
        for (const f of e.from) for (const t of e.to) d.edges.push({ from: f, to: t, op: e.op, label: e.label, color: e.attrs.color, line })
      })
      continue
    }
    const { name, attrs } = nameAndAttrs(text)
    if (!name) {
      d.errors.push({ line, message: `Cannot read "${text}"` })
      continue
    }
    const prev = d.nodes.get(name)
    d.nodes.set(name, {
      id: name,
      label: attrs.label ?? name,
      shape: (attrs.shape ?? prev?.shape ?? 'rectangle').toLowerCase(),
      icon: attrs.icon ?? prev?.icon,
      color: attrs.color ?? prev?.color,
      group: prev?.group ?? stack.at(-1),
      link: attrs.link ?? prev?.link,
      line,
    })
  }
  if (stack.length) d.errors.push({ line: 0, message: `Unclosed group "${stack.at(-1)}"` })
  return d
}

interface ChainLink {
  from: string[]
  to: string[]
  op: string
  label?: string
  attrs: Attrs
}

function parseEdgeChain(text: string, line: number, errors: ParseError[]): ChainLink[] {
  let body = text
  let attrs: Attrs = {}
  const am = /\[([^\]]*)\]\s*$/.exec(body)
  if (am) {
    attrs = parseAttrs(am[1])
    body = body.slice(0, am.index).trim()
  }
  // The label is whatever follows the last ": " after the final operator.
  let label: string | undefined
  const parts = body.split(OP)
  const last = parts[parts.length - 1]
  const li = last.lastIndexOf(':')
  if (li >= 0) {
    label = last.slice(li + 1).trim() || undefined
    parts[parts.length - 1] = last.slice(0, li).trim()
  }
  const out: ChainLink[] = []
  for (let i = 0; i + 2 < parts.length; i += 2) {
    const split = (s: string) => s.split(',').map((x) => unquote(x.trim())).filter(Boolean)
    const from = split(parts[i])
    const to = split(parts[i + 2])
    if (!from.length || !to.length) {
      errors.push({ line, message: `Edge is missing an end: "${text}"` })
      continue
    }
    out.push({ from, to, op: parts[i + 1], label: i + 3 >= parts.length ? label : undefined, attrs })
  }
  return out
}

/* ------------------------------------------ ERD ------------------------------------------ */

export interface ErdColumn {
  name: string
  type: string
  flags: string[]
  /** 1-based source line, used to link canvas rows to the code editor. */
  line: number
}
export interface ErdEntity {
  name: string
  icon?: string
  color?: string
  link?: string
  columns: ErdColumn[]
  line?: number
}
export interface ErdRel {
  from: { entity: string; column?: string }
  to: { entity: string; column?: string }
  op: string
  line: number
}
export interface ErdDiagram {
  title?: string
  entities: Map<string, ErdEntity>
  rels: ErdRel[]
  errors: ParseError[]
}

export function parseErd(code: string): ErdDiagram {
  const d: ErdDiagram = { entities: new Map(), rels: [], errors: [] }
  let current: ErdEntity | null = null

  const ref = (s: string) => {
    const [entity, column] = s.trim().split('.')
    if (!d.entities.has(entity)) d.entities.set(entity, { name: entity, columns: [] })
    return { entity, column }
  }

  for (const { text, line } of lines(code)) {
    let m: RegExpExecArray | null
    if ((m = /^title\s+(.+)$/i.exec(text))) {
      d.title = m[1]
      continue
    }
    if (/^(colorMode|styleMode|typeface|notation)\b/i.test(text)) continue
    if (current) {
      if (text === '}') {
        current = null
        continue
      }
      const [name, type = '', ...flags] = text.split(/\s+/)
      const extra = /\[([^\]]*)\]/.exec(text)
      current.columns.push({
        name,
        type: type.startsWith('[') ? '' : type,
        flags: flags.filter((f) => !f.startsWith('[') && !f.includes(':')).map((f) => f.toLowerCase().replace(/[,\]]/g, '')).concat(extra ? Object.keys(parseAttrs(extra[1])) : []),
        line,
      })
      continue
    }
    if (text.endsWith('{')) {
      const { name, attrs } = nameAndAttrs(text.slice(0, -1))
      const prev = d.entities.get(name)
      current = { name, icon: attrs.icon, color: attrs.color, link: attrs.link, columns: prev?.columns ?? [], line }
      d.entities.set(name, current)
      continue
    }
    const parts = text.split(OP)
    if (parts.length >= 3) {
      for (let i = 0; i + 2 < parts.length; i += 2) d.rels.push({ from: ref(parts[i]), op: parts[i + 1], to: ref(parts[i + 2]), line })
      continue
    }
    const { name, attrs } = nameAndAttrs(text)
    if (/^[\w.-]+$/.test(name)) {
      const prev = d.entities.get(name)
      d.entities.set(name, { name, icon: attrs.icon, color: attrs.color, link: attrs.link, columns: prev?.columns ?? [], line })
    } else d.errors.push({ line, message: `Cannot read "${text}"` })
  }
  if (current) d.errors.push({ line: 0, message: `Unclosed entity "${current.name}"` })
  return d
}

/* ---------------------------------------- Sequence ---------------------------------------- */

export interface SeqParticipant {
  name: string
  icon?: string
  color?: string
  link?: string
  line?: number
}
export type SeqItem =
  | { kind: 'msg'; from: string; to: string; op: string; label?: string; line: number }
  | { kind: 'act'; who: string; on: boolean; line: number }
  | { kind: 'block'; type: string; color?: string; sections: { label?: string; items: SeqItem[] }[]; line: number }
export interface SeqDiagram {
  title?: string
  autoNumber: boolean
  participants: SeqParticipant[]
  items: SeqItem[]
  errors: ParseError[]
}

const BLOCK = /^(loop|alt|opt|par|break|critical|else|and)\b\s*(?:\[([^\]]*)\])?\s*\{$/i

export function parseSequence(code: string): SeqDiagram {
  const d: SeqDiagram = { autoNumber: false, participants: [], items: [], errors: [] }
  const stack: SeqItem[][] = [d.items]
  const ensure = (name: string, line: number) => {
    if (!d.participants.some((p) => p.name === name)) d.participants.push({ name, line })
  }

  for (const { text, line } of lines(code)) {
    let m: RegExpExecArray | null
    const items = stack[stack.length - 1]
    if ((m = /^title\s+(.+)$/i.exec(text))) {
      d.title = m[1]
      continue
    }
    if ((m = /^autoNumber\s+(on|off|true|false)$/i.exec(text))) {
      d.autoNumber = /on|true/i.test(m[1])
      continue
    }
    if (/^(colorMode|styleMode|typeface)\b/i.test(text)) continue
    if ((m = /^(activate|deactivate)\s+(.+)$/i.exec(text))) {
      ensure(m[2].trim(), line)
      items.push({ kind: 'act', who: m[2].trim(), on: m[1].toLowerCase() === 'activate', line })
      continue
    }
    if ((m = BLOCK.exec(text))) {
      const type = m[1].toLowerCase()
      const attrs = parseAttrs(m[2])
      if (type === 'else' || type === 'and') {
        const prev = items[items.length - 1]
        if (prev?.kind === 'block') {
          const sec = { label: attrs.label, items: [] as SeqItem[] }
          prev.sections.push(sec)
          stack.push(sec.items)
        } else {
          d.errors.push({ line, message: `"${type}" must follow a block` })
          stack.push([])
        }
        continue
      }
      const sec = { label: attrs.label, items: [] as SeqItem[] }
      items.push({ kind: 'block', type, color: attrs.color, sections: [sec], line })
      stack.push(sec.items)
      continue
    }
    if (text === '}') {
      if (stack.length > 1) stack.pop()
      else d.errors.push({ line, message: 'Unexpected "}"' })
      continue
    }
    const parts = text.split(OP)
    if (parts.length >= 3) {
      let label: string | undefined
      let to = parts[2]
      const li = to.indexOf(':')
      if (li >= 0) {
        label = to.slice(li + 1).trim()
        to = to.slice(0, li)
      }
      const from = parts[0].trim()
      to = to.trim()
      ensure(from, line)
      ensure(to, line)
      items.push({ kind: 'msg', from, to, op: parts[1], label, line })
      continue
    }
    const { name, attrs } = nameAndAttrs(text)
    if (name) {
      const existing = d.participants.find((p) => p.name === name)
      if (existing) Object.assign(existing, { icon: attrs.icon, color: attrs.color, link: attrs.link, line })
      else d.participants.push({ name, icon: attrs.icon, color: attrs.color, link: attrs.link, line })
    } else d.errors.push({ line, message: `Cannot read "${text}"` })
  }
  if (stack.length > 1) d.errors.push({ line: 0, message: 'Unclosed block' })
  return d
}

/* ---------------------------------------- Mind map ---------------------------------------- */

export interface MindNode {
  label: string
  icon?: string
  color?: string
  link?: string
  line: number
  depth: number
  children: MindNode[]
}
export interface MindDiagram {
  title?: string
  roots: MindNode[]
  errors: ParseError[]
}

/** An indented outline: each line is a node, its children are the lines indented below it. */
export function parseMindmap(code: string): MindDiagram {
  const d: MindDiagram = { roots: [], errors: [] }
  const stack: { indent: number; node: MindNode }[] = []
  code.split('\n').forEach((raw, i) => {
    const line = i + 1
    const src = raw.replace(/\/\/.*$/, '').replace(/\t/g, '  ')
    const text = src.trim()
    if (!text) return
    let m: RegExpExecArray | null
    if ((m = /^title\s+(.+)$/i.exec(text))) {
      d.title = m[1]
      return
    }
    if (/^(colorMode|styleMode|typeface)\b/i.test(text)) return
    if (/[{}]\s*$/.test(text)) {
      d.errors.push({ line, message: 'Mind maps use indentation instead of { }' })
      return
    }
    const indent = src.length - src.trimStart().length
    // Markdown bullets are allowed, so an outline pastes in as is.
    const { name, attrs } = nameAndAttrs(text.replace(/^[-*+]\s+/, ''))
    if (!name) {
      d.errors.push({ line, message: `Cannot read "${text}"` })
      return
    }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack.at(-1)?.node
    const node: MindNode = { label: attrs.label ?? name, icon: attrs.icon, color: attrs.color, link: attrs.link, line, depth: parent ? parent.depth + 1 : 0, children: [] }
    if (parent) parent.children.push(node)
    else d.roots.push(node)
    stack.push({ indent, node })
  })
  return d
}
