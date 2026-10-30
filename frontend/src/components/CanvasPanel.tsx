import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Brain, Code2, GitBranch, GitCompare, PenTool, Plus, Table2, Trash2, Workflow, Cloud, X, CircleHelp, PanelLeft, PanelRight, CircleAlert, TriangleAlert, Info, ChevronDown, ChevronRight } from 'lucide-react'
import type { Diagram, DiagramType, VaultFile } from '../types'
import { canvasTab, WHITEBOARD } from '../lib/canvasTab'
import type { RemoteCaret } from '../store'
import { RemoteCarets } from './RemoteCarets'
import { useKeepSelection } from '../lib/useKeepSelection'
import { DiagramView } from '../dsl/DiagramView'
import { uid } from '../lib/links'
import { SyntaxHelp } from './SyntaxHelp'
import { InsertPanel, type InsertAsset } from './InsertPanel'
import type { Template } from '../templates'
import { highlight } from '../dsl/highlight'
import { lintDiagram, type Issue, type Severity } from '../dsl/lint'
import { DiffView } from './DiffView'

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
  mindmap: {
    label: 'Mind Map',
    code: `title Product Launch

Product Launch [icon: rocket]
  Research [icon: search]
    Interviews
    Competitors
  Build [icon: hammer]
    MVP scope
    Beta testers
  Marketing [icon: megaphone]
    Landing page
    Launch post
  Metrics [icon: chart-line]
    Sign-ups
    Retention`,
  },
}

export const TYPE_ICON: Record<DiagramType, typeof Table2> = { erd: Table2, flowchart: Workflow, sequence: GitBranch, cloud: Cloud, mindmap: Brain }

interface Props {
  file: VaultFile
  /** Whole vault, for comparing against diagrams in other notes. */
  files: Record<string, VaultFile>
  titles: string[]
  onOpenLink: (title: string, newTab: boolean) => void
  theme: 'dark' | 'light'
  onUpsert: (d: Diagram) => void
  onDiagrams: (ds: Diagram[]) => void
  onWhiteboard: (els: unknown[], files: Record<string, unknown>) => void
  active: string
  setActive: (id: string) => void
  /** Other people's carets in a diagram's code. */
  caretsIn?: (diagramId: string) => RemoteCaret[]
  /** This browser's caret in a diagram's code moved (`null`: it lost focus). */
  onCursor?: (diagramId: string, index: number | null) => void
}


