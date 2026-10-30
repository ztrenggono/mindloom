import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Files, Search, Hash, Network, Command as CommandIcon, FilePlus, Upload, Sun, Moon, RotateCcw, X, PanelLeft, PanelRight, Download } from 'lucide-react'
import { useVault } from './store'
import { GRAPH_TAB, type DiagramType, type VaultState } from './types'
import { Sidebar, type SideView } from './components/Sidebar'
import { RightPanel } from './components/RightPanel'
import { GraphView } from './components/GraphView'
import { CommandPalette, type Command } from './components/CommandPalette'
import { FileView } from './components/FileView'
import { backlinks, extractLinks, findByTitle, uid } from './lib/links'
import { wordCount } from './lib/markdown'
import type { Hit } from './lib/search'
import { convertMermaidFences, fromMermaid } from './dsl/mermaid'
import { download } from './dsl/DiagramView'
import { TEMPLATES } from './components/CanvasPanel'
import { SaveIndicator } from './components/SaveIndicator'
import { MergeNoticeCard, Presence } from './components/Presence'
import { linkHash, parseLink, type Target } from './lib/shareLink'
import { canvasTab } from './lib/canvasTab'
import { Tooltip } from './components/Tooltip'

/** Matches the .sidebar.closing transition in index.css. */
const SIDEBAR_EXIT_MS = 150

