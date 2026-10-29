import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import * as Y from 'yjs'
import { seedState } from './seed'
import { GRAPH_TAB, type Diagram, type VaultFile, type VaultState } from './types'
import { findByTitle, uid } from './lib/links'
import { idbGet, idbSetMany } from './lib/idb'
import { CollabClient, type RemoteStatus } from './lib/collab'
import { loadName, loadToken, saveName, saveToken, type LegacyPending, type LegacySnapshot } from './lib/sync'
import { deleteFile, filesOf, foldersOf, importDoc, importFiles, isVisible, patchFile, readFile, readVault, textOf, touchedIds, writeFile } from './lib/vaultDoc'

/** Pre-IndexedDB storage; read once to migrate, then left alone. */
const LEGACY_KEY = 'inkvault:v1'
const SAVE_MS = 250
const PEER_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#0090ff', '#8e4ec6', '#d6409f']

/**
 * `local` is the copy in this browser (IndexedDB); `remote` is the backend.
 * Losing `local` loses work, so the UI shows it loudly.
 */
export interface SaveStatus {
  local: 'loading' | 'saving' | 'saved' | 'error'
  /** `unauthorized`: the server wants an API token this browser does not have. */
  remote: RemoteStatus
  error?: string
}

/** Someone else with the vault open, and the note they are on. */
export interface Peer {
  id: number
  name: string
  color: string
  fileId?: string
}

/** Another person's caret in a text, as an index into it. */
export interface RemoteCaret {
  id: number
  name: string
  color: string
  index: number
}

/** Shown after reconnecting, when offline edits met edits made by others in the same notes. */
export interface MergeNotice {
  /** Notes edited here and elsewhere, now holding both sets of changes. */
  merged: { id: string; title: string }[]
  /** Notes deleted elsewhere but kept, because they were edited here afterwards. */
  kept: { id: string; title: string }[]
}

/** What the vault looks like where only this browser's view of it is kept. */
type Ui = Pick<VaultState, 'openTabs' | 'activeTab' | 'theme'>

type Action =
  | { t: 'data'; files: VaultState['files']; folders: string[] }
  | { t: 'ui'; ui: Ui }
  | { t: 'open'; id: string; newTab?: boolean }
  | { t: 'closeTab'; id: string }
  | { t: 'theme'; theme: VaultState['theme'] }

const EMPTY: VaultState = { files: {}, folders: [], openTabs: [], activeTab: null, theme: 'dark' }

/** Drops tabs whose note is gone, e.g. deleted by someone else. */
function fixTabs(s: VaultState): VaultState {
  const openTabs = s.openTabs.filter((t) => t.startsWith('__') || s.files[t])
  if (openTabs.length === s.openTabs.length) return s
  const activeTab = s.activeTab && openTabs.includes(s.activeTab) ? s.activeTab : (openTabs.at(-1) ?? null)
  return { ...s, openTabs, activeTab }
}

