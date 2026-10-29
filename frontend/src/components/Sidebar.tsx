import { useMemo, useState, type DragEvent } from 'react'
import { ChevronDown, FilePlus, FileText, Folder, FolderPlus, Hash, Pin, Search, ChevronsDownUp, LayoutPanelLeft } from 'lucide-react'
import type { VaultFile } from '../types'
import type { Vault } from '../store'
import { extractTags } from '../lib/links'
import { parseQuery, search, type Hit } from '../lib/search'
import { TYPE_ICON } from './CanvasPanel'

export type SideView = 'files' | 'search' | 'tags'

interface Props {
  vault: Vault
  view: SideView
  query: string
  setQuery: (q: string) => void
  onOpenHit: (fileId: string, hit: Hit) => void
}

interface Tree {
  name: string
  path: string
  folders: Tree[]
  files: VaultFile[]
}

function buildTree(folders: string[], files: VaultFile[]): Tree {
  const root: Tree = { name: '', path: '', folders: [], files: [] }
  const get = (path: string): Tree => {
    if (!path) return root
    const parts = path.split('/')
    let node = root
    parts.forEach((p, i) => {
      const sub = parts.slice(0, i + 1).join('/')
      let next = node.folders.find((f) => f.path === sub)
      if (!next) {
        next = { name: p, path: sub, folders: [], files: [] }
        node.folders.push(next)
      }
      node = next
    })
    return node
  }
  folders.forEach(get)
  files.forEach((f) => get(f.folder).files.push(f))
  const sort = (t: Tree) => {
    t.folders.sort((a, b) => a.name.localeCompare(b.name))
    t.files.sort((a, b) => a.title.localeCompare(b.title))
    t.folders.forEach(sort)
  }
  sort(root)
  return root
}

export function Sidebar({ vault, view, query, setQuery, onOpenHit }: Props) {
  const { state } = vault
  const files = Object.values(state.files)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [selFolder, setSelFolder] = useState('')
  const tree = useMemo(() => buildTree(state.folders, files), [state.folders, files])
  const activeId = state.activeTab

  const toggle = (p: string) =>
    setCollapsed((s) => {
      const n = new Set(s)
      if (n.has(p)) n.delete(p)
      else n.add(p)
      return n
    })

  const newFolder = () => {
    const name = prompt('Folder name', 'New folder')?.trim()
    if (name) vault.addFolder(selFolder ? `${selFolder}/${name}` : name)
  }

  const onDrop = (e: DragEvent, folder: string) => {
    e.preventDefault()
    setDropTarget(null)
    const id = e.dataTransfer.getData('text/mindloom-file')
    if (id) vault.patch(id, { folder })
  }
  const dropProps = (path: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setDropTarget(path)
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (e: DragEvent) => onDrop(e, path),
  })

  const renderFile = (f: VaultFile, depth: number) => (
    <div
      key={f.id}
      className={'tree-item file' + (f.id === activeId ? ' active' : '')}
      style={{ paddingLeft: 12 + depth * 14 }}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/mindloom-file', f.id)}
      onClick={(e) => vault.open(f.id, e.metaKey || e.ctrlKey)}
      onDoubleClick={() => setRenaming(f.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        if (confirm(`Delete "${f.title}"?`)) vault.remove(f.id)
      }}
    >
      {f.diagrams.length ? <LayoutPanelLeft size={14} className="muted" /> : <FileText size={14} className="muted" />}
      {renaming === f.id ? (
        <input
          autoFocus
          defaultValue={f.title}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const t = e.target.value.trim()
            if (t && t !== f.title) vault.rename(f.id, t)
            setRenaming(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <span className="name">{f.title}</span>
      )}
      {f.pinned && <Pin size={11} className="muted" />}
    </div>
  )

  const renderTree = (t: Tree, depth: number): React.ReactNode => (
    <>
      {t.folders.map((sub) => {
        const open = !collapsed.has(sub.path)
        return (
          <div key={sub.path} {...dropProps(sub.path)} className={dropTarget === sub.path ? 'drop' : ''}>
            <div
              className={'tree-item folder' + (selFolder === sub.path ? ' selected' : '')}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => {
                toggle(sub.path)
                setSelFolder(sub.path)
              }}
              onDoubleClick={() => {
                const name = prompt('Rename folder', sub.name)?.trim()
                if (name && name !== sub.name) vault.renameFolder(sub.path, sub.path.replace(/[^/]+$/, name))
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (confirm(`Delete folder "${sub.path}" and every note in it?`)) vault.deleteFolder(sub.path)
              }}
            >
              <ChevronDown size={14} className={'chev' + (open ? '' : ' closed')} />
              <span className="name">{sub.name}</span>
            </div>
            {open && <div className="tree-children">{renderTree(sub, depth + 1)}</div>}
          </div>
        )
      })}
      {t.files.map((f) => renderFile(f, depth))}
    </>
  )

  if (view === 'search') return <SearchView vault={vault} query={query} setQuery={setQuery} onOpenHit={onOpenHit} />
  if (view === 'tags') return <TagsView vault={vault} onPick={(t) => setQuery('#' + t)} />

  return (
    <div className="sidebar-inner">
      <div className="nav-header">
        <button className="icon-btn" title="New note (Ctrl+N)" onClick={() => vault.createFile('Untitled', selFolder)}>
          <FilePlus size={16} />
        </button>
        <button className="icon-btn" title="New folder" onClick={newFolder}>
          <FolderPlus size={16} />
        </button>
        <button className="icon-btn" title="Collapse all" onClick={() => setCollapsed(new Set(state.folders))}>
          <ChevronsDownUp size={16} />
        </button>
      </div>
      <div className="vault-name" onClick={() => setSelFolder('')} {...dropProps('')}>
        <Folder size={13} /> Mindloom
      </div>
      <div className={'tree' + (dropTarget === '' ? ' drop' : '')} {...dropProps('')}>
        {renderTree(tree, 0)}
      </div>
      <div className="sidebar-hint">Double-click to rename · right-click to delete · drag to move</div>
    </div>
  )
}