export function CanvasPanel({ file, files, titles, onOpenLink, theme, onUpsert, onDiagrams, onWhiteboard, active, setActive, caretsIn, onCursor }: Props) {
  const [diffOpen, setDiffOpen] = useState(false)
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
  const tab = canvasTab(file, active)
  const diagram = file.diagrams.find((d) => d.id === tab)
  // Source line selected on the canvas or by the editor cursor.
  const [sel, setSel] = useState<number | null>(null)
  useEffect(() => {
    setSel(null)
    setDiffOpen(false)
  }, [tab])

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
          <>
            <button className={'icon-btn' + (diffOpen ? ' on' : '')} title="Compare versions" onClick={() => setDiffOpen((o) => !o)}>
              <GitCompare size={15} />
            </button>
            <button className={'icon-btn' + (showCode ? ' on' : '')} title="Toggle code editor" onClick={() => setShowCode((s) => !s)}>
              <Code2 size={15} />
            </button>
          </>
        )}
      </div>
      <div className="canvas-body">
        {diagram && diffOpen ? (
          <DiffView diagram={diagram} file={file} files={files} onUpsert={onUpsert} onClose={() => setDiffOpen(false)} />
        ) : diagram ? (
          <>
            {showCode && <CodeEditor key={diagram.id} diagram={diagram} titles={titles} side={codeSide} onFlipSide={flipCodeSide} selected={sel} onCursorLine={setSel} onChange={(code) => onUpsert({ ...diagram, code })} carets={caretsIn?.(diagram.id) ?? []} onCursor={(i) => onCursor?.(diagram.id, i)} />}
            <div className="canvas-stage">
              <DiagramView
                key={diagram.id}
                type={diagram.type}
                code={diagram.code}
                title={diagram.title}
                selectedLine={sel}
                onSelectLine={pick}
                onTitleChange={(t) => onUpsert({ ...diagram, code: setTitleLine(diagram.code, t) })}
                onOpenLink={onOpenLink}
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
const CODE_SIDE_KEY = 'mindloom:codeSide'

function readCodeSide(): CodeSide {
  try {
    return localStorage.getItem(CODE_SIDE_KEY) === 'left' ? 'left' : 'right'
  } catch {
    return 'right'
  }
}

interface EditorProps {
  diagram: Diagram
  titles: string[]
  side: CodeSide
  onFlipSide: () => void
  onChange: (code: string) => void
  selected: number | null
  onCursorLine: (line: number) => void
  carets: RemoteCaret[]
  onCursor: (index: number | null) => void
}

function CodeEditor({ diagram, titles, side, onFlipSide, onChange, selected, onCursorLine, carets, onCursor }: EditorProps) {
  const ta = useRef<HTMLTextAreaElement>(null)
  useKeepSelection(ta, diagram.code)
  const gutter = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(340)
  const [scroll, setScroll] = useState(0)
  const [help, setHelp] = useState(false)
  const count = diagram.code.split('\n').length
  const hl = useRef<HTMLPreElement>(null)
  const colored = useMemo(() => highlight(diagram.code, diagram.type), [diagram.code, diagram.type])
  const issues = useMemo(() => lintDiagram(diagram.type, diagram.code, titles), [diagram.type, diagram.code, titles])
  // Worst severity per line, for the gutter and the line tint.
  const worst = useMemo(() => {
    const m = new Map<number, Severity>()
    for (const i of issues) if (i.line && !m.has(i.line)) m.set(i.line, i.severity)
    return m
  }, [issues])
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

  const jumpTo = (line: number) => {
    const el = ta.current
    if (!el || !line) return
    const pos = diagram.code.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)
    el.focus()
    el.setSelectionRange(pos, pos)
    onCursorLine(line)
  }

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
        {[...worst].map(([line, sev]) => (
          <div key={line} className={'line-issue sev-' + sev} style={{ top: PAD + (line - 1) * lineH() - scroll, height: lineH() }} />
        ))}
        {selected != null && selected <= count && <div className="line-hl" style={{ top: PAD + (selected - 1) * lineH() - scroll, height: lineH() }} />}
        <div className="gutter" ref={gutter}>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className={i + 1 === selected ? 'on' : worst.has(i + 1) ? 'sev-' + worst.get(i + 1) : undefined}>
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
            onSelect={(e) => (cursorLine(e.currentTarget), onCursor(e.currentTarget.selectionEnd))}
            onBlur={() => onCursor(null)}
            onKeyDown={(e) => {
              if (e.key !== 'Tab') return
              e.preventDefault()
              const el = e.currentTarget
              const { selectionStart: s, selectionEnd: en, value: v } = el
              onChange(v.slice(0, s) + '  ' + v.slice(en))
              requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
            }}
          />
          <RemoteCarets target={ta} carets={carets} />
        </div>
      </div>
      <Problems issues={issues} onPick={jumpTo} />
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

const SEV_ICON: Record<Severity, typeof Info> = { error: CircleAlert, warning: TriangleAlert, info: Info }

/** Lint results under the editor; clicking one moves the cursor to its line. */
function Problems({ issues, onPick }: { issues: Issue[]; onPick: (line: number) => void }) {
  const [open, setOpen] = useState(true)
  if (!issues.length) return null
  const count = (s: Severity) => issues.filter((i) => i.severity === s).length
  return (
    <div className="problems">
      <button className="problems-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>Problems</span>
        {(['error', 'warning', 'info'] as const).map((s) => {
          const n = count(s)
          const Icon = SEV_ICON[s]
          return n ? (
            <span key={s} className={'count sev-' + s}>
              <Icon size={12} /> {n}
            </span>
          ) : null
        })}
      </button>
      {open && (
        <div className="problems-list">
          {issues.map((i, k) => {
            const Icon = SEV_ICON[i.severity]
            return (
              <button key={k} className={'problem sev-' + i.severity} onClick={() => onPick(i.line)}>
                <Icon size={13} />
                <span className="ln">{i.line ? `Ln ${i.line}` : ''}</span>
                <span>{i.message}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
