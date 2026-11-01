import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { addThread, readThreads, replyToThread, resolveThread } from './comments'
import { deleteFile, importDoc, patchFile, readVault, restoreFile, textOf, writeFile } from './vaultDoc'
import type { CommentThread, VaultFile } from '../types'
const note: VaultFile = { id: 'n', title: 'Note', folder: '', doc: 'hello world', diagrams: [{ id: 'd', title: 'Flow', type: 'flowchart', code: 'API [icon: server]' }], whiteboard: null, layout: 'both', createdAt: 1, updatedAt: 1 }
const thread = (id = 't', field = 'doc'): CommentThread => ({ id, body: 'Review this', author: 'A', createdAt: 2, resolved: false, replies: [], anchor: { field, start: 0, end: 5, quote: field === 'doc' ? 'hello' : 'API [' } })
const setup = () => { const d = new Y.Doc(); writeFile(d, note); return d }
const exchange = (a: Y.Doc, b: Y.Doc) => { const x = Y.encodeStateAsUpdate(a); Y.applyUpdate(a, Y.encodeStateAsUpdate(b)); Y.applyUpdate(b, x) }

describe('anchored comments', () => {
  it('tracks text when another browser inserts before the anchor and survives reload', () => {
    const a = setup(); addThread(a, 'n', thread())
    const b = new Y.Doc(); Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    textOf(b, 'n', 'doc')!.insert(0, 'prefix ')
    exchange(a, b)
    expect(readThreads(a, 'n')[0].anchor).toMatchObject({ start: 7, end: 12, missing: false })
    const c = new Y.Doc(); Y.applyUpdate(c, Y.encodeStateAsUpdate(a))
    expect(readThreads(c, 'n')).toEqual(readThreads(a, 'n'))
  })
  it('merges simultaneous first comments and simultaneous replies without losing either', () => {
    const a = setup(); const b = new Y.Doc(); Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    addThread(a, 'n', thread('a')); addThread(b, 'n', thread('b')); exchange(a, b)
    expect(readThreads(a, 'n')).toHaveLength(2)
    replyToThread(a, 'n', 'a', { id: 'r1', author: 'A', body: 'one', createdAt: 3 })
    replyToThread(b, 'n', 'a', { id: 'r2', author: 'B', body: 'two', createdAt: 3 })
    resolveThread(b, 'n', 'a', true); exchange(a, b)
    expect(readThreads(a, 'n')[0]).toMatchObject({ resolved: true, replies: [{ id: 'r1' }, { id: 'r2' }] })
    resolveThread(a, 'n', 'a', false); exchange(a, b)
    expect(readThreads(b, 'n')[0].resolved).toBe(false)
  })
  it('keeps comments when their text or diagram is removed and reports a missing anchor', () => {
    const d = setup(); addThread(d, 'n', thread()); addThread(d, 'n', thread('diagram', 'd'))
    textOf(d, 'n', 'doc')!.delete(0, 5)
    patchFile(d, 'n', { diagrams: [] })
    expect(readThreads(d, 'n').every((t) => t.anchor.missing)).toBe(true)
  })
  it('relocates provisional anchors when the server has newer text', () => {
    const local = setup(); addThread(local, 'n', thread())
    const server = setup(); patchFile(server, 'n', { doc: 'prefix hello world', updatedAt: 100 })
    importDoc(server, local)
    expect(readThreads(server, 'n')[0].anchor).toMatchObject({ start: 7, end: 12, missing: false })
  })
  it('preserves newer deleted content and comments when joining an older server copy', () => {
    const local = setup(); patchFile(local, 'n', { doc: 'hello updated world', updatedAt: 10 })
    addThread(local, 'n', thread()); deleteFile(local, 'n', 20)
    const server = setup(); importDoc(server, local)
    expect(readVault(server).trash.n.doc).toBe('hello updated world')
    restoreFile(server, 'n', 21)
    expect(readThreads(server, 'n')[0].anchor.missing).toBe(false)
    expect(readVault(server).files.n.doc).toBe('hello updated world')
  })
  it('round-trips through JSON backup, Trash, restore, and provisional migration', () => {
    const a = setup(); addThread(a, 'n', thread())
    const snapshot = JSON.parse(JSON.stringify(readVault(a).files.n)) as VaultFile
    const b = new Y.Doc(); writeFile(b, snapshot)
    expect(readThreads(b, 'n')[0].anchor.missing).toBe(false)
    deleteFile(b, 'n', 10); restoreFile(b, 'n', 11)
    expect(readVault(b).files.n.comments).toHaveLength(1)
    const server = setup(); importDoc(server, a)
    expect(readThreads(server, 'n')).toHaveLength(1)
  })
})
