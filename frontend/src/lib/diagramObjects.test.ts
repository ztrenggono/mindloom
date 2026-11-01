import { describe, it, expect } from 'vitest'
import { diagramObjects, setObjectLink } from './diagramObjects'
import { backlinks, findByTitle } from './links'
import type { VaultFile } from '../types'

describe('diagram object links', () => {
  it.each(['erd', 'flowchart', 'cloud', 'sequence', 'mindmap'] as const)('links an explicit %s object without dropping its attributes', (type) => {
    const code = type === 'erd' ? 'users [icon: user] {\n  id int pk\n}' : 'users [icon: user]'
    const object = diagramObjects(type, code)[0]
    expect(object.label).toBe('users')
    const linked = setObjectLink(code, object.line, 'note:target')
    expect(linked).toContain('icon: user, link: note:target')
    expect(diagramObjects(type, linked)[0].link).toBe('note:target')
    expect(diagramObjects(type, setObjectLink(linked, object.line, ''))[0].link).toBeUndefined()
  })
  it('preserves braces and trailing comments and excludes implicit objects on edge lines', () => {
    expect(setObjectLink('users { // table\n id int pk\n}', 1, 'note:t')).toBe('users [link: note:t] { // table\n id int pk\n}')
    expect(diagramObjects('flowchart', 'A > B')).toEqual([])
  })
  it('resolves stable links and backlinks after a target title changes', () => {
    const target = { id: 't', title: 'Renamed' } as VaultFile
    const source = { id: 's', title: 'Source', doc: '', diagrams: [{ code: 'API [link: note:t]' }] } as VaultFile
    const files = { t: target, s: source }
    expect(findByTitle(files, 'note:t')).toBe(target)
    expect(backlinks(files, target)).toEqual([source])
    expect(findByTitle({}, 'note:t')).toBeUndefined()
  })
})
