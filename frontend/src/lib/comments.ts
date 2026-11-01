import * as Y from 'yjs'
import type { CommentAnchor, CommentThread, CommentReply } from '../types'
import { filesOf, textOf } from './vaultDoc'

const PREFIX = 'thread:'

export function addThread(doc: Y.Doc, fileId: string, thread: CommentThread) {
  const file = filesOf(doc).get(fileId)
  if (!file) return
  const existing = file.get(PREFIX + thread.id)
  if (existing instanceof Y.Map) {
    for (const reply of thread.replies) if (!existing.has('reply:' + reply.id)) existing.set('reply:' + reply.id, reply)
    if ((thread.resolvedAt ?? 0) > (existing.get('resolvedAt') as number ?? 0)) {
      existing.set('resolved', thread.resolved)
      existing.set('resolvedAt', thread.resolvedAt)
    }
    return
  }
  const text = textOf(doc, fileId, thread.anchor.field)
  const anchor = { ...thread.anchor }
  const expected = anchor.currentText ?? anchor.quote
  if (text && !anchor.missing && text.toString().slice(anchor.start, anchor.end) !== expected) {
    const start = text.toString().indexOf(expected)
    if (expected && start >= 0 && text.toString().indexOf(expected, start + 1) < 0) {
      anchor.start = start; anchor.end = start + expected.length
    } else anchor.missing = true
  }
  const map = new Y.Map<unknown>()
  map.set('data', { ...thread, anchor, replies: [] })
  map.set('resolved', thread.resolved)
  map.set('resolvedAt', thread.resolvedAt ?? 0)
  for (const reply of thread.replies) map.set('reply:' + reply.id, reply)
  file.set(PREFIX + thread.id, map)
  if (text && !anchor.missing) {
    const { start, end } = anchor
    map.set('start', Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, Math.min(start, text.length), 0)))
    map.set('end', Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, Math.min(end, text.length), -1)))
  }
}

export function readThreads(doc: Y.Doc, fileId: string): CommentThread[] {
  const out: CommentThread[] = []
  filesOf(doc).get(fileId)?.forEach((value, key) => {
    if (!key.startsWith(PREFIX) || !(value instanceof Y.Map)) return
    const data = value.get('data') as CommentThread
    if (!data) return
    const anchor: CommentAnchor = { ...data.anchor }
    const text = textOf(doc, fileId, anchor.field)
    const start = value.get('start')
    const end = value.get('end')
    const a = start && Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(start), doc)
    const b = end && Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(end), doc)
    if (text && a?.type === text && b?.type === text && b.index > a.index) {
      anchor.start = a.index
      anchor.end = b.index
      anchor.missing = false
      anchor.currentText = text.toString().slice(a.index, b.index)
    } else anchor.missing = true
    const replies: CommentReply[] = []
    value.forEach((v, k) => { if (k.startsWith('reply:')) replies.push(v as CommentReply) })
    replies.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    out.push({ ...data, anchor, resolved: Boolean(value.get('resolved')), resolvedAt: value.get('resolvedAt') as number, replies })
  })
  return out.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function replyToThread(doc: Y.Doc, fileId: string, threadId: string, reply: CommentReply) {
  const thread = filesOf(doc).get(fileId)?.get(PREFIX + threadId)
  if (thread instanceof Y.Map) thread.set('reply:' + reply.id, reply)
}

export function resolveThread(doc: Y.Doc, fileId: string, threadId: string, resolved: boolean) {
  const thread = filesOf(doc).get(fileId)?.get(PREFIX + threadId)
  if (thread instanceof Y.Map) { thread.set('resolved', resolved); thread.set('resolvedAt', Date.now()) }
}
