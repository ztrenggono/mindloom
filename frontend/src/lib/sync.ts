/**
 * Change tracking and merging for backend sync (see ../../backend). Local edits are
 * recorded as pending; each push sends them and pulls the server's copy back.
 * Conflicts resolve per file by last write wins on `updatedAt`.
 */
import type { VaultFile, VaultState } from '../types'

export interface Pending {
  /** Ids of files edited locally and not yet accepted by the server. */
  upserts: string[]
  /** Deleted file id → deletion time. */
  deletes: Record<string, number>
  folders: boolean
  /** When the folder list last changed, locally or from the server. */
  foldersAt: number
}

export const emptyPending = (): Pending => ({ upserts: [], deletes: {}, folders: false, foldersAt: 0 })

export const hasPending = (p: Pending) => p.upserts.length > 0 || Object.keys(p.deletes).length > 0 || p.folders

/** Records what changed between two states. Object identity marks a file as edited. */
export function diff(prev: VaultState, next: VaultState, p: Pending): Pending {
  if (prev.files === next.files && prev.folders === next.folders) return p
  const upserts = new Set(p.upserts)
  const deletes = { ...p.deletes }
  for (const id in next.files) {
    if (prev.files[id] !== next.files[id]) {
      upserts.add(id)
      delete deletes[id]
    }
  }
  for (const id in prev.files) {
    if (!next.files[id]) {
      upserts.delete(id)
      deletes[id] = Date.now()
    }
  }
  const folders = prev.folders !== next.folders
  return { upserts: [...upserts], deletes, folders: p.folders || folders, foldersAt: folders ? Date.now() : p.foldersAt }
}

export interface SyncRequest {
  upserts: VaultFile[]
  deletes: { id: string; at: number }[]
  folders?: { value: string[]; at: number }
}

export interface Snapshot {
  files: VaultFile[]
  tombstones: { id: string; at: number }[]
  folders: { value: string[]; at: number } | null
}

export function buildRequest(s: VaultState, p: Pending): SyncRequest {
  return {
    upserts: p.upserts.map((id) => s.files[id]).filter(Boolean),
    deletes: Object.entries(p.deletes).map(([id, at]) => ({ id, at })),
    folders: p.folders ? { value: s.folders, at: p.foldersAt } : undefined,
  }
}

/** Drops pending entries the server has accepted, keeping ones edited again while the request was in flight. */
export function acknowledge(s: VaultState, p: Pending, sent: SyncRequest): Pending {
  const sentAt = new Map(sent.upserts.map((f) => [f.id, f.updatedAt]))
  const deletes = { ...p.deletes }
  for (const d of sent.deletes) if (deletes[d.id] === d.at) delete deletes[d.id]
  return {
    upserts: p.upserts.filter((id) => !(sentAt.has(id) && s.files[id]?.updatedAt === sentAt.get(id))),
    deletes,
    folders: p.folders && !(sent.folders && sent.folders.at === p.foldersAt),
    foldersAt: p.foldersAt,
  }
}

/**
 * Folds the server's vault into the local one. Returns the same state object when nothing
 * changed. `fresh` means the local vault is the untouched sample vault, which the server's
 * copy replaces instead of being uploaded over it.
 */
export function merge(s: VaultState, p: Pending, snap: Snapshot, fresh: boolean): { state: VaultState; pending: Pending } {
  const dirty = new Set(p.upserts)
  const upserts = new Set(p.upserts)
  let files = s.files
  const edit = () => (files === s.files ? (files = { ...s.files }) : files)

  if (fresh && snap.files.length) {
    files = Object.fromEntries(snap.files.map((f) => [f.id, f]))
  } else {
    const onServer = new Set(snap.files.map((f) => f.id))
    const dead = new Map(snap.tombstones.map((t) => [t.id, t.at]))
    for (const f of snap.files) {
      if (dirty.has(f.id) || p.deletes[f.id]) continue
      const local = files[f.id]
      if (!local || f.updatedAt > local.updatedAt) edit()[f.id] = f
    }
    for (const [id, at] of dead) {
      const local = files[id]
      if (local && !dirty.has(id) && local.updatedAt <= at) delete edit()[id]
    }
    // Files the server has never seen (e.g. made before the backend existed) get uploaded.
    for (const id in files) if (!onServer.has(id) && !dead.has(id)) upserts.add(id)
  }

  let folders = s.folders
  let { folders: foldersDirty, foldersAt } = p
  const sf = snap.folders
  if (!foldersDirty && sf && (sf.at > foldersAt || fresh)) {
    if (sf.value.join('\n') !== s.folders.join('\n')) folders = sf.value
    foldersAt = sf.at
  } else if (!sf && s.folders.length) foldersDirty = true

  const pending = { ...p, upserts: [...upserts], folders: foldersDirty, foldersAt }
  if (files === s.files && folders === s.folders) return { state: s, pending }
  const openTabs = s.openTabs.filter((t) => t.startsWith('__') || files[t])
  const activeTab = s.activeTab && (s.activeTab.startsWith('__') || files[s.activeTab]) ? s.activeTab : (openTabs[0] ?? null)
  return { state: { ...s, files, folders, openTabs, activeTab }, pending }
}

/** The backend's API_TOKEN, kept per browser. Storage can be blocked, so failures fall back to none. */
const TOKEN_KEY = 'mindloom:token'

export function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* blocked storage: the token lasts until reload */
  }
}
