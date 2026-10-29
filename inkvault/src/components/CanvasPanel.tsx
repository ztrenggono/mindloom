import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Code2, GitBranch, PenTool, Plus, Table2, Trash2, Workflow, Cloud, X, CircleHelp, PanelLeft, PanelRight } from 'lucide-react'
import type { Diagram, DiagramType, VaultFile } from '../types'
import { DiagramView } from '../dsl/DiagramView'
import { uid } from '../lib/links'
import { SyntaxHelp } from './SyntaxHelp'
import { InsertPanel, type InsertAsset } from './InsertPanel'
import type { Template } from '../templates'
import { highlight } from '../dsl/highlight'

const Whiteboard = lazy(() => import('./Whiteboard'))

export const TEMPLATES: Record<DiagramType, { label: string; code: string }> = {
  erd: {
    label: 'Entity Relationship',
    code: `users [icon: user, color: blue] {
  id int pk
  name varchar
  team_id int fk
}

teams [icon: users, color: green] {
  id int pk
  name varchar
}

users.team_id > teams.id`,
  },
  flowchart: {
    label: 'Flowchart',
    code: `direction right

Start [shape: oval, icon: play, color: green]
Decide [shape: diamond, icon: help-circle]
Do the thing [icon: zap]
End [shape: oval, icon: check, color: blue]

Start > Decide
Decide > Do the thing: yes
Decide > End: no
Do the thing > End`,
  },
  sequence: {
    label: 'Sequence',
    code: `autoNumber on

Browser [icon: monitor, color: gray]
API [icon: server, color: blue]
DB [icon: database, color: green]

Browser > API: GET /items
activate API
API > DB: SELECT *
DB --> API: rows
API --> Browser: 200 OK
deactivate API`,
  },
  cloud: {
    label: 'Cloud Architecture',
    code: `direction right

Users [icon: users]

VPC [icon: cloud, color: orange] {
  Load Balancer [icon: shuffle]
  App [color: blue] {
    Web Server [icon: server]
    Worker [icon: cpu]
  }
  Database [shape: cylinder, icon: database, color: green]
  Cache [icon: zap, color: red]
}

Users > Load Balancer > Web Server
Web Server > Database
Web Server > Cache
Worker > Database`,
  },
}

export const TYPE_ICON: Record<DiagramType, typeof Table2> = { erd: Table2, flowchart: Workflow, sequence: GitBranch, cloud: Cloud }

interface Props {
  file: VaultFile
  theme: 'dark' | 'light'
  onUpsert: (d: Diagram) => void
  onDiagrams: (ds: Diagram[]) => void
  onWhiteboard: (els: unknown[], files: Record<string, unknown>) => void
  active: string
  setActive: (id: string) => void
}

export const WHITEBOARD = '__whiteboard__'

