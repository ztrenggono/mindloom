import { describe, expect, it } from 'vitest'
import { diffDiagrams } from './diff'

const summary = (...args: Parameters<typeof diffDiagrams>) =>
  diffDiagrams(...args).changes.map((c) => [c.kind, c.what, c.detail].filter(Boolean).join(' | '))

describe('diffDiagrams', () => {
  it('reports nothing when only order and spacing change', () => {
    const a = 'A > B\nB > C'
    const b = 'B   >   C\n\nA > B'
    expect(diffDiagrams('flowchart', a, b).changes).toEqual([])
  })

  it('treats "b < a" as the same connection as "a > b"', () => {
    expect(diffDiagrams('flowchart', 'A > B', 'B < A').changes).toEqual([])
  })

  it('reports added, removed and changed nodes', () => {
    const r = diffDiagrams('flowchart', 'A [color: red]\nB', 'A [color: blue]\nC')
    expect(r.changes.map((c) => [c.kind, c.what, c.detail])).toEqual(
      expect.arrayContaining([
        ['removed', 'Node B', undefined],
        ['added', 'Node C', undefined],
        ['changed', 'Node A', 'color: red → blue'],
      ]),
    )
    expect(r.before).toEqual({ 1: 'changed', 2: 'removed' })
    expect(r.after).toEqual({ 1: 'changed', 2: 'added' })
  })

  it('reports column changes in an ERD', () => {
    const a = 'users {\n  id int pk\n  email varchar\n}'
    const b = 'users {\n  id uuid pk\n  name varchar\n}'
    expect(summary('erd', a, b)).toEqual(
      expect.arrayContaining(['changed | Column users.id | type: int → uuid', 'removed | Column users.email', 'added | Column users.name']),
    )
  })

  it('matches sequence messages in order', () => {
    const a = 'A > B: one\nA > B: two'
    const b = 'A > B: one\nA > B: inserted\nA > B: two'
    expect(summary('sequence', a, b)).toEqual(['added | Message A > B: inserted'])
  })

  it('tracks mind map topics by their path', () => {
    const a = 'Root\n  Growth\n    Ads'
    const b = 'Root\n  Retention\n    Ads'
    expect(summary('mindmap', a, b)).toEqual(
      expect.arrayContaining(['removed | Topic Root / Growth', 'added | Topic Root / Retention', 'added | Topic Root / Retention / Ads']),
    )
  })
})
