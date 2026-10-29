import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { seedState } from './seed'
import { GRAPH_TAB, type Diagram, type VaultFile, type VaultState } from './types'
import { findByTitle, uid } from './lib/links'
import { idbGet, idbSetMany } from './lib/idb'
import { acknowledge, buildRequest, diff, emptyPending, hasPending, loadToken, merge, saveToken, type Pending, type Snapshot } from './lib/sync'

/** Pre-IndexedDB storage; read once to migrate, then left alone. */
const LEGACY_KEY = 'inkvault:v1'
const RETRY_MS = 15_000
const PULL_MS = 30_000

/**
 * `local` is the copy in this browser (IndexedDB); `remote` is the backend.
 * Losing `local` loses work, so the UI shows it loudly.
 */
export interface SaveStatus {
  local: 'loading' | 'saving' | 'saved' | 'error'
  /** `unauthorized`: the server wants an API token this browser does not have. */
  remote: 'syncing' | 'synced' | 'pending' | 'offline' | 'unauthorized'
  error?: string
}

type Action =
  | { t: 'patchFile'; id: string; patch: Partial<VaultFile> }
  | { t: 'addFile'; file: VaultFile }
  | { t: 'deleteFile'; id: string }
  | { t: 'open'; id: string; newTab?: boolean }
  | { t: 'closeTab'; id: string }
  | { t: 'addFolder'; path: string }
  | { t: 'deleteFolder'; path: string }
  | { t: 'renameFolder'; from: string; to: string }
  | { t: 'theme'; theme: VaultState['theme'] }
  | { t: 'replace'; state: VaultState }

function reducer(s: VaultState, a: Action): VaultState {
  switch (a.t) {
    case 'patchFile': {
      const f = s.files[a.id]
      if (!f) return s
      return { ...s, files: { ...s.files, [a.id]: { ...f, ...a.patch, updatedAt: Date.now() } } }
    }
    case 'addFile': {
      const folders = a.file.folder && !s.folders.includes(a.file.folder) ? [...s.folders, a.file.folder] : s.folders
      return {
        ...s,
        folders,
        files: { ...s.files, [a.file.id]: a.file },
        openTabs: [...s.openTabs, a.file.id],
        activeTab: a.file.id,
      }
    }
    case 'deleteFile': {
      const files = { ...s.files }
      delete files[a.id]
      const openTabs = s.openTabs.filter((t) => t !== a.id)
      return { ...s, files, openTabs, activeTab: s.activeTab === a.id ? (openTabs.at(-1) ?? null) : s.activeTab }
    }
    case 'open': {
      if (s.openTabs.includes(a.id)) return { ...s, activeTab: a.id }
      // Like Obsidian: open in the current tab unless asked for a new one.
      let openTabs = [...s.openTabs]
      const idx = s.activeTab ? openTabs.indexOf(s.activeTab) : -1
      if (!a.newTab && idx >= 0 && s.activeTab !== GRAPH_TAB) openTabs[idx] = a.id
      else openTabs = [...openTabs, a.id]
      return { ...s, openTabs, activeTab: a.id }
    }
    case 'closeTab': {
      const i = s.openTabs.indexOf(a.id)
      const openTabs = s.openTabs.filter((t) => t !== a.id)
      const activeTab = s.activeTab === a.id ? (openTabs[Math.max(0, i - 1)] ?? null) : s.activeTab
      return { ...s, openTabs, activeTab }
    }
    case 'addFolder':
      return s.folders.includes(a.path) ? s : { ...s, folders: [...s.folders, a.path].sort() }
    case 'deleteFolder': {
      const inFolder = (p: string) => p === a.path || p.startsWith(a.path + '/')
      const files = Object.fromEntries(Object.entries(s.files).filter(([, f]) => !inFolder(f.folder)))
      const openTabs = s.openTabs.filter((t) => t === GRAPH_TAB || files[t])
      return {
        ...s,
        files,
        folders: s.folders.filter((f) => !inFolder(f)),
        openTabs,
        activeTab: s.activeTab && openTabs.includes(s.activeTab) ? s.activeTab : (openTabs[0] ?? null),
      }
    }
    case 'renameFolder': {
      const move = (p: string) => (p === a.from ? a.to : p.startsWith(a.from + '/') ? a.to + p.slice(a.from.length) : p)
      // Bump updatedAt on moved files so other devices pick up the move when they sync.
      const now = Date.now()
      const files = Object.fromEntries(Object.entries(s.files).map(([k, f]) => [k, move(f.folder) === f.folder ? f : { ...f, folder: move(f.folder), updatedAt: now }]))
      return { ...s, files, folders: [...new Set(s.folders.map(move))].sort() }
    }
    case 'theme':
      return { ...s, theme: a.theme }
    case 'replace':
      return a.state
  }
}