function SearchView({ vault, query, setQuery, onOpenHit }: Pick<Props, 'vault' | 'query' | 'setQuery' | 'onOpenHit'>) {
  const results = useMemo(() => search(Object.values(vault.state.files), query), [query, vault.state.files])
  const terms = useMemo(() => parseQuery(query).terms, [query])
  const hitCount = results.reduce((n, r) => n + r.hits.length, 0)

  return (
    <div className="sidebar-inner">
      <div className="search-box">
        <Search size={14} />
        <input autoFocus placeholder="Search notes and diagrams…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {query.trim() ? (
        <div className="search-count muted">
          {results.length} note{results.length === 1 ? '' : 's'}
          {hitCount > 0 && `, ${hitCount} matching line${hitCount === 1 ? '' : 's'}`}
        </div>
      ) : (
        <div className="search-help muted">
          <div>
            <code>word other</code> all words, any order
          </div>
          <div>
            <code>"exact phrase"</code> phrase
          </div>
          <div>
            <code>#tag</code> <code>folder:Database</code> filter
          </div>
          <div>
            <code>in:notes</code> <code>in:diagrams</code> where to look
          </div>
        </div>
      )}
      {results.map(({ file, hits }) => (
        <div key={file.id} className="search-result">
          <div className="title" onClick={() => vault.open(file.id)}>
            {highlight(file.title, terms)}
            {file.folder && <span className="search-folder">{file.folder}</span>}
          </div>
          {hits.map((h, i) => {
            const Icon = h.where === 'diagram' ? TYPE_ICON[file.diagrams.find((d) => d.id === h.diagramId)?.type ?? 'flowchart'] : null
            return (
              <div key={i} className="snippet" onClick={() => onOpenHit(file.id, h)}>
                {Icon && (
                  <span className="snippet-source">
                    <Icon size={11} /> {h.diagramTitle}
                  </span>
                )}
                {highlight(h.text.slice(0, 160), terms)}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function highlight(text: string, terms: string[]) {
  if (!terms.length) return text
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))
}

function TagsView({ vault, onPick }: { vault: Vault; onPick: (t: string) => void }) {
  const tags = useMemo(() => {
    const m = new Map<string, number>()
    Object.values(vault.state.files).forEach((f) => extractTags(f.doc).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)))
    return [...m].sort((a, b) => b[1] - a[1])
  }, [vault.state.files])
  return (
    <div className="sidebar-inner">
      <div className="pane-title">Tags</div>
      {tags.length === 0 && <div className="empty small">No tags yet. Write #tag in a note.</div>}
      {tags.map(([t, n]) => (
        <div key={t} className="tree-item" onClick={() => onPick(t)}>
          <Hash size={13} className="muted" />
          <span className="name">{t}</span>
          <span className="count">{n}</span>
        </div>
      ))}
    </div>
  )
}
