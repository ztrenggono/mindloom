import { describe, expect, it } from 'vitest'
import { lintDiagram } from './dsl/lint'
import { TEMPLATE_CATEGORIES, TEMPLATES } from './templates'

// The contributing rule from the README: every template parses and uses icons that exist.
describe('templates', () => {
  it('have unique ids and known categories', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    const categories = new Set(TEMPLATE_CATEGORIES.map((c) => c.id))
    for (const t of TEMPLATES) expect(categories, t.id).toContain(t.category)
  })

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s has no errors or warnings', (_, t) => {
    const problems = lintDiagram(t.type, t.code).filter((i) => i.severity !== 'info')
    expect(problems).toEqual([])
  })
})