function loadLegacy(): VaultState | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw) return JSON.parse(raw) as VaultState
  } catch {
    /* unreadable: ignore */
  }
  return null
}

export function useVault() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadLegacy() ?? seedState())
  const [status, setStatus] = useState<SaveStatus>({ local: 'loading', remote: 'syncing' })

  // Refs, because the save and sync loops run outside React's render cycle.
  const stateRef = useRef(state)
  stateRef.current = state
  const prev = useRef(state)
  const pending = useRef<Pending>(emptyPending())
  const ready = useRef(false)
  // True while the vault is the untouched sample vault, which the server's copy should replace.
  const fresh = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const syncTimer = useRef<number | undefined>(undefined)
  const syncing = useRef(false)
  const token = useRef(loadToken())

  const persist = useCallback(async () => {
    try {
      await idbSetMany({ state: stateRef.current, pending: pending.current })
      setStatus((st) => ({ ...st, local: 'saved', error: undefined }))
    } catch (e) {
      setStatus((st) => ({ ...st, local: 'error', error: e instanceof Error ? e.message : String(e) }))
    }
  }, [])

  const push = useCallback(async () => {
    window.clearTimeout(syncTimer.current)
    if (syncing.current) return
    syncing.current = true
    setStatus((st) => ({ ...st, remote: 'syncing' }))
    const sent = buildRequest(stateRef.current, pending.current)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token.current && { authorization: `Bearer ${token.current}` }) },
        body: JSON.stringify(sent),
        signal: AbortSignal.timeout(15_000),
      })
      if (res.status === 401) {
        // Retrying cannot help until a token is entered; setToken pushes again.
        setStatus((st) => ({ ...st, remote: 'unauthorized' }))
        return
      }
      if (!res.ok) throw new Error(`Server replied ${res.status}`)
      const snap = (await res.json()) as Snapshot
      const acked = acknowledge(stateRef.current, pending.current, sent)
      const m = merge(stateRef.current, acked, snap, fresh.current)
      fresh.current = false
      pending.current = m.pending
      if (m.state !== stateRef.current) {
        // Point the diff baseline at the merged state so pulled changes are not sent back.
        prev.current = m.state
        stateRef.current = m.state
        dispatch({ t: 'replace', state: m.state })
      }
      void persist()
      const more = hasPending(pending.current)
      setStatus((st) => ({ ...st, remote: more ? 'pending' : 'synced' }))
      if (more) syncTimer.current = window.setTimeout(push, 500)
    } catch {
      setStatus((st) => ({ ...st, remote: 'offline' }))
      syncTimer.current = window.setTimeout(push, RETRY_MS)
    } finally {
      syncing.current = false
    }
  }, [persist])

  // Load from IndexedDB, migrating the old localStorage copy on first run.
  useEffect(() => {
    let alive = true
    Promise.all([idbGet<VaultState>('state'), idbGet<Pending>('pending')])
      .then(([saved, savedPending]) => {
        if (!alive) return
        if (saved) {
          prev.current = saved
          stateRef.current = saved
          dispatch({ t: 'replace', state: saved })
          pending.current = savedPending ?? emptyPending()
        } else fresh.current = !loadLegacy()
        ready.current = true
        void persist()
        void push()
      })
      .catch((e) => {
        // IndexedDB unavailable (e.g. some private windows): keep working, but say so.
        ready.current = true
        setStatus((st) => ({ ...st, local: 'error', error: e instanceof Error ? e.message : String(e) }))
        void push()
      })
    // Pull edits from other devices when the tab regains focus, and now and then while it is open.
    const online = () => void push()
    const visible = () => document.visibilityState === 'visible' && ready.current && void push()
    const poll = window.setInterval(visible, PULL_MS)
    window.addEventListener('online', online)
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      alive = false
      window.clearInterval(poll)
      window.removeEventListener('online', online)
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [persist, push])

  // Every edit: record what changed, save locally soon, sync a little later.
  useEffect(() => {
    if (!ready.current || state === prev.current) return
    pending.current = diff(prev.current, state, pending.current)
    prev.current = state
    if (hasPending(pending.current)) fresh.current = false
    // An unauthorized server stays so until a token is entered.
    setStatus((st) => ({ ...st, local: st.local === 'error' ? 'error' : 'saving', remote: st.remote === 'offline' || st.remote === 'unauthorized' ? st.remote : 'pending' }))
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(persist, 250)
    window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(push, 1000)
  }, [state, persist, push])

  // Warn before closing the tab while an edit has not reached IndexedDB.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status.local === 'saving' || status.local === 'error') e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status.local])

  useEffect(() => {
    // Disable transitions for the swap so every color transition does not fire at once.
    const style = document.createElement('style')
    style.append(document.createTextNode('*,*::before,*::after{transition:none !important}'))
    document.head.append(style)
    document.documentElement.dataset.theme = state.theme
    void document.body.offsetHeight
    requestAnimationFrame(() => requestAnimationFrame(() => style.remove()))
    return () => style.remove()
  }, [state.theme])

  const createFile = useCallback(
    (title = 'Untitled', folder = '', extra: Partial<VaultFile> = {}) => {
      let name = title
      let n = 1
      while (findByTitle(state.files, name)) name = `${title} ${n++}`
      const t = Date.now()
      const file: VaultFile = {
        id: uid(),
        title: name,
        folder,
        doc: `# ${name}\n\n`,
        diagrams: [],
        whiteboard: null,
        layout: 'doc',
        createdAt: t,
        updatedAt: t,
        ...extra,
      }
      dispatch({ t: 'addFile', file })
      return file
    },
    [state.files],
  )

  const api = useMemo(
    () => ({
      patch: (id: string, patch: Partial<VaultFile>) => dispatch({ t: 'patchFile', id, patch }),
      remove: (id: string) => dispatch({ t: 'deleteFile', id }),
      open: (id: string, newTab = false) => dispatch({ t: 'open', id, newTab }),
      closeTab: (id: string) => dispatch({ t: 'closeTab', id }),
      addFolder: (path: string) => dispatch({ t: 'addFolder', path }),
      deleteFolder: (path: string) => dispatch({ t: 'deleteFolder', path }),
      renameFolder: (from: string, to: string) => dispatch({ t: 'renameFolder', from, to }),
      setTheme: (theme: VaultState['theme']) => dispatch({ t: 'theme', theme }),
      replace: (s: VaultState) => dispatch({ t: 'replace', state: s }),
      reset: () => dispatch({ t: 'replace', state: seedState() }),
    }),
    [],
  )

  const upsertDiagram = useCallback(
    (fileId: string, d: Diagram) => {
      const f = state.files[fileId]
      if (!f) return
      const exists = f.diagrams.some((x) => x.id === d.id)
      api.patch(fileId, { diagrams: exists ? f.diagrams.map((x) => (x.id === d.id ? d : x)) : [...f.diagrams, d] })
    },
    [state.files, api],
  )

  /** Renames a note and rewrites every [[link]] that pointed at the old title. */
  const rename = useCallback(
    (id: string, title: string) => {
      const f = state.files[id]
      if (!f || !title || title === f.title) return
      const esc = f.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`\\[\\[${esc}(?=[\\]|#])`, 'gi')
      for (const other of Object.values(state.files)) {
        if (other.id !== id && re.test(other.doc)) api.patch(other.id, { doc: other.doc.replace(re, `[[${title}`) })
        re.lastIndex = 0
      }
      api.patch(id, { title })
    },
    [state.files, api],
  )

  const setToken = useCallback(
    (t: string) => {
      token.current = t.trim()
      saveToken(token.current)
      void push()
    },
    [push],
  )

  return { state, status, retrySync: push, setToken, ...api, createFile, upsertDiagram, rename }
}

export type Vault = ReturnType<typeof useVault>
