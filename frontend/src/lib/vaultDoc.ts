/**
 * The vault as one Yjs document, shared live through the backend (backend/src/collab.ts).
 *
 *   files    Y.Map  id → Y.Map of one note:
 *              doc              Y.Text
 *              diagrams         Y.Array of Y.Map { id, title, type, code: Y.Text, snapshot }
 *              whiteboard       Y.Map  slot → Excalidraw element (absent until drawn on); see patchWhiteboard
 *              whiteboardFiles  Y.Map  file id → image data
 *              other VaultFile fields as plain values, plus deletedAt
 *   folders  Y.Map  path → true
 *
 * Text merges character by character, so people typing in the same note at the same time,
 * or offline, all keep their edits. Other fields are last-write-wins per key. Deleting only
 * marks a note: an edit made after the delete (e.g. offline) keeps the note, so no work is lost.
 */
import fastDiff from 'fast-diff'
import * as Y from 'yjs'
import type { Diagram, VaultFile } from '../types'

type YFile = Y.Map<unknown>
/**
 * Excalidraw edits elements in place, so every element is copied on the way in and out:
 * otherwise a stored element would change under Yjs without an update being sent.
 */
type Element = { id: string; version?: number; versionNonce?: number; index?: string | null }

export const filesOf = (doc: Y.Doc) => doc.getMap<YFile>('files')
export const foldersOf = (doc: Y.Doc) => doc.getMap<boolean>('folders')

const PLAIN = ['title', 'folder', 'layout', 'pinned', 'createdAt', 'updatedAt'] as const

/** Deleted notes stay hidden unless someone edited them after the delete. */
export function isVisible(m: YFile) {
  const at = m.get('deletedAt') as number | undefined
  return !at || (m.get('updatedAt') as number) > at
}

export function readFile(m: YFile): VaultFile {
  const wb = m.get('whiteboard') as Y.Map<Element> | undefined
  const wbFiles = m.get('whiteboardFiles') as Y.Map<unknown> | undefined
  const f: VaultFile = {
    id: m.get('id') as string,
    title: (m.get('title') as string) ?? '',
    folder: (m.get('folder') as string) ?? '',
    doc: (m.get('doc') as Y.Text | undefined)?.toString() ?? '',
    diagrams: ((m.get('diagrams') as Y.Array<Y.Map<unknown>> | undefined)?.toArray() ?? []).map(readDiagram),
    whiteboard: wb ? sortElements([...newest(wb).values()].map((el) => structuredClone(el))) : null,
    layout: (m.get('layout') as VaultFile['layout']) ?? 'doc',
    createdAt: (m.get('createdAt') as number) ?? 0,
    updatedAt: (m.get('updatedAt') as number) ?? 0,
  }
  if (wbFiles) f.whiteboardFiles = wbFiles.toJSON()
  if (m.get('pinned')) f.pinned = true
  return f
}

function readDiagram(m: Y.Map<unknown>): Diagram {
  const d: Diagram = {
    id: m.get('id') as string,
    title: m.get('title') as string,
    type: m.get('type') as Diagram['type'],
    code: (m.get('code') as Y.Text).toString(),
  }
  const snap = m.get('snapshot') as Diagram['snapshot']
  if (snap) d.snapshot = snap
  return d
}

/** Excalidraw orders elements by their fractional `index`; ids break ties so every browser agrees. */
function sortElements(els: Element[]) {
  return els.sort((a, b) => ((a.index ?? '') < (b.index ?? '') ? -1 : (a.index ?? '') > (b.index ?? '') ? 1 : a.id < b.id ? -1 : 1))
}

export function readVault(doc: Y.Doc): { files: Record<string, VaultFile>; folders: string[] } {
  const files: Record<string, VaultFile> = {}
  filesOf(doc).forEach((m, id) => {
    if (isVisible(m)) files[id] = readFile(m)
  })
  return { files, folders: [...foldersOf(doc).keys()].sort() }
}

/** Applies the smallest set of inserts and deletes that turns `text` into `next`. */
export function setText(text: Y.Text, next: string) {
  const cur = text.toString()
  if (cur === next) return false
  let i = 0
  for (const [op, s] of fastDiff(cur, next)) {
    if (op === fastDiff.EQUAL) i += s.length
    else if (op === fastDiff.DELETE) text.delete(i, s.length)
    else {
      text.insert(i, s)
      i += s.length
    }
  }
  return true
}

