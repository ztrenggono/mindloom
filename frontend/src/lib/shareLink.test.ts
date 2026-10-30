import { describe, expect, it } from 'vitest'
import { linkHash, linkUrl, parseLink } from './shareLink'

describe('share links', () => {
  it('round-trips note and diagram ids, including odd characters', () => {
    for (const t of [{ fileId: 'welcome' }, { fileId: 'a b/c', diagramId: 'd-erd' }, { fileId: 'n', diagramId: '__whiteboard__' }]) {
      expect(parseLink(linkHash(t))).toEqual(t)
    }
  })

  it('ignores hashes that are not note links', () => {
    for (const h of ['', '#', '#/x/welcome', '#/n/', '#/n/a/b/c', '#/n/%E0%A4%A']) expect(parseLink(h)).toBeNull()
  })

  it('builds a full address', () => {
    expect(linkUrl({ fileId: 'welcome' }, 'https://notes.example.com/')).toBe('https://notes.example.com/#/n/welcome')
  })
})