function reducer(s: VaultState, a: Action): VaultState {
  switch (a.t) {
    case 'data':
      return fixTabs({ ...s, files: a.files, folders: a.folders })
    case 'ui':
      return fixTabs({ ...s, ...a.ui })
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
    case 'theme':
      return { ...s, theme: a.theme }
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

const titlesOf = (files: VaultState['files'], ids: Iterable<string>) => [...ids].flatMap((id) => (files[id] ? [{ id, title: files[id].title }] : []))

/**
 * The vault lives in a Yjs document (see lib/vaultDoc.ts), saved in IndexedDB and shared live
 * with the server. React state mirrors it: each change re-reads only the notes it touched.
 *
 * A document made in this browser before it ever reached the server (the sample vault, or a
 * vault from an older version of the app) is "provisional". Merging two separately made Yjs
 * documents would pick one copy of each note at random, so on first contact the server's
 * document is taken instead and the provisional notes are copied in, newest edit winning.
 */
export function useVault() {
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const [status, setStatus] = useState<SaveStatus>({ local: 'loading', remote: 'syncing' })
  const [peers, setPeers] = useState<Peer[]>([])
  const [notice, setNotice] = useState<MergeNotice | null>(null)
  const [me, setMe] = useState(loadName)

  // Refs, because Yjs and socket callbacks run outside React's render cycle.
  const stateRef = useRef(state)
  stateRef.current = state
  const doc = useRef<Y.Doc | null>(null)
  const client = useRef<CollabClient | null>(null)
  const data = useRef({ files: EMPTY.files, folders: EMPTY.folders })
  const flags = useRef({ provisional: false, fresh: false })
  /** Notes edited here while disconnected, and notes the server changed since reconnecting. */
  const offline = useRef(new Set<string>())
  const touched = useRef(new Set<string>())
  const ready = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const token = useRef(loadToken())
  const name = useRef(me)

  const save = useCallback(async () => {
    const d = doc.current
    if (!d) return
    try {
      let bytes = Y.encodeStateAsUpdate(d)
      // Another tab may have saved edits this one has not seen; keep both. Only when both copies
      // come from the server's document: merging in a provisional one is what migration avoids,
      // and right after it the stored copy is still the provisional one this tab replaced.
      if (!flags.current.provisional) {
        const [other, otherProvisional] = await Promise.all([idbGet<Uint8Array>('ydoc'), idbGet<boolean>('provisional')])
        if (other && otherProvisional === false) bytes = Y.mergeUpdates([other, bytes])
      }
      const { openTabs, activeTab, theme } = stateRef.current
      await idbSetMany({ ydoc: bytes, ui: { openTabs, activeTab, theme }, provisional: flags.current.provisional, fresh: flags.current.fresh, offline: [...offline.current] })
      setStatus((st) => ({ ...st, local: 'saved', error: undefined }))
    } catch (e) {
      setStatus((st) => ({ ...st, local: 'error', error: e instanceof Error ? e.message : String(e) }))
    }
  }, [])

  const scheduleSave = useCallback(() => {
    if (!ready.current) return
    setStatus((st) => (st.local === 'error' || st.local === 'saving' ? st : { ...st, local: 'saving' }))
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(save, SAVE_MS)
  }, [save])

  /** Mirrors `d` into React state from now on. Returns the unsubscribe. */
  const bind = useCallback(
    (d: Y.Doc) => {
      const files = filesOf(d)
      const folders = foldersOf(d)
      data.current = readVault(d)
      dispatch({ t: 'data', ...data.current })
      const onFiles = (events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
        const ids = touchedIds(events, files)
        if (tr.origin === client.current) ids.forEach((id) => touched.current.add(id))
        else if (tr.local && !client.current?.connected) ids.forEach((id) => offline.current.add(id))
        if (tr.local) flags.current.fresh = false
        const next = { ...data.current.files }
        for (const id of ids) {
          const m = files.get(id)
          if (m && isVisible(m)) next[id] = readFile(m)
          else delete next[id]
        }
        data.current = { ...data.current, files: next }
        dispatch({ t: 'data', ...data.current })
      }
      const onFolders = () => {
        data.current = { ...data.current, folders: [...folders.keys()].sort() }
        dispatch({ t: 'data', ...data.current })
      }
      files.observeDeep(onFiles)
      folders.observe(onFolders)
      d.on('update', scheduleSave)
      return () => {
        files.unobserveDeep(onFiles)
        folders.unobserve(onFolders)
        d.off('update', scheduleSave)
      }
    },
    [scheduleSave],
  )

  const watchPeers = useCallback((c: CollabClient) => {
    const user = () => ({ name: name.current, color: PEER_COLORS[c.awareness.clientID % PEER_COLORS.length] })
    c.awareness.setLocalStateField('user', user())
    c.awareness.on('change', (_: unknown, origin: unknown) => {
      // Our own caret moving changes nothing on this screen.
      if (origin === 'local') return
      const list: Peer[] = []
      c.awareness.getStates().forEach((s, id) => {
        if (id !== c.awareness.clientID && s.user) list.push({ id, name: s.user.name, color: s.user.color, fileId: s.at?.file })
      })
      setPeers(list)
    })
  }, [])

  // Load from IndexedDB (or migrate an older vault), then connect.
  useEffect(() => {
    let alive = true
    let unbind = () => {}

    const connect = (d: Y.Doc) => {
      const c = new CollabClient(d, {
        token: token.current,
        onStatus: (remote) => setStatus((st) => ({ ...st, remote })),
        onSynced: () => {
          const merged = [...offline.current].filter((id) => touched.current.has(id))
          const kept = [...offline.current].filter((id) => filesOf(d).get(id)?.get('deletedAt') && data.current.files[id])
          if (merged.length || kept.length) setNotice({ merged: titlesOf(data.current.files, merged), kept: titlesOf(data.current.files, kept) })
          offline.current.clear()
          touched.current.clear()
          void save()
        },
      })
      client.current = c
      watchPeers(c)
    }

    /** Syncs a fresh document with the server, then moves the provisional notes into it. */
    const connectProvisional = (local: Y.Doc) => {
      const remote = new Y.Doc()
      let busy = false
      const c = new CollabClient(remote, {
        token: token.current,
        onStatus: (r) => setStatus((st) => ({ ...st, remote: r })),
        onSynced: async () => {
          if (!flags.current.provisional || busy) return
          busy = true
          try {
            if (!filesOf(remote).size) await importLegacyServer(remote, token.current)
            // The untouched sample vault gives way to a server that already has notes.
            if (!(flags.current.fresh && filesOf(remote).size)) remote.transact(() => importDoc(remote, local))
          } catch {
            // The older vault could not be read; try again rather than start without it.
            busy = false
            window.setTimeout(c.reconnect, 5000)
            return
          }
          if (!alive) return
          flags.current = { provisional: false, fresh: false }
          offline.current.clear()
          touched.current.clear()
          unbind()
          doc.current = remote
          unbind = bind(remote)
          local.destroy()
          void save()
        },
      })
      client.current = c
      watchPeers(c)
    }

    Promise.all([
      idbGet<Uint8Array>('ydoc'),
      idbGet<Ui>('ui'),
      idbGet<boolean>('provisional'),
      idbGet<boolean>('fresh'),
      idbGet<string[]>('offline'),
      idbGet<VaultState>('state'),
      idbGet<LegacyPending>('pending'),
    ])
      .catch((e) => {
        // IndexedDB unavailable (e.g. some private windows): keep working, but say so.
        setStatus((st) => ({ ...st, local: 'error', error: e instanceof Error ? e.message : String(e) }))
        return [] as never[]
      })
      .then(([bytes, ui, provisional, fresh, off, legacy, legacyPending]) => {
        if (!alive) return
        const d = new Y.Doc()
        let view: Ui | undefined = ui
        if (bytes) {
          Y.applyUpdate(d, bytes, 'load')
          flags.current = { provisional: !!provisional, fresh: !!fresh }
        } else {
          // First run of this version: start from the older vault, or the samples.
          const old = legacy ?? loadLegacy()
          const base = old ?? seedState()
          d.transact(() => {
            importFiles(d, Object.values(base.files), { deletes: legacyPending?.deletes })
            base.folders.forEach((p) => foldersOf(d).set(p, true))
          }, 'load')
          flags.current = { provisional: true, fresh: !old }
          view = { openTabs: base.openTabs, activeTab: base.activeTab, theme: base.theme }
        }
        off?.forEach((id) => offline.current.add(id))
        doc.current = d
        unbind = bind(d)
        if (view) dispatch({ t: 'ui', ui: view })
        ready.current = true
        void save()
        if (flags.current.provisional) connectProvisional(d)
        else connect(d)
      })

    return () => {
      alive = false
      unbind()
      client.current?.destroy()
      client.current = null
    }
  }, [bind, save, watchPeers])

  // Tabs and theme are saved too, so the vault reopens as it was left.
  useEffect(() => {
    if (ready.current) scheduleSave()
  }, [state.openTabs, state.activeTab, state.theme, scheduleSave])

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

  /** Runs `fn` as one change, which other people receive as one update. */
  const edit = useCallback((fn: (d: Y.Doc) => void) => {
    const d = doc.current
    if (d) d.transact(() => fn(d))
  }, [])

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
      edit((d) => {
        writeFile(d, file)
        if (folder) foldersOf(d).set(folder, true)
      })
      dispatch({ t: 'open', id: file.id, newTab: true })
      return file
    },
    [state.files, edit],
  )

  const api = useMemo(() => {
    const replace = (s: VaultState) => {
      edit((d) => {
        const now = Date.now()
        filesOf(d).forEach((m, id) => !s.files[id] && isVisible(m) && deleteFile(d, id, now))
        // Newer than any delete, so the backup's notes show even where they were deleted.
        for (const f of Object.values(s.files)) writeFile(d, { ...f, updatedAt: Math.max(f.updatedAt, now + 1) })
        const folders = foldersOf(d)
        ;[...folders.keys()].forEach((p) => !s.folders.includes(p) && folders.delete(p))
        s.folders.forEach((p) => folders.set(p, true))
      })
      dispatch({ t: 'ui', ui: { openTabs: s.openTabs ?? [], activeTab: s.activeTab ?? null, theme: s.theme ?? stateRef.current.theme } })
    }
    return {
      patch: (id: string, patch: Partial<VaultFile>) => edit((d) => patchFile(d, id, patch)),
      remove: (id: string) => edit((d) => deleteFile(d, id)),
      open: (id: string, newTab = false) => dispatch({ t: 'open', id, newTab }),
      closeTab: (id: string) => dispatch({ t: 'closeTab', id }),
      addFolder: (path: string) => edit((d) => foldersOf(d).set(path, true)),
      deleteFolder: (path: string) =>
        edit((d) => {
          const inFolder = (p: string) => p === path || p.startsWith(path + '/')
          filesOf(d).forEach((m, id) => isVisible(m) && inFolder(m.get('folder') as string) && deleteFile(d, id))
          const folders = foldersOf(d)
          ;[...folders.keys()].filter(inFolder).forEach((p) => folders.delete(p))
        }),
      renameFolder: (from: string, to: string) =>
        edit((d) => {
          const move = (p: string) => (p === from ? to : p.startsWith(from + '/') ? to + p.slice(from.length) : p)
          filesOf(d).forEach((m, id) => {
            const folder = m.get('folder') as string
            if (isVisible(m) && move(folder) !== folder) patchFile(d, id, { folder: move(folder) })
          })
          const folders = foldersOf(d)
          for (const p of [...folders.keys()]) {
            if (move(p) === p) continue
            folders.delete(p)
            folders.set(move(p), true)
          }
        }),
      setTheme: (theme: VaultState['theme']) => dispatch({ t: 'theme', theme }),
      replace,
      reset: () => replace(seedState()),
    }
  }, [edit])

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
      edit(() => {
        for (const other of Object.values(state.files)) {
          if (other.id !== id && re.test(other.doc)) api.patch(other.id, { doc: other.doc.replace(re, `[[${title}`) })
          re.lastIndex = 0
        }
        api.patch(id, { title })
      })
    },
    [state.files, api, edit],
  )

  const setToken = useCallback((t: string) => {
    token.current = t.trim()
    saveToken(token.current)
    client.current?.setToken(token.current)
  }, [])

  const retrySync = useCallback(() => client.current?.reconnect(), [])

  const setName = useCallback((n: string) => {
    name.current = n.trim() || name.current
    saveName(name.current)
    setMe(name.current)
    const c = client.current
    if (c) c.awareness.setLocalStateField('user', { ...c.awareness.getLocalState()?.user, name: name.current })
  }, [])

  /** Tells others which note this browser has open (`null`: none). */
  const setViewing = useCallback((fileId: string | null) => {
    client.current?.awareness.setLocalStateField('at', fileId ? { file: fileId } : null)
  }, [])

  /** Shares this browser's caret in a note's text (`field` 'doc') or a diagram's code (its id). */
  const setCursor = useCallback((fileId: string, field: string, index: number | null) => {
    const c = client.current
    const d = doc.current
    if (!c || !d || flags.current.provisional) return
    const text = index == null ? null : textOf(d, fileId, field)
    // Relative positions stay on the same character while others type before it.
    const head = text ? Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, Math.min(index!, text.length))) : undefined
    c.awareness.setLocalStateField('at', { file: fileId, field, head })
  }, [])

  /** Others' carets in a text, resolved against the document as it is now. */
  const caretsIn = useCallback(
    (fileId: string, field: string): RemoteCaret[] => {
      const c = client.current
      const d = doc.current
      const text = d && textOf(d, fileId, field)
      if (!c || !d || !text) return []
      const out: RemoteCaret[] = []
      c.awareness.getStates().forEach((s, id) => {
        if (id === c.awareness.clientID || s.at?.file !== fileId || s.at.field !== field || !s.at.head || !s.user) return
        const pos = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(s.at.head), d)
        if (pos && pos.type === text) out.push({ id, name: s.user.name, color: s.user.color, index: pos.index })
      })
      return out
    },
    // `peers` changes whenever a caret moves, so callers re-render with fresh positions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peers],
  )

  return {
    state,
    status,
    retrySync,
    setToken,
    ...api,
    createFile,
    upsertDiagram,
    rename,
    me,
    setName,
    peers,
    setViewing,
    setCursor,
    caretsIn,
    notice,
    dismissNotice: () => setNotice(null),
  }
}

/** Moves the server's vault from before live collaboration into `d`, once. */
async function importLegacyServer(d: Y.Doc, token: string) {
  const res = await fetch('/api/vault', { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Server replied ${res.status}`)
  const snap = (await res.json()) as LegacySnapshot
  d.transact(() => {
    importFiles(d, snap.files, { deletes: Object.fromEntries(snap.tombstones.map((t) => [t.id, t.at])) })
    snap.folders?.value.forEach((p) => foldersOf(d).set(p, true))
  })
}

export type Vault = ReturnType<typeof useVault>
