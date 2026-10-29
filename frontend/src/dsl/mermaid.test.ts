// @vitest-environment jsdom
import mermaid from 'mermaid'
import { beforeAll, describe, expect, it } from 'vitest'
import { TEMPLATES } from '../templates'
import type { DiagramType } from '../types'
import { lintDiagram } from './lint'
import { convertMermaidFences, fromMermaid, toMermaid } from './mermaid'
import { parseErd, parseFlow, parseMindmap, parseSequence, type SeqItem } from './parse'

beforeAll(() => mermaid.initialize({ startOnLoad: false }))

/** Counts that must survive a round trip through Mermaid. */
function shape(type: DiagramType, code: string) {
  if (type === 'erd') {
    const d = parseErd(code)
    return { entities: d.entities.size, columns: [...d.entities.values()].reduce((n, e) => n + e.columns.length, 0), rels: d.rels.length }
  }
  if (type === 'sequence') {
    const d = parseSequence(code)
    let msgs = 0
    let blocks = 0
    const walk = (items: SeqItem[]) =>
      items.forEach((it) => (it.kind === 'msg' ? msgs++ : it.kind === 'block' ? (blocks++, it.sections.forEach((s) => walk(s.items))) : 0))
    walk(d.items)
    return { participants: d.participants.length, msgs, blocks }
  }
  if (type === 'mindmap') {
    let n = 0
    const walk = (x: { children: { children: unknown[] }[] }) => (n++, x.children.forEach((c) => walk(c as never)))
    parseMindmap(code).roots.forEach((r) => walk(r as never))
    return { topics: n }
  }
  const d = parseFlow(code)
  return { nodes: d.nodes.size, groups: d.groups.size, edges: d.edges.length }
}

describe('toMermaid', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s exports valid Mermaid that converts back', async (_, t) => {
    const mmd = toMermaid(t.type, t.code)
    await expect(mermaid.parse(mmd)).resolves.toBeTruthy()

    const back = fromMermaid(mmd)!
    expect(back).not.toBeNull()
    expect(back.type).toBe(t.type === 'cloud' ? 'flowchart' : t.type)
    expect(lintDiagram(back.type, back.code).filter((i) => i.severity === 'error')).toEqual([])
    // A single-root mind map stays the same; several roots gain a shared root in Mermaid.
    const expected = shape(t.type, t.code)
    if (t.type === 'mindmap' && parseMindmap(t.code).roots.length > 1) (expected as { topics: number }).topics++
    expect(shape(back.type, back.code)).toEqual(expected)
  })

  it('maps ERD cardinality and keys', () => {
    const mmd = toMermaid('erd', 'users {\n  id uuid pk\n  email varchar unique\n}\norders.user_id > users.id')
    expect(mmd).toContain('uuid id PK')
    expect(mmd).toContain('varchar email UK')
    expect(mmd).toContain('orders }o--|| users : "user_id to id"')
  })

  it('keeps flowchart labels, shapes and reversed arrows', () => {
    const mmd = toMermaid('flowchart', 'direction right\nUser [shape: oval]\nDB "store" [shape: cylinder]\nDB < User: writes')
    expect(mmd).toContain('flowchart LR')
    expect(mmd).toContain('User(["User"])')
    expect(mmd).toContain('User -->|"writes"|')
  })
})

describe('fromMermaid', () => {
  it('reads a GitHub-style flowchart', () => {
    const r = fromMermaid(`---
title: Checkout
---
graph LR
  A[Cart] --> B{Paid?}
  B -- yes --> C([Ship])
  B -.->|no| D[(Orders DB)]
  subgraph Ops [Operations]
    C
  end
  A & B --- D`)!
    expect(r.type).toBe('flowchart')
    expect(r.title).toBe('Checkout')
    const d = parseFlow(r.code)
    expect(d.errors).toEqual([])
    expect(d.direction).toBe('right')
    expect(d.nodes.get('Paid?')).toMatchObject({ shape: 'diamond' })
    expect(d.nodes.get('Orders DB')).toMatchObject({ shape: 'cylinder' })
    expect(d.nodes.get('Ship')).toMatchObject({ shape: 'oval', group: 'Operations' })
    expect(d.edges.map((e) => [e.from, e.op, e.to, e.label])).toEqual([
      ['Cart', '>', 'Paid?', undefined],
      ['Paid?', '>', 'Ship', 'yes'],
      ['Paid?', '-->', 'Orders DB', 'no'],
      ['Cart', '-', 'Orders DB', undefined],
      ['Paid?', '-', 'Orders DB', undefined],
    ])
  })

  it('reads a sequence diagram with aliases, activation and blocks', () => {
    const r = fromMermaid(`sequenceDiagram
  autonumber
  participant B as Browser
  participant S as API Server
  B->>+S: GET /me
  alt cached
    S-->>B: 304
  else fresh
    S-->>-B: 200
  end
  Note over B,S: ignored`)!
    const d = parseSequence(r.code)
    expect(d.errors).toEqual([])
    expect(d.autoNumber).toBe(true)
    expect(d.participants.map((p) => p.name)).toEqual(['Browser', 'API Server'])
    expect(d.items[0]).toMatchObject({ kind: 'msg', from: 'Browser', op: '>', to: 'API Server', label: 'GET /me' })
    expect(d.items[1]).toMatchObject({ kind: 'act', who: 'API Server', on: true })
    const block = d.items[2]
    expect(block.kind === 'block' && block.sections.map((s) => s.label)).toEqual(['cached', 'fresh'])
  })

  it('reads ERD relationships by cardinality', () => {
    const r = fromMermaid(`erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER }|--|{ PRODUCT : contains
  CUSTOMER {
    string id PK
    string email UK
  }`)!
    const d = parseErd(r.code)
    expect(d.errors).toEqual([])
    expect(d.rels.map((x) => `${x.from.entity} ${x.op} ${x.to.entity}`)).toEqual(['CUSTOMER < ORDER', 'ORDER <> PRODUCT'])
    expect(d.entities.get('CUSTOMER')!.columns.map((c) => [c.name, c.type, c.flags])).toEqual([
      ['id', 'string', ['pk']],
      ['email', 'string', ['unique']],
    ])
  })

  it('reads a mind map', () => {
    const r = fromMermaid(`mindmap
  root((Roadmap))
    Growth
      ::icon(fa fa-rocket)
      Referrals
    [Retention]`)!
    const d = parseMindmap(r.code)
    expect(d.roots.map((x) => x.label)).toEqual(['Roadmap'])
    expect(d.roots[0].children.map((x) => x.label)).toEqual(['Growth', 'Retention'])
    expect(d.roots[0].children[0].children.map((x) => x.label)).toEqual(['Referrals'])
  })

  it('returns null for diagram kinds it cannot draw', () => {
    expect(fromMermaid('pie title Pets\n  "Dogs" : 386')).toBeNull()
  })

  it('converts mermaid fences in Markdown and leaves others alone', () => {
    const md = '# Note\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n```mermaid\npie\n  "a" : 1\n```\n'
    const out = convertMermaidFences(md)
    expect(out).toContain('```flowchart\ndirection down')
    expect(out).toContain('A > B')
    expect(out).toContain('```mermaid\npie')
  })
})
