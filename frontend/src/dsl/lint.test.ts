import { describe, expect, it } from 'vitest'
import { lintDiagram } from './lint'

const messages = (...args: Parameters<typeof lintDiagram>) => lintDiagram(...args).map((i) => `${i.line} ${i.severity} ${i.message}`)

describe('lintDiagram', () => {
  it('flags relationships to missing tables and columns', () => {
    const code = `users {
  id uuid pk
}
orders.user_id > users.uid`
    expect(messages('erd', code)).toEqual([
      '4 warning Table "orders" is not defined',
      '4 warning Column "users.uid" does not exist',
    ])
  })

  it('flags duplicate columns', () => {
    expect(messages('erd', 'users {\n  id uuid\n  id int\n}')).toContain('3 warning Duplicate column "id" in "users"')
  })

  it('flags unknown properties, icons and colours', () => {
    const issues = messages('flowchart', 'API [icon: not-a-real-icon, color: mauve, size: big]')
    expect(issues).toContain('1 warning Unknown icon "not-a-real-icon"')
    expect(issues).toContain('1 warning Unknown color "mauve"')
    expect(issues).toContain('1 warning Unknown property "size"')
  })

  it('accepts known icons and hex colours', () => {
    expect(messages('flowchart', 'DB [icon: postgresql, color: #3e8ef7]')).toEqual([])
  })

  it('reports likely typos in node names', () => {
    expect(messages('flowchart', 'Auth Service > DB\nauth-service > DB')).toContain('2 warning "auth-service" looks like a typo of "Auth Service"')
  })

  it('reports a deactivate without activate', () => {
    expect(messages('sequence', 'A > B: hi\ndeactivate B')).toContain('2 warning "B" is deactivated without being activated')
  })

  it('points to missing notes only when titles are given', () => {
    const code = 'API [link: Runbook]'
    expect(messages('flowchart', code)).toEqual([])
    expect(messages('flowchart', code, ['Other'])).toEqual(['1 info No note named "Runbook" yet; opening the link creates it'])
    expect(messages('flowchart', code, ['runbook'])).toEqual([])
  })

  it('puts parse errors first and sorts by line', () => {
    const issues = lintDiagram('erd', 'users {\n  id uuid')
    expect(issues[0]).toMatchObject({ line: 0, severity: 'error' })
  })
})