export default function App() {
  const vault = useVault()
  const { state } = vault
  const [side, setSide] = useState<SideView>('files')
  const [leftOpen, setLeftOpen] = useState(true)
  // Kept mounted for the exit animation, then removed so the workspace takes the space.
  const [leftMounted, setLeftMounted] = useState(true)
  useEffect(() => {
    if (leftOpen) return setLeftMounted(true)
    const t = window.setTimeout(() => setLeftMounted(false), SIDEBAR_EXIT_MS)
    return () => window.clearTimeout(t)
  }, [leftOpen])
  // Start with the right panel closed on smaller screens so the note and canvas get the room.
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth >= 1280)
  const [query, setQuery] = useState('')
  const [palette, setPalette] = useState<null | 'commands' | 'files'>(null)
  const [modes, setModes] = useState<Record<string, 'edit' | 'read'>>({})
  const [activeDiagram, setActiveDiagram] = useState<Record<string, string>>({})
  // Tied to a file, so opening another note later does not replay an old jump.
  const [scrollTo, setScrollTo] = useState<{ fileId: string; line: number; n: number } | undefined>()
  const importRef = useRef<HTMLInputElement>(null)
  // A shared link waiting for its note, which may arrive only after the first sync.
  const [wanted, setWanted] = useState<Target | null>(() => parseLink(location.hash))
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const onHash = () => setWanted(parseLink(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!wanted) return
    const f = state.files[wanted.fileId]
    if (!f) {
      // Only once this browser shows the server's vault can a missing note be called missing.
      if (!vault.live) return
      setMissing(true)
      setWanted(null)
      return
    }
    setWanted(null)
    setMissing(false)
    vault.open(f.id)
    if (wanted.diagramId) {
      if (f.layout === 'doc') vault.patch(f.id, { layout: 'both' })
      setActiveDiagram((s) => ({ ...s, [f.id]: wanted.diagramId! }))
    }
  }, [wanted, state.files, vault])

  const file = state.activeTab && state.activeTab !== GRAPH_TAB ? (state.files[state.activeTab] ?? null) : null
  const mode = file ? (modes[file.id] ?? 'read') : 'read'
  const setMode = (m: 'edit' | 'read') => file && setModes((s) => ({ ...s, [file.id]: m }))
  const titles = useMemo(() => Object.values(state.files).map((f) => f.title), [state.files])

  // The address bar always links to what is open, so it can be copied from there too.
  const shownDiagram = file && file.layout !== 'doc' ? canvasTab(file, activeDiagram[file.id] ?? '') : undefined
  useEffect(() => {
    if (wanted || vault.status.local === 'loading') return
    const hash = file ? linkHash({ fileId: file.id, diagramId: shownDiagram || undefined }) : ''
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search)
  }, [file, shownDiagram, wanted, vault.status.local])

  const openTitle = useCallback(
    (id: string | null, title: string, newTab = false) => {
      if (id) return vault.open(id, newTab)
      const existing = findByTitle(state.files, title)
      if (existing) return vault.open(existing.id, newTab)
      const f = vault.createFile(title, file?.folder ?? '')
      setModes((s) => ({ ...s, [f.id]: 'edit' }))
    },
    [vault, state.files, file?.folder],
  )

  const newNote = useCallback(() => {
    const f = vault.createFile('Untitled', file?.folder ?? '')
    setModes((s) => ({ ...s, [f.id]: 'edit' }))
  }, [vault, file?.folder])

  const newDiagramNote = (type: DiagramType) => {
    const d = { id: uid(), type, title: TEMPLATES[type].label, code: TEMPLATES[type].code }
    vault.createFile('Untitled diagram', file?.folder ?? '', { layout: 'both', diagrams: [d] })
  }

  const openGraph = () => vault.open(GRAPH_TAB, true)

  const exportVault = () => download(URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })), 'mindloom-backup.json')

  const onImport = async (list: FileList | null) => {
    if (!list) return
    for (const f of Array.from(list)) {
      const text = await f.text()
      const base = f.name.replace(/\.[^.]+$/, '')
      if (f.name.endsWith('.json')) {
        try {
          const s = JSON.parse(text) as VaultState
          if (s.files && confirm('Replace the whole vault with this backup?')) vault.replace(s)
        } catch {
          alert('Not a valid Mindloom backup')
        }
      } else if (/\.(mmd|mermaid)$/.test(f.name)) {
        const d = fromMermaid(text)
        if (!d) {
          alert(`${f.name}: only Mermaid flowcharts, sequence diagrams, ER diagrams and mind maps can be imported`)
          continue
        }
        const name = d.title ?? base
        vault.createFile(name, file?.folder ?? '', { layout: 'canvas', doc: `# ${name}\n\nImported from \`${f.name}\`.\n`, diagrams: [{ id: uid(), title: name, type: d.type, code: d.code }] })
      } else if (/\.(eraser|txt|dsl)$/.test(f.name)) {
        const type: DiagramType = /^\s*\w+\s*(\[[^\]]*\])?\s*\{\s*\n\s*\w+\s+\w+/m.test(text) && /\.\w+\s*[<>-]/.test(text) ? 'erd' : /\bactivate\b|autoNumber/.test(text) ? 'sequence' : 'flowchart'
        vault.createFile(base, file?.folder ?? '', { layout: 'canvas', doc: `# ${base}\n\nImported from \`${f.name}\`.\n`, diagrams: [{ id: uid(), title: base, type, code: text }] })
      } else {
        vault.createFile(base, file?.folder ?? '', { doc: convertMermaidFences(text) })
      }
    }
  }

  const linkMention = (sourceId: string) => {
    if (!file) return
    const src = state.files[sourceId]
    const re = new RegExp(`(?<!\\[\\[)\\b(${file.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b(?!\\]\\])`, 'i')
    vault.patch(sourceId, { doc: src.doc.replace(re, '[[$1]]') })
  }

  const openHit = (fileId: string, hit: Hit) => {
    vault.open(fileId)
    const f = state.files[fileId]
    if (hit.where === 'doc') {
      if (f?.layout === 'canvas') vault.patch(fileId, { layout: 'both' })
      setScrollTo({ fileId, line: hit.line, n: Date.now() })
    } else if (hit.diagramId) {
      if (f?.layout === 'doc') vault.patch(fileId, { layout: 'both' })
      setActiveDiagram((s) => ({ ...s, [fileId]: hit.diagramId! }))
    }
  }

  const showTag = (t: string) => {
    setSide('search')
    setLeftOpen(true)
    setQuery('#' + t)
  }

  const commands: Command[] = [
    { id: 'new', name: 'Create new note', hotkey: 'Ctrl N', run: newNote },
    { id: 'switch', name: 'Open quick switcher', hotkey: 'Ctrl O', run: () => setTimeout(() => setPalette('files')) },
    { id: 'graph', name: 'Open graph view', hotkey: 'Ctrl G', run: openGraph },
    { id: 'toggle', name: 'Toggle reading / editing view', hotkey: 'Ctrl E', run: () => setMode(mode === 'edit' ? 'read' : 'edit') },
    { id: 'l-doc', name: 'Layout: Document', hotkey: 'Ctrl 1', run: () => file && vault.patch(file.id, { layout: 'doc' }) },
    { id: 'l-both', name: 'Layout: Document + Canvas', hotkey: 'Ctrl 2', run: () => file && vault.patch(file.id, { layout: 'both' }) },
    { id: 'l-canvas', name: 'Layout: Canvas', hotkey: 'Ctrl 3', run: () => file && vault.patch(file.id, { layout: 'canvas' }) },
    { id: 'erd', name: 'New note with ERD diagram', run: () => newDiagramNote('erd') },
    { id: 'flow', name: 'New note with flowchart', run: () => newDiagramNote('flowchart') },
    { id: 'seq', name: 'New note with sequence diagram', run: () => newDiagramNote('sequence') },
    { id: 'cloud', name: 'New note with cloud architecture diagram', run: () => newDiagramNote('cloud') },
    { id: 'mindmap', name: 'New note with mind map', run: () => newDiagramNote('mindmap') },
    { id: 'search', name: 'Search in all notes', hotkey: 'Ctrl Shift F', run: () => (setSide('search'), setLeftOpen(true)) },
    { id: 'left', name: 'Toggle left sidebar', run: () => setLeftOpen((o) => !o) },
    { id: 'right', name: 'Toggle right sidebar', run: () => setRightOpen((o) => !o) },
    { id: 'theme', name: 'Toggle light / dark theme', run: () => vault.setTheme(state.theme === 'dark' ? 'light' : 'dark') },
    { id: 'import', name: 'Import files (.md, .eraser, Mermaid .mmd, backup .json)', run: () => importRef.current?.click() },
    { id: 'export', name: 'Export vault backup (.json)', run: exportVault },
    { id: 'close', name: 'Close current tab', hotkey: 'Ctrl W', run: () => state.activeTab && vault.closeTab(state.activeTab) },
    { id: 'reset', name: 'Reset vault to sample notes', run: () => confirm('Delete every note and restore the samples?') && vault.reset() },
  ]

  // Keep handlers fresh without re-binding the listener each render.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    const k = e.key.toLowerCase()
    const run = (id: string) => {
      e.preventDefault()
      commands.find((c) => c.id === id)?.run()
    }
    if (k === 'p') {
      e.preventDefault()
      setPalette('commands')
    } else if (k === 'o') {
      e.preventDefault()
      setPalette('files')
    } else if (k === 'n') run('new')
    else if (k === 'e') run('toggle')
    else if (k === 'g') run('graph')
    else if (k === 'w') run('close')
    else if (k === '1') run('l-doc')
    else if (k === '2') run('l-both')
    else if (k === '3') run('l-canvas')
    else if (k === 'f' && e.shiftKey) run('search')
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const onGraphOpen = useCallback((id: string | null, title: string) => openTitle(id, title), [openTitle])

  return (
    <div className="app">
      <div className="titlebar">
        <button className="icon-btn" title="Toggle left sidebar" onClick={() => setLeftOpen((o) => !o)}>
          <PanelLeft size={16} />
        </button>
        <div className="tabs">
          {state.openTabs.map((id) => {
            const f = state.files[id]
            const label = id === GRAPH_TAB ? 'Graph view' : f?.title
            if (!label) return null
            return (
              <div
                key={id}
                className={'tab' + (id === state.activeTab ? ' active' : '')}
                onClick={() => vault.open(id)}
                onMouseDown={(e) => e.button === 1 && (e.preventDefault(), vault.closeTab(id))}
              >
                {id === GRAPH_TAB && <Network size={13} />}
                <span>{label}</span>
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    vault.closeTab(id)
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
          <button className="icon-btn tab-new" title="New note" onClick={newNote}>
            +
          </button>
        </div>
        <button className="icon-btn" title="Toggle right sidebar" onClick={() => setRightOpen((o) => !o)}>
          <PanelRight size={16} />
        </button>
      </div>

      <div className="main">
        <nav className="ribbon">
          {(
            [
              ['files', Files, 'Files'],
              ['search', Search, 'Search'],
              ['tags', Hash, 'Tags'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              className={'icon-btn' + (leftOpen && side === v ? ' on' : '')}
              data-tip={label}
              aria-label={label}
              onClick={() => {
                if (leftOpen && side === v) setLeftOpen(false)
                else {
                  setSide(v)
                  setLeftOpen(true)
                }
              }}
            >
              <Icon size={18} />
            </button>
          ))}
          <div className="ribbon-sep" />
          <button className="icon-btn" data-tip="Graph view (Ctrl+G)" aria-label="Graph view (Ctrl+G)" onClick={openGraph}>
            <Network size={18} />
          </button>
          <button className="icon-btn" data-tip="Command palette (Ctrl+P)" aria-label="Command palette (Ctrl+P)" onClick={() => setPalette('commands')}>
            <CommandIcon size={18} />
          </button>
          <button className="icon-btn" data-tip="New note (Ctrl+N)" aria-label="New note (Ctrl+N)" onClick={newNote}>
            <FilePlus size={18} />
          </button>
          <div className="spacer" />
          <button className="icon-btn" data-tip="Import .md / .eraser / .mmd / backup" aria-label="Import .md / .eraser / .mmd / backup" onClick={() => importRef.current?.click()}>
            <Upload size={18} />
          </button>
          <button className="icon-btn" data-tip="Export vault backup" aria-label="Export vault backup" onClick={exportVault}>
            <Download size={18} />
          </button>
          <button className="icon-btn" data-tip="Toggle theme" aria-label="Toggle theme" onClick={() => vault.setTheme(state.theme === 'dark' ? 'light' : 'dark')}>
            {state.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-btn" data-tip="Reset to sample vault" aria-label="Reset to sample vault" onClick={() => confirm('Delete every note and restore the samples?') && vault.reset()}>
            <RotateCcw size={18} />
          </button>
          <input ref={importRef} type="file" multiple accept=".md,.markdown,.txt,.eraser,.mmd,.mermaid,.json" hidden onChange={(e) => (onImport(e.target.files), (e.target.value = ''))} />
        </nav>

        {leftMounted && (
          <aside className={'sidebar' + (leftOpen ? '' : ' closing')} inert={!leftOpen}>
            <Sidebar vault={vault} view={side} query={query} setQuery={setQuery} onOpenHit={openHit} />
          </aside>
        )}

        <section className="workspace">
          {state.activeTab === GRAPH_TAB ? (
            <GraphView files={state.files} activeId={null} onOpen={onGraphOpen} />
          ) : file ? (
            <FileView
              key={file.id}
              file={file}
              vault={vault}
              mode={mode}
              setMode={setMode}
              allTitles={titles}
              activeDiagram={activeDiagram[file.id] ?? ''}
              setActiveDiagram={(id) => setActiveDiagram((s) => ({ ...s, [file.id]: id }))}
              onOpenLink={(t, nt) => openTitle(null, t, nt)}
              onTag={showTag}
              scrollToLine={scrollTo?.fileId === file.id ? scrollTo : undefined}
            />
          ) : (
            <div className="empty-state">
              <h2>No file is open</h2>
              <button className="link" onClick={newNote}>
                Create new note (Ctrl+N)
              </button>
              <button className="link" onClick={() => setPalette('files')}>
                Go to file (Ctrl+O)
              </button>
              <button className="link" onClick={openGraph}>
                Open graph view (Ctrl+G)
              </button>
            </div>
          )}
        </section>

        {rightOpen && state.activeTab !== GRAPH_TAB && (
          <aside className="right">
            <RightPanel
              file={file}
              files={state.files}
              onOpen={onGraphOpen}
              onHeading={(line) => file && setScrollTo({ fileId: file.id, line, n: Date.now() })}
              onLinkMention={linkMention}
              onTag={showTag}
            />
          </aside>
        )}
      </div>

      <Tooltip />
      <footer className="statusbar">
        <SaveIndicator status={vault.status} onRetry={vault.retrySync} onExport={exportVault} onToken={vault.setToken} />
        <Presence vault={vault} />
        {file ? (
          <>
            <span>{backlinks(state.files, file).length} backlinks</span>
            <span>{extractLinks(file.doc).length} links</span>
            <span>{file.diagrams.length} diagrams</span>
            <span>{wordCount(file.doc)} words</span>
            <span>{file.doc.length} characters</span>
            <span className="muted">{mode === 'edit' ? 'Editing' : 'Reading'}</span>
          </>
        ) : (
          <span>{Object.keys(state.files).length} notes</span>
        )}
      </footer>

      {missing && (
        <div className="merge-notice" role="status">
          <button className="icon-btn tiny close" aria-label="Dismiss" onClick={() => setMissing(false)}>
            <X size={13} />
          </button>
          <p>This link points to a note that is not in this vault. It may have been deleted, or it lives on another server.</p>
        </div>
      )}
      {vault.notice && <MergeNoticeCard notice={vault.notice} onOpen={(id) => vault.open(id)} onClose={vault.dismissNotice} />}

      {palette && (
        <CommandPalette
          mode={palette}
          commands={commands}
          files={Object.values(state.files)}
          onOpenFile={(id, nt) => vault.open(id, nt)}
          onCreate={(t) => openTitle(null, t)}
          onClose={() => setPalette(null)}
        />
      )}
    </div>
  )
}
