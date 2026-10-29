import { describe, expect, it } from 'vitest'
import type { VaultFile } from '../types'
import { parseQuery, search } from './search'

const file = (id: string, title: string, doc: string, extra: Partial<VaultFile> = {}): VaultFile => ({
  id,
  title,
  folder: '',
  doc,
  diagrams: [],
  whiteboard: null,
  layout: 'doc',
  createdAt: 0,
  updatedAt: 0,
  ...extra,
})

const files = [
  file('a', 'Payments', '# Payments\n\nStripe webhook retries.\n#billing', { folder: 'Backend/API' }),
  file('b', 'Onboarding', 'Welcome email and checklist.\n#product'),
  file('c', 'Schema', 'Tables for the shop.', {
    folder: 'Backend',
    diagrams: [{ id: 'd1', title: 'Shop ERD', type: 'erd', code: 'users {\n  id uuid pk\n  email varchar\n}\norders.user_id > users.id' }],
  }),
]

const ids = (q: string) => search(files, q).map((r) => r.file.id)

describe('parseQuery', () => {
  it('splits words, phrases and filters', () => {
    expect(parseQuery('Stripe "web hook" #Billing tag:ops folder:/Backend/ in:diagrams')).toEqual({
      terms: ['stripe', 'web hook'],
      tags: ['billing', 'ops'],
      folder: 'backend',
      scope: 'diagrams',
    })
  })
})

describe('search', () => {
  it('returns nothing for an empty query', () => {
    expect(search(files, '   ')).toEqual([])
  })

  it('needs every word, in any order', () => {
    expect(ids('retries stripe')).toEqual(['a'])
    expect(ids('stripe checklist')).toEqual([])
  })

  it('matches phrases exactly', () => {
    expect(ids('"webhook retries"')).toEqual(['a'])
    expect(ids('"retries webhook"')).toEqual([])
  })

  it('searches diagram code and points at the line', () => {
    const [r] = search(files, 'email varchar')
    expect(r.file.id).toBe('c')
    expect(r.hits).toEqual([{ where: 'diagram', line: 3, text: 'email varchar', diagramId: 'd1', diagramTitle: 'Shop ERD' }])
  })

  it('gives note lines 0-based, like the outline', () => {
    expect(search(files, 'stripe')[0].hits).toEqual([{ where: 'doc', line: 2, text: 'Stripe webhook retries.' }])
  })

  it('filters by tag, folder and scope', () => {
    expect(ids('#billing')).toEqual(['a'])
    expect(ids('tag:product')).toEqual(['b'])
    expect(ids('folder:backend').sort()).toEqual(['a', 'c'])
    expect(ids('folder:backend/api')).toEqual(['a'])
    expect(ids('folder:back')).toEqual([])
    expect(ids('email')).toEqual(['b', 'c'])
    expect(ids('email in:notes')).toEqual(['b'])
    expect(ids('email in:diagrams')).toEqual(['c'])
  })

  it('ranks title matches first', () => {
    const vault = [file('x', 'Notes', 'schema schema schema'), file('y', 'Schema', 'nothing here')]
    expect(search(vault, 'schema').map((r) => r.file.id)).toEqual(['y', 'x'])
  })

  it('keeps at most five hits, preferring lines that match more words', () => {
    const doc = ['api', 'api', 'api', 'api', 'api', 'api', 'api key'].join('\n')
    const [r] = search([file('z', 'Z', doc)], 'api key')
    expect(r.hits).toHaveLength(5)
    expect(r.hits.at(-1)).toMatchObject({ line: 6, text: 'api key' })
  })
})