function newDiagram(d: Diagram) {
  const m = new Y.Map<unknown>()
  m.set('id', d.id)
  m.set('title', d.title)
  m.set('type', d.type)
  m.set('code', new Y.Text(d.code))
  if (d.snapshot) m.set('snapshot', d.snapshot)
  return m
}

/** Replaces note `f` (or adds it) with a fresh copy; edits others make to the old copy at the same moment are dropped. */
export function writeFile(doc: Y.Doc, f: VaultFile) {
  const m = new Y.Map<unknown>()
  m.set('id', f.id)
  for (const k of PLAIN) if (f[k] !== undefined) m.set(k, f[k])
  m.set('doc', new Y.Text(f.doc ?? ''))
  const diagrams = new Y.Array<Y.Map<unknown>>()
  diagrams.push((f.diagrams ?? []).map(newDiagram))
  m.set('diagrams', diagrams)
  if (f.whiteboard) {
    const wb = new Y.Map<Element>()
    for (const el of f.whiteboard as Element[]) wb.set(el.id, structuredClone(el))
    m.set('whiteboard', wb)
  }
  if (f.whiteboardFiles) m.set('whiteboardFiles', new Y.Map(Object.entries(f.whiteboardFiles)))
  filesOf(doc).set(f.id, m)
}

/**
 * Changes only what differs, so concurrent edits elsewhere in the note survive. Bumps
 * `updatedAt` when anything changed, unless the patch sets it. Returns whether it did.
 */
export function patchFile(doc: Y.Doc, id: string, patch: Partial<VaultFile>) {
  const m = filesOf(doc).get(id)
  if (!m) return false
  let changed = false
  for (const [k, v] of Object.entries(patch) as [keyof VaultFile, unknown][]) {
    if (k === 'id' || k === 'updatedAt') continue
    if (k === 'doc') changed = setText(m.get('doc') as Y.Text, v as string) || changed
    else if (k === 'diagrams') changed = patchDiagrams(m, v as Diagram[]) || changed
    else if (k === 'whiteboard') changed = patchWhiteboard(m, v as Element[] | null, doc.clientID) || changed
    else if (k === 'whiteboardFiles') changed = patchWhiteboardFiles(m, (v ?? {}) as Record<string, unknown>) || changed
    else if (m.get(k) !== v) {
      if (v === undefined) m.delete(k)
      else m.set(k, v)
      changed = true
    }
  }
  if (patch.updatedAt !== undefined) m.set('updatedAt', patch.updatedAt)
  else if (changed) m.set('updatedAt', Date.now())
  return changed
}

function patchDiagrams(m: YFile, next: Diagram[]) {
  const arr = m.get('diagrams') as Y.Array<Y.Map<unknown>>
  const keep = new Set(next.map((d) => d.id))
  let changed = false
  for (let i = arr.length - 1; i >= 0; i--) {
    if (keep.has(arr.get(i).get('id') as string)) continue
    arr.delete(i, 1)
    changed = true
  }
  next.forEach((d, i) => {
    const y = arr.toArray().find((x) => x.get('id') === d.id)
    if (!y) {
      arr.insert(Math.min(i, arr.length), [newDiagram(d)])
      changed = true
      return
    }
    for (const k of ['title', 'type'] as const) {
      if (y.get(k) === d[k]) continue
      y.set(k, d[k])
      changed = true
    }
    if (JSON.stringify(y.get('snapshot')) !== JSON.stringify(d.snapshot)) {
      if (d.snapshot) y.set('snapshot', d.snapshot)
      else y.delete('snapshot')
      changed = true
    }
    changed = setText(y.get('code') as Y.Text, d.code) || changed
  })
  return changed
}

/** Excalidraw's rule for two copies of an element: higher version wins, then the lower nonce. */
const beats = (a: Element, b: Element) => (a.version ?? 0) > (b.version ?? 0) || ((a.version ?? 0) === (b.version ?? 0) && (a.versionNonce ?? 0) < (b.versionNonce ?? 0))

/** The winning copy of each element id across all slots. */
function newest(wb: Y.Map<Element>) {
  const out = new Map<string, Element>()
  wb.forEach((el) => {
    const cur = out.get(el.id)
    if (!cur || beats(el, cur)) out.set(el.id, el)
  })
  return out
}