export function CanvasPanel({ file, theme, onUpsert, onDiagrams, onWhiteboard, active, setActive }: Props) {
  // Fixed position so the panel escapes the tab bar's overflow clipping
  const [menu, setMenu] = useState<{ top: number; left: number; right: number } | null>(null)
  // An icon or image waiting for the whiteboard to mount and take it.
  const [pendingAsset, setPendingAsset] = useState<InsertAsset | null>(null)
  const [showCode, setShowCode] = useState(file.layout === 'canvas')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [codeSide, setCodeSide] = useState<CodeSide>(readCodeSide)
  const flipCodeSide = () =>
    setCodeSide((s) => {
      const next = s === 'left' ? 'right' : 'left'
      try {
        localStorage.setItem(CODE_SIDE_KEY, next)
      } catch {
        /* preference only */
      }
      return next
    })
  const current = file.diagrams.find((d) => d.id === active)
  const tab = current ? current.id : active === WHITEBOARD || !file.diagrams.length ? WHITEBOARD : file.diagrams[0].id
  const diagram = file.diagrams.find((d) => d.id === tab)
  // Source line selected on the canvas or by the editor cursor.
  const [sel, setSel] = useState<number | null>(null)
  useEffect(() => setSel(null), [tab])

  const pick = (line: number | null) => {
    setSel(line)
    if (line) setShowCode(true)
  }

  const add = (type: DiagramType, title: string = TEMPLATES[type].label, code: string = TEMPLATES[type].code) => {
    const d: Diagram = { id: uid(), type, title, code }
    onUpsert(d)
    setActive(d.id)
    setMenu(null)
  }
  const addTemplate = (t: Template) => add(t.type, t.title, t.code)
  const addAsset = (a: InsertAsset) => {
    setPendingAsset(a)
    setActive(WHITEBOARD)
    setMenu(null)
  }

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setMenu((m) => (m ? null : { top: r.bottom + 4, left: r.left, right: r.right }))
  }


  return (
    <div className="canvas-panel">
      <div className="canvas-tabs">
        {/* Whiteboard stays first; new diagrams line up to its right. */}
        <div className={'canvas-tab' + (tab === WHITEBOARD ? ' active' : '')} onClick={() => setActive(WHITEBOARD)}>
          <PenTool size={13} />
          <span>Whiteboard</span>
        </div>
        {file.diagrams.map((d) => {
          const Icon = TYPE_ICON[d.type]
          return (
            <div
              key={d.id}
              className={'canvas-tab' + (tab === d.id ? ' active' : '')}
              title="Double-click to rename"
              onClick={() => setActive(d.id)}
              onDoubleClick={() => setRenaming(d.id)}
            >
              <Icon size={13} />
              {renaming === d.id ? (
                <input
                  autoFocus
                  defaultValue={d.title}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    const title = e.target.value.trim()
                    if (title && title !== d.title) onUpsert({ ...d, title })
                    setRenaming(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') {
                      e.currentTarget.value = d.title
                      e.currentTarget.blur()
                    }
                  }}
                />
              ) : (
                <span>{d.title}</span>
              )}
              <button
                className="icon-btn tiny"
                title="Delete diagram"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Delete diagram "${d.title}"?`)) onDiagrams(file.diagrams.filter((x) => x.id !== d.id))
                }}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
        <div className="add-wrap">
          <button className="icon-btn" title="Insert diagram, template, icon or image" onMouseDown={(e) => menu && e.stopPropagation()} onClick={toggleMenu}>
            <Plus size={15} />
          </button>
          {menu && <InsertPanel anchor={menu} onClose={() => setMenu(null)} onBlank={(t) => add(t)} onTemplate={addTemplate} onAsset={addAsset} />}
        </div>
        <div className="spacer" />
        {diagram && (
          <button className={'icon-btn' + (showCode ? ' on' : '')} title="Toggle code editor" onClick={() => setShowCode((s) => !s)}>
            <Code2 size={15} />
          </button>
        )}
      </div>
      <div className="canvas-body">
        {diagram ? (
          <>
            {showCode && <CodeEditor key={diagram.id} diagram={diagram} side={codeSide} onFlipSide={flipCodeSide} selected={sel} onCursorLine={setSel} onChange={(code) => onUpsert({ ...diagram, code })} />}
            <div className="canvas-stage">
              <DiagramView
                key={diagram.id}
                type={diagram.type}
                code={diagram.code}
                title={diagram.title}
                selectedLine={sel}
                onSelectLine={pick}
                onTitleChange={(t) => onUpsert({ ...diagram, code: setTitleLine(diagram.code, t) })}
              />
            </div>
          </>
        ) : (
          <Suspense fallback={<div className="empty">Loading whiteboard…</div>}>
            <Whiteboard
              key={file.id}
              elements={file.whiteboard}
              files={file.whiteboardFiles}
              theme={theme}
              onChange={onWhiteboard}
              insert={pendingAsset}
              onInserted={() => setPendingAsset(null)}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}

/** Rewrites the diagram's `title` line, keeping its indentation. */
function setTitleLine(code: string, title: string) {
  if (/^\s*title\s+/im.test(code)) return code.replace(/^(\s*)title\s+.*$/im, (_, indent: string) => `${indent}title ${title}`)
  return `title ${title}\n\n${code}`
}

type CodeSide = 'left' | 'right'
const CODE_SIDE_KEY = 'inkvault:codeSide'

function readCodeSide(): CodeSide {
  try {
    return localStorage.getItem(CODE_SIDE_KEY) === 'left' ? 'left' : 'right'
  } catch {
    return 'right'
  }
}

interface EditorProps {
  diagram: Diagram
  side: CodeSide
  onFlipSide: () => void
  onChange: (code: string) => void
  selected: number | null
  onCursorLine: (line: number) => void
}

function CodeEditor({ diagram, side, onFlipSide, onChange, selected, onCursorLine }: EditorProps) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(340)
  const [scroll, setScroll] = useState(0)
  const [help, setHelp] = useState(false)
  const count = diagram.code.split('\n').length
  const hl = useRef<HTMLPreElement>(null)
  const colored = useMemo(() => highlight(diagram.code, diagram.type), [diagram.code, diagram.type])
  const lineH = () => (ta.current ? parseFloat(getComputedStyle(ta.current).lineHeight) : 20)
  const PAD = 10

  useEffect(() => {
    const el = ta.current
    const sync = () => {
      if (gutter.current) gutter.current.scrollTop = el!.scrollTop
      if (hl.current) {
        hl.current.scrollTop = el!.scrollTop
        hl.current.scrollLeft = el!.scrollLeft
      }
      setScroll(el!.scrollTop)
    }
    el?.addEventListener('scroll', sync)
    return () => el?.removeEventListener('scroll', sync)
  }, [])

  // Bring a line picked on the canvas into view.
  useEffect(() => {
    const el = ta.current
    if (!el || !selected) return
    const top = PAD + (selected - 1) * lineH()
    if (top < el.scrollTop || top + lineH() > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 3)
  }, [selected])

  const cursorLine = (el: HTMLTextAreaElement) => onCursorLine(el.value.slice(0, el.selectionStart).split('\n').length)

  const startResize = (e: React.PointerEvent) => {
    const x0 = e.clientX
    const w0 = width
    // On the right side the handle is on the left edge, so dragging left widens the editor.
    const dir = side === 'left' ? 1 : -1
    const move = (ev: PointerEvent) => setWidth(Math.min(700, Math.max(220, w0 + dir * (ev.clientX - x0))))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className={'code-pane' + (side === 'right' ? ' right' : '')} style={{ width }}>
      <div className="code-head">
        <span className="pill">{diagram.type}</span>
        <span className="muted">diagram-as-code</span>
      </div>
      <div className="code-wrap">
        {selected != null && selected <= count && <div className="line-hl" style={{ top: PAD + (selected - 1) * lineH() - scroll, height: lineH() }} />}
        <div className="gutter" ref={gutter}>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className={i + 1 === selected ? 'on' : undefined}>
              {i + 1}
            </div>
          ))}
        </div>
        <div className="code-area">
          {/* Coloured copy of the code under a transparent textarea, scrolled in step with it. */}
          <pre className="code-hl" ref={hl} aria-hidden>
            {colored}
          </pre>
          <textarea
            ref={ta}
            className="code-editor"
            spellCheck={false}
            value={diagram.code}
            onChange={(e) => onChange(e.target.value)}
            onSelect={(e) => cursorLine(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key !== 'Tab') return
              e.preventDefault()
              const el = e.currentTarget
              const { selectionStart: s, selectionEnd: en, value: v } = el
              onChange(v.slice(0, s) + '  ' + v.slice(en))
              requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
            }}
          />
        </div>
      </div>
      <div className="resize-x" onPointerDown={startResize} />
      <button className="icon-btn tiny side" title={side === 'left' ? 'Move editor to the right' : 'Move editor to the left'} onClick={onFlipSide}>
        {side === 'left' ? <PanelRight size={13} /> : <PanelLeft size={13} />}
      </button>
      <button className="icon-btn tiny help" title="Syntax help" onClick={() => setHelp(true)}>
        <CircleHelp size={13} />
      </button>
      <button className="icon-btn tiny trash" title="Clear code" onClick={() => confirm('Clear the code?') && onChange('')}>
        <Trash2 size={12} />
      </button>
      {help && <SyntaxHelp type={diagram.type} onClose={() => setHelp(false)} />}
    </div>
  )
}
