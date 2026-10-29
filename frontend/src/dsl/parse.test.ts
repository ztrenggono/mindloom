import { describe, expect, it } from 'vitest'
import { parseAttrs, parseErd, parseFlow, parseMindmap, parseSequence } from './parse'

describe('parseAttrs', () => {
  it('reads key: value pairs', () => {
    expect(parseAttrs('icon: aws-s3, color: blue')).toEqual({ icon: 'aws-s3', color: 'blue' })
  })

  it('returns an empty object for no input', () => {
    expect(parseAttrs()).toEqual({})
  })
})

describe('parseErd', () => {
  const code = `title Shop

users [icon: user, color: blue] {
  id uuid pk
  email varchar unique
}

orders {
  id uuid pk
  user_id uuid
}

orders.user_id > users.id`

  it('reads entities, columns and attributes', () => {
    const d = parseErd(code)
    expect(d.title).toBe('Shop')
    expect(d.errors).toEqual([])
    const users = d.entities.get('users')!
    expect(users).toMatchObject({ icon: 'user', color: 'blue', line: 3 })
    expect(users.columns.map((c) => [c.name, c.type, c.flags])).toEqual([
      ['id', 'uuid', ['pk']],
      ['email', 'varchar', ['unique']],
    ])
  })

  it('reads relationships with their source line', () => {
    const [rel] = parseErd(code).rels
    expect(rel).toMatchObject({ from: { entity: 'orders', column: 'user_id' }, op: '>', to: { entity: 'users', column: 'id' }, line: 13 })
  })

  it('reports an unclosed entity', () => {
    expect(parseErd('users {\n  id uuid').errors).toEqual([{ line: 0, message: 'Unclosed entity "users"' }])
  })
})

describe('parseFlow', () => {
  it('reads nodes, groups, edges and direction', () => {
    const d = parseFlow(`direction right
Backend {
  API [icon: server]
  DB [shape: cylinder]
}
User > API: request
API > DB`)
    expect(d.direction).toBe('right')
    expect(d.errors).toEqual([])
    expect(d.groups.has('Backend')).toBe(true)
    expect(d.nodes.get('API')).toMatchObject({ icon: 'server', group: 'Backend' })
    expect(d.nodes.get('DB')).toMatchObject({ shape: 'cylinder' })
    expect(d.nodes.has('User')).toBe(true)
    expect(d.edges.map((e) => [e.from, e.op, e.to, e.label])).toEqual([
      ['User', '>', 'API', 'request'],
      ['API', '>', 'DB', undefined],
    ])
  })

  it('keeps hyphenated names that are not operators', () => {
    const d = parseFlow('well-specced > done')
    expect(d.edges[0]).toMatchObject({ from: 'well-specced', to: 'done' })
  })
})

describe('parseSequence', () => {
  it('reads participants, messages and blocks', () => {
    const d = parseSequence(`Client [icon: user]
Server
Client > Server: GET /
alt [label: cached] {
  Server --> Client: 304
}`)
    expect(d.errors).toEqual([])
    expect(d.participants.map((p) => p.name)).toEqual(['Client', 'Server'])
    expect(d.items[0]).toMatchObject({ kind: 'msg', from: 'Client', op: '>', to: 'Server', label: 'GET /' })
    const block = d.items[1]
    expect(block.kind).toBe('block')
    if (block.kind === 'block') expect(block.sections[0].items[0]).toMatchObject({ kind: 'msg', from: 'Server', to: 'Client' })
  })
})

describe('parseMindmap', () => {
  it('builds the tree from indentation', () => {
    const d = parseMindmap(`Roadmap [icon: map]
  Growth
    Referrals
  Retention`)
    expect(d.errors).toEqual([])
    expect(d.roots).toHaveLength(1)
    const root = d.roots[0]
    expect(root).toMatchObject({ label: 'Roadmap', icon: 'map' })
    expect(root.children.map((c) => c.label)).toEqual(['Growth', 'Retention'])
    expect(root.children[0].children.map((c) => c.label)).toEqual(['Referrals'])
  })
})
