import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { VaultFile } from '../types'
import { mapIndex } from './caret'
import { deleteFile, filesOf, importDoc, importFiles, patchFile, readVault, setText, writeFile } from './vaultDoc'

const note = (id: string, extra: Partial<VaultFile> = {}): VaultFile => ({
  id,
  title: id,
  folder: '',
  doc: `# ${id}\n`,
  diagrams: [],
  whiteboard: null,
  layout: 'doc',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})

/** Two browsers that start from the same server copy. */
function pair(...files: VaultFile[]) {
  const a = new Y.Doc()
  a.transact(() => files.forEach((f) => writeFile(a, f)))
  const b = new Y.Doc()
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  return [a, b] as const
}

/** Reconnecting: each side receives what the other has. */
function exchange(a: Y.Doc, b: Y.Doc) {
  const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b))
  const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a))
  Y.applyUpdate(b, ua)
  Y.applyUpdate(a, ub)
}

describe('vault document', () => {
  it('round-trips a note with diagrams and a whiteboard', () => {
    const doc = new Y.Doc()
    const f = note('n', {
      pinned: true,
      diagrams: [{ id: 'd', title: 'D', type: 'erd', code: 'users {\n  id int pk\n}', snapshot: { code: 'x', at: 2 } }],
      whiteboard: [
        { id: 'b', index: 'a1', version: 1 },
        { id: 'a', index: 'a0', version: 1 },
      ],
      whiteboardFiles: { img: { dataURL: 'data:' } },
    })
    writeFile(doc, f)
    const back = readVault(doc).files.n
    expect(back).toEqual({ ...f, whiteboard: [f.whiteboard![1], f.whiteboard![0]] })
  })

  it('applies text changes as small edits', () => {
    const doc = new Y.Doc()
    const t = doc.getText('t')
    t.insert(0, 'hello world')
    const ops: unknown[] = []
    t.observe((e) => ops.push(...e.delta))
    setText(t, 'hello brave world')
    expect(t.toString()).toBe('hello brave world')
    expect(ops).toEqual([{ retain: 6 }, { insert: 'brave ' }])
  })

  it('merges offline edits to the same note instead of keeping only one', () => {
    const [a, b] = pair(note('n', { doc: 'Intro\n\nBody\n' }))
    patchFile(a, 'n', { doc: 'Intro from A\n\nBody\n' })
    patchFile(b, 'n', { doc: 'Intro\n\nBody\nOutro from B\n' })
    exchange(a, b)
    const doc = readVault(a).files.n.doc
    expect(doc).toBe('Intro from A\n\nBody\nOutro from B\n')
    expect(readVault(b).files.n.doc).toBe(doc)
  })

  it('merges edits to different diagrams and fields of one note', () => {
    const [a, b] = pair(note('n', { diagrams: [{ id: 'd1', title: 'One', type: 'flowchart', code: 'A > B' }] }))
    const d1 = readVault(a).files.n.diagrams[0]
    patchFile(a, 'n', { diagrams: [{ ...d1, code: 'A > B\nB > C' }] })
    patchFile(b, 'n', { title: 'Renamed', diagrams: [d1, { id: 'd2', title: 'Two', type: 'erd', code: 'x {\n  id int\n}' }] })
    exchange(a, b)
    const f = readVault(a).files.n
    expect(f.title).toBe('Renamed')
    expect(f.diagrams.map((d) => [d.id, d.code])).toEqual([
      ['d1', 'A > B\nB > C'],
      ['d2', 'x {\n  id int\n}'],
    ])
  })

  it('keeps the newer version of each whiteboard element and spreads deletes', () => {
    const [a, b] = pair(note('n', { whiteboard: [{ id: 'e1', index: 'a0', version: 1 }] }))
    patchFile(a, 'n', { whiteboard: [{ id: 'e1', index: 'a0', version: 3, isDeleted: true }] })
    patchFile(b, 'n', { whiteboard: [{ id: 'e1', index: 'a0', version: 2 }, { id: 'e2', index: 'a1', version: 1 }] })
    exchange(a, b)
    // b's later sync of the scene it had does not undo a's newer delete.
    patchFile(b, 'n', { whiteboard: [{ id: 'e1', index: 'a0', version: 2 }] })
    exchange(a, b)
    expect(readVault(a).files.n.whiteboard).toEqual([
      { id: 'e1', index: 'a0', version: 3, isDeleted: true },
      { id: 'e2', index: 'a1', version: 1 },
    ])
  })

  it('keeps both browsers\' first strokes on a blank whiteboard', () => {
    const [a, b] = pair(note('n'))
    patchFile(a, 'n', { whiteboard: [{ id: 'ea', index: 'a0', version: 1 }], whiteboardFiles: { fa: 1 } })
    patchFile(b, 'n', { whiteboard: [{ id: 'eb', index: 'a1', version: 1 }], whiteboardFiles: { fb: 2 } })
    exchange(a, b)
    const f = readVault(a).files.n
    expect(f.whiteboard).toEqual([
      { id: 'ea', index: 'a0', version: 1 },
      { id: 'eb', index: 'a1', version: 1 },
    ])
    expect(f.whiteboardFiles).toEqual({ fa: 1, fb: 2 })
  })

  it('copies elements, since Excalidraw edits them in place', () => {
    const doc = new Y.Doc()
    writeFile(doc, note('n', { whiteboard: [] }))
    const el = { id: 'e', index: 'a0', version: 1, width: 0 }
    patchFile(doc, 'n', { whiteboard: [el] })
    Object.assign(el, { version: 2, width: 50 })
    expect(patchFile(doc, 'n', { whiteboard: [el] })).toBe(true)
    const read = readVault(doc).files.n.whiteboard as (typeof el)[]
    read[0].width = 999
    expect(readVault(doc).files.n.whiteboard).toEqual([{ id: 'e', index: 'a0', version: 2, width: 50 }])
  })

  it('does not touch updatedAt when nothing changed', () => {
    const doc = new Y.Doc()
    writeFile(doc, note('n'))
    expect(patchFile(doc, 'n', { doc: '# n\n', layout: 'doc' })).toBe(false)
    expect(readVault(doc).files.n.updatedAt).toBe(1)
  })

  it('hides a deleted note, unless someone edited it after the delete', () => {
    const [a, b] = pair(note('gone'), note('kept'))
    deleteFile(a, 'gone', 100)
    deleteFile(a, 'kept', 100)
    patchFile(b, 'kept', { doc: 'edited offline', updatedAt: 200 })
    exchange(a, b)
    expect(Object.keys(readVault(a).files)).toEqual(['kept'])
    expect(readVault(b).files.kept.doc).toBe('edited offline')
  })

  it('imports an older vault: newer edits win, tombstones apply', () => {
    const server = new Y.Doc()
    writeFile(server, note('a', { doc: 'server', updatedAt: 50 }))
    writeFile(server, note('b', { doc: 'server', updatedAt: 50 }))
    const local = new Y.Doc()
    importFiles(local, [note('a', { doc: 'local newer', updatedAt: 60 }), note('b', { doc: 'local older', updatedAt: 40 }), note('c', { doc: 'local only', updatedAt: 10 }), note('dead', { updatedAt: 10 })], {
      deletes: { dead: 20 },
    })
    writeFile(local, note('x', { updatedAt: 5 }))
    deleteFile(local, 'x', 70)
    writeFile(server, note('x', { updatedAt: 30 }))
    importDoc(server, local)
    const files = readVault(server).files
    expect(Object.fromEntries(Object.values(files).map((f) => [f.id, f.doc]))).toEqual({ a: 'local newer', b: 'server', c: 'local only' })
    expect(filesOf(server).get('x')!.get('deletedAt')).toBe(70)
  })
})

describe('mapIndex', () => {
  it('keeps a caret on its character when text changes before or after it', () => {
    expect(mapIndex('hello world', 'hey hello world', 6)).toBe(10)
    expect(mapIndex('hello world', 'hello world!', 6)).toBe(6)
    expect(mapIndex('hello world', 'world', 8)).toBe(2)
    expect(mapIndex('hello world', 'hello', 8)).toBe(5)
  })
})
