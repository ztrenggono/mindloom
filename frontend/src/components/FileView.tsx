import { useEffect, useRef, useState } from 'react'
import { BookOpen, Columns2, Download, FileText, MoreHorizontal, PanelRight, Pencil, Pin, Trash2 } from 'lucide-react'
import type { Layout, VaultFile } from '../types'
import type { Vault } from '../store'
import { NoteEditor } from './NoteEditor'
import { CanvasPanel } from './CanvasPanel'
import { download } from '../dsl/DiagramView'

interface Props {
  file: VaultFile
  vault: Vault
  mode: 'edit' | 'read'
  setMode: (m: 'edit' | 'read') => void
  allTitles: string[]
  activeDiagram: string
  setActiveDiagram: (id: string) => void
  onOpenLink: (title: string, newTab: boolean) => void
  onTag: (t: string) => void
  scrollToLine?: { line: number; n: number }
}

const LAYOUTS: { id: Layout; label: string; icon: typeof FileText }[] = [
  { id: 'doc', label: 'Document', icon: FileText },
  { id: 'both', label: 'Both', icon: Columns2 },
  { id: 'canvas', label: 'Canvas', icon: PanelRight },
]

export function FileView({ file, vault, mode, setMode, allTitles, activeDiagram, setActiveDiagram, onOpenLink, onTag, scrollToLine }: Props) {
  const [split, setSplit] = useState(0.45)
  const [menu, setMenu] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const here = vault.peers.filter((p) => p.fileId === file.id)
  const { setViewing } = vault

  // Tells others this note is open here, for the avatars in their header.
  useEffect(() => {
    setViewing(file.id)
    return () => setViewing(null)
  }, [file.id, setViewing])

  const startSplit = (e: React.PointerEvent) => {
    e.preventDefault()
    const rect = body.current!.getBoundingClientRect()
    const move = (ev: PointerEvent) => setSplit(Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const exportMd = () => {
    const fences = file.diagrams.map((d) => `\n\n## ${d.title}\n\n\`\`\`${d.type}\n${d.code}\n\`\`\`\n`).join('')
    download(URL.createObjectURL(new Blob([file.doc + fences], { type: 'text/markdown' })), file.title + '.md')
  }

  const doc = (
    <div className="pane-scroll">
      <div className="note-container">
        <input
          key={file.id + file.title}
          className="inline-title"
          defaultValue={file.title}
          onBlur={(e) => vault.rename(file.id, e.target.value.trim() || file.title)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <NoteEditor
          file={file}
          allTitles={allTitles}
          mode={mode}
          onChange={(d) => vault.patch(file.id, { doc: d })}
          onOpenLink={onOpenLink}
          onTag={onTag}
          scrollToLine={scrollToLine}
          carets={vault.caretsIn(file.id, 'doc')}
          onCursor={(i) => vault.setCursor(file.id, 'doc', i)}
        />
      </div>
    </div>
  )

  const canvas = (
    <CanvasPanel
      file={file}
      files={vault.state.files}
      titles={allTitles}
      onOpenLink={onOpenLink}
      theme={vault.state.theme}
      active={activeDiagram}
      setActive={setActiveDiagram}
      onUpsert={(d) => vault.upsertDiagram(file.id, d)}
      onDiagrams={(ds) => vault.patch(file.id, { diagrams: ds })}
      onWhiteboard={(els, files) => vault.patch(file.id, { whiteboard: els, whiteboardFiles: files })}
      caretsIn={(id) => vault.caretsIn(file.id, id)}
      onCursor={(id, i) => vault.setCursor(file.id, id, i)}
    />
  )

  return (
    <div className="file-view">
      <div className="view-header">
        <div className="breadcrumb">
          {file.folder && <span className="muted">{file.folder.split('/').join(' / ')} / </span>}
          <span>{file.title}</span>
        </div>
        <div className="segmented">
          {LAYOUTS.map((l) => (
            <button key={l.id} className={file.layout === l.id ? 'on' : ''} onClick={() => vault.patch(file.id, { layout: l.id })} title={l.label}>
              <l.icon size={14} />
              <span>{l.label}</span>
            </button>
          ))}
        </div>
        <div className="view-actions">
          {here.length > 0 && (
            <div className="peers" aria-label={`Also here: ${here.map((p) => p.name).join(', ')}`}>
              {here.slice(0, 4).map((p) => (
                <span key={p.id} className="peer" style={{ '--peer': p.color } as React.CSSProperties} data-tip={`${p.name} is here`}>
                  {p.name.slice(0, 1)}
                </span>
              ))}
              {here.length > 4 && <span className="peer" style={{ '--peer': 'var(--text-faint)' } as React.CSSProperties}>+{here.length - 4}</span>}
            </div>
          )}
          {file.layout !== 'canvas' && (
            <button className="icon-btn" title={mode === 'edit' ? 'Reading view (Ctrl+E)' : 'Edit (Ctrl+E)'} onClick={() => setMode(mode === 'edit' ? 'read' : 'edit')}>
              {mode === 'edit' ? <BookOpen size={16} /> : <Pencil size={16} />}
            </button>
          )}
          <div className="add-wrap">
            <button className="icon-btn" onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal size={16} />
            </button>
            {menu && (
              <div className="menu right" onMouseLeave={() => setMenu(false)}>
                <button className="menu-item" onClick={() => (vault.patch(file.id, { pinned: !file.pinned }), setMenu(false))}>
                  <Pin size={14} /> {file.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button className="menu-item" onClick={() => (exportMd(), setMenu(false))}>
                  <Download size={14} /> Export as Markdown
                </button>
                <button
                  className="menu-item danger"
                  onClick={() => {
                    setMenu(false)
                    if (confirm(`Delete "${file.title}"?`)) vault.remove(file.id)
                  }}
                >
                  <Trash2 size={14} /> Delete note
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="view-body" ref={body}>
        {file.layout === 'doc' && doc}
        {file.layout === 'canvas' && canvas}
        {file.layout === 'both' && (
          <>
            <div style={{ width: `${split * 100}%` }} className="split-left">
              {doc}
            </div>
            <div className="split-handle" onPointerDown={startSplit} />
            <div className="split-right">{canvas}</div>
          </>
        )}
      </div>
    </div>
  )
}