/**
 * Two browsers setting the same Y.Map key at once keep one value picked by client id, not the
 * newer element version. So each browser writes into its own slot (`<element id>:<client id>`),
 * readers take the winning copy, and a writer clears the slots its copy beats. Deleting a slot
 * only removes the value that was seen, so an owner's concurrent update to it survives.
 *
 * Elements are only ever added or replaced by a newer version, never removed: Excalidraw marks a
 * deleted element with `isDeleted`, which reaches everyone like any other change. An element
 * missing from `els` is one this browser has not seen yet, not a deletion.
 */
function patchWhiteboard(m: YFile, els: Element[] | null, clientId: number) {
  if (!els) return false
  let wb = m.get('whiteboard') as Y.Map<Element> | undefined
  if (!wb) m.set('whiteboard', (wb = new Y.Map<Element>()))
  const best = newest(wb)
  let changed = false
  for (const el of els) {
    const cur = best.get(el.id)
    if (cur && !beats(el, cur)) continue
    wb.forEach((other, key) => other.id === el.id && wb.delete(key))
    wb.set(`${el.id}:${clientId}`, structuredClone(el))
    changed = true
  }
  return changed
}

function patchWhiteboardFiles(m: YFile, files: Record<string, unknown>) {
  let map = m.get('whiteboardFiles') as Y.Map<unknown> | undefined
  if (!map) m.set('whiteboardFiles', (map = new Y.Map()))
  let changed = false
  for (const [id, data] of Object.entries(files)) {
    if (map.has(id)) continue
    map.set(id, data)
    changed = true
  }
  return changed
}

export function deleteFile(doc: Y.Doc, id: string, at = Date.now()) {
  const m = filesOf(doc).get(id)
  if (!m) return
  // Same millisecond as the last edit still counts as deleted.
  m.set('deletedAt', Math.max(at, (m.get('updatedAt') as number) ?? 0))
}

/**
 * Brings notes made outside this document (an older vault, or a copy started before this
 * browser reached the server) into it. With `onlyNewer`, a note replaces the document's copy
 * only when it was edited later, field by field, so nothing newer is lost.
 */
export function importFiles(doc: Y.Doc, files: VaultFile[], { onlyNewer = false, deletes = {} as Record<string, number> } = {}) {
  const map = filesOf(doc)
  for (const f of files) {
    const m = map.get(f.id)
    if (deletes[f.id] !== undefined && deletes[f.id] >= f.updatedAt) continue
    if (!m) writeFile(doc, f)
    else if (!onlyNewer || f.updatedAt > ((m.get('updatedAt') as number) ?? 0)) patchFile(doc, f.id, f)
  }
  for (const [id, at] of Object.entries(deletes)) {
    const m = map.get(id)
    if (m && ((m.get('updatedAt') as number) ?? 0) <= at && !m.get('deletedAt')) m.set('deletedAt', at)
  }
}

/** Every note in `from`, visible or deleted, merged into `to` with `onlyNewer`. */
export function importDoc(to: Y.Doc, from: Y.Doc) {
  const files: VaultFile[] = []
  const deletes: Record<string, number> = {}
  filesOf(from).forEach((m, id) => {
    if (isVisible(m)) files.push(readFile(m))
    else deletes[id] = m.get('deletedAt') as number
  })
  importFiles(to, files, { onlyNewer: true, deletes })
  for (const path of foldersOf(from).keys()) foldersOf(to).set(path, true)
}

/** Ids of the notes a transaction touched, read from Yjs change events. */
export function touchedIds(events: Y.YEvent<Y.AbstractType<unknown>>[], files: Y.Map<YFile>) {
  const ids = new Set<string>()
  for (const e of events) {
    if (e.target === files) e.changes.keys.forEach((_, k) => ids.add(k))
    else if (typeof e.path[0] === 'string') ids.add(e.path[0])
  }
  return ids
}

/** The Y.Text a cursor sits in: a note's text, or the code of one of its diagrams. */
export function textOf(doc: Y.Doc, fileId: string, field: string): Y.Text | null {
  const m = filesOf(doc).get(fileId)
  if (!m) return null
  if (field === 'doc') return (m.get('doc') as Y.Text) ?? null
  const d = (m.get('diagrams') as Y.Array<Y.Map<unknown>> | undefined)?.toArray().find((x) => x.get('id') === field)
  return (d?.get('code') as Y.Text) ?? null
}
