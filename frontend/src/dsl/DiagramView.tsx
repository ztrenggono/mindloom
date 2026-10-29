import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { Activity, ChevronLeft, ChevronRight, Download, Maximize, Minus, Plus, Presentation, X } from 'lucide-react'
import type { DiagramType } from '../types'
import { parseErd, parseFlow, parseMindmap, parseSequence, type ParseError } from './parse'
import type { Mark } from './diff'
import { renderErd } from './ErdRender'
import { renderFlow } from './FlowRender'
import { renderMindmap } from './MindRender'
import { renderSequence } from './SeqRender'
import { ArrowDefs, SvgIcon, textW } from './shared'

const MIN_FIT = 0.6
const ANIMATE_KEY = 'mindloom:animateLines'

function readAnimate() {
  try {
    return localStorage.getItem(ANIMATE_KEY) !== 'off'
  } catch {
    return true
  }
}
// Eraser-style frame: a title chip above a bordered box around the diagram.
const CHIP_H = 34
const CHIP_GAP = 14
const CHIP_FONT = 15
const CHIP_TEXT_X = 36

function renderRaw(type: DiagramType, code: string, selected?: number | null) {
  if (type === 'erd') {
    const d = parseErd(code)
    return { ...renderErd(d, selected), errors: d.errors as ParseError[] }
  }
  if (type === 'sequence') {
    const d = parseSequence(code)
    return { ...renderSequence(d, selected), errors: d.errors }
  }
  if (type === 'mindmap') {
    const d = parseMindmap(code)
    return { ...renderMindmap(d, selected), errors: d.errors }
  }
  const d = parseFlow(code)
  return { ...renderFlow(d, selected), errors: d.errors }
}

/** `fallbackTitle` labels the chip when the code has no `title` line. */
export function useRendered(type: DiagramType, code: string, selected?: number | null, fallbackTitle = 'Untitled') {
  return useMemo(() => {
    try {
      const r = renderRaw(type, code, selected)
      const title = r.title ?? fallbackTitle
      const chipW = textW(title, CHIP_FONT) + CHIP_TEXT_X + 16
      const width = Math.max(r.width, chipW)
      const top = CHIP_H + CHIP_GAP
      return {
        width,
        height: r.height + top,
        title,
        chipW,
        errors: r.errors,
        body: (
          <>
            <g className="d-chip">
              <rect x={0.75} y={0.75} width={chipW} height={CHIP_H} rx={7} fill="var(--d-node)" stroke="var(--d-chip-border)" strokeWidth={1.5} />
              <SvgIcon name="spline" x={13} y={CHIP_H / 2 - 8} size={16} color="var(--d-text)" />
              <text x={CHIP_TEXT_X} y={CHIP_H / 2 + 5.5} className="d-title">
                {title}
              </text>
            </g>
            <rect x={0.5} y={top} width={width} height={r.height} rx={8} fill="none" stroke="var(--d-border)" strokeWidth={1} />
            <g transform={`translate(0,${top})`}>{r.body}</g>
          </>
        ),
      }
    } catch (e) {
      return { width: 300, height: 60, title: fallbackTitle, chipW: 0, body: null, errors: [{ line: 0, message: String(e) }] }
    }
  }, [type, code, selected, fallbackTitle])
}

interface Props {
  type: DiagramType
  code: string
  title?: string
  /** Embedded diagrams in reading mode scale to fit and do not pan. */
  embedded?: boolean
  /** 1-based source line to highlight on the canvas. */
  selectedLine?: number | null
  /** Called with the source line of a clicked element, or null for empty canvas. */
  onSelectLine?: (line: number | null) => void
  /** Makes the diagram's `title` editable in place by clicking it. */
  onTitleChange?: (title: string) => void
  /** Opens the note a node links to with `link: Title`. */
  onOpenLink?: (title: string, newTab: boolean) => void
  /** Diff highlights by source line. */
  marks?: Record<number, Mark>
  /** Hides the export buttons, for side-by-side views. */
  compact?: boolean
}

const MARK_CLASSES = ['d-diff-added', 'd-diff-removed', 'd-diff-changed']

export function DiagramView({ type, code, title, embedded: embeddedProp, selectedLine, onSelectLine, onTitleChange, onOpenLink, marks, compact }: Props) {
  // Presenting takes over the screen, so an embedded diagram behaves like a full canvas meanwhile.
  const [present, setPresent] = useState(false)
  const [step, setStep] = useState(0)
  const [stepLines, setStepLines] = useState<number[]>([])
  const embedded = embeddedProp && !present
  const root = useRef<HTMLDivElement>(null)
  const r = useRendered(type, code, present ? null : selectedLine, title)
  // While the title is being edited the canvas is frozen, so the input stays on the chip.
  const [editingTitle, setEditingTitle] = useState(false)
  const editingRef = useRef(false)
  editingRef.current = editingTitle
  // Moving dashes along connections ("marching ants"); a per-browser preference.
  const [animate, setAnimate] = useState(readAnimate)
  const toggleAnimate = () =>
    setAnimate((a) => {
      try {
        localStorage.setItem(ANIMATE_KEY, a ? 'off' : 'on')
      } catch {
        /* preference only */
      }
      return !a
    })
  const wrap = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  // Once the user pans or zooms, stop auto-fitting on resize.
  const touched = useRef(false)

  const fit = () => {
    const el = wrap.current
    if (!el || !r.width) return
    // Never shrink below a readable size; a big diagram in a narrow pane is panned instead.
    const k = Math.max(MIN_FIT, Math.min(1.4, (el.clientWidth - 40) / r.width, (el.clientHeight - 40) / r.height))
    setView({ k, x: Math.max(20, (el.clientWidth - r.width * k) / 2), y: Math.max(20, (el.clientHeight - r.height * k) / 2) })
  }
  // Refit when the diagram's size changes, not on every keystroke.
  useEffect(() => {
    if (!embedded) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(r.width / 40), Math.round(r.height / 40), embedded])

  const fitRef = useRef(fit)
  fitRef.current = fit
  useEffect(() => {
    const el = wrap.current
    if (!el || embedded) return
    const ro = new ResizeObserver(() => !touched.current && fitRef.current())
    ro.observe(el)
    return () => ro.disconnect()
  }, [embedded])

  useEffect(() => {
    const el = wrap.current
    if (!el || embedded) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (editingRef.current) return
      touched.current = true
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const k = Math.min(4, Math.max(0.15, v.k * Math.exp(-e.deltaY * 0.01)))
          return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
        })
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [embedded])

  const zoom = (f: number) => {
    touched.current = true
    const el = wrap.current!
    const mx = el.clientWidth / 2
    const my = el.clientHeight / 2
    setView((v) => {
      const k = Math.min(4, Math.max(0.15, v.k * f))
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
    })
  }

  const onDown = (e: RPointerEvent) => {
    if (embedded || editingRef.current) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    touched.current = true
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
  /** The note a click should open: the link badge, or any linked shape with Ctrl/Cmd held. */
  const linkUnder = (under: Element | null, mod: boolean) => {
    const badge = under?.closest('[data-link]')
    if (badge) return badge.getAttribute('data-link')
    if (!mod) return null
    return under?.closest('[data-line]')?.querySelector('[data-link]')?.getAttribute('data-link') ?? null
  }

  // A press that barely moved is a click: select what is under it.
  const onUp = (e: RPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return
    const under = document.elementFromPoint(e.clientX, e.clientY)
    const mod = e.metaKey || e.ctrlKey
    const link = onOpenLink && linkUnder(under, mod)
    if (link) {
      if (present) exitPresent()
      onOpenLink(link, mod && !!under?.closest('[data-link]'))
      return
    }
    if (present) return go(e.shiftKey ? -1 : 1)
    if (onTitleChange && under?.closest('.d-chip')) {
      setEditingTitle(true)
      return
    }
    if (!onSelectLine) return
    const hit = under?.closest('[data-line]')
    onSelectLine(hit ? Number(hit.getAttribute('data-line')) : null)
  }
  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }))
  }
  // Embedded diagrams do not pan, so their links open on a plain click.
  const onEmbeddedClick = (e: RMouseEvent) => {
    if (!embedded || !onOpenLink) return
    const link = linkUnder(e.target as Element, e.metaKey || e.ctrlKey)
    if (link) onOpenLink(link, false)
  }

  /* ------------------------------ Diff marks and presentation ------------------------------ */

  // Top-level elements with a source line are the units that marks and steps apply to.
  const units = () => [...(svg.current?.querySelectorAll<SVGElement>('[data-line]') ?? [])].filter((el) => !el.parentElement?.closest('[data-line]'))

  useLayoutEffect(() => {
    const el = svg.current
    if (!el) return
    el.querySelectorAll('.' + MARK_CLASSES.join(',.')).forEach((n) => n.classList.remove(...MARK_CLASSES))
    if (marks) el.querySelectorAll('[data-line]').forEach((n) => {
      const m = marks[Number(n.getAttribute('data-line'))]
      if (m) n.classList.add('d-diff-' + m)
    })
    const lines = [...new Set(units().map((n) => Number(n.getAttribute('data-line'))))].sort((a, b) => a - b)
    setStepLines((prev) => (prev.join() === lines.join() ? prev : lines))
  }, [marks, r])

  useLayoutEffect(() => {
    const cur = stepLines[step]
    for (const n of units()) {
      const line = Number(n.getAttribute('data-line'))
      n.classList.toggle('d-step-hidden', present && line > cur)
      n.classList.toggle('d-step-current', present && line === cur)
    }
  })

  const go = (delta: number) => setStep((s) => Math.min(Math.max(0, s + delta), Math.max(0, stepLines.length - 1)))

  const startPresent = () => {
    setStep(0)
    setPresent(true)
    touched.current = false
    root.current?.requestFullscreen?.().catch(() => {
      /* the fixed overlay still covers the window */
    })
  }
  const exitPresent = () => {
    setPresent(false)
    touched.current = false
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
  }

  useEffect(() => {
    if (!present) return
    requestAnimationFrame(() => fitRef.current())
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) go(1)
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) go(-1)
      else if (k === 'Home') setStep(0)
      else if (k === 'End') setStep(stepLines.length - 1)
      else if (k === 'Escape') exitPresent()
      else return
      e.preventDefault()
    }
    // Leaving fullscreen with the browser's own Esc ends the presentation too.
    const onFs = () => !document.fullscreenElement && setPresent(false)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, stepLines.length])

  // Refit once the presentation changes the stage size, then again when it ends.
  useEffect(() => {
    if (!embedded) requestAnimationFrame(() => fitRef.current())
  }, [present, embedded])

  const svgEl = (
    <svg
      ref={svg}
      xmlns="http://www.w3.org/2000/svg"
      className="diagram-svg"
      width={embedded ? r.width : '100%'}
      height={embedded ? r.height : '100%'}
      viewBox={embedded ? `0 0 ${r.width} ${r.height}` : undefined}
      style={embedded ? { maxWidth: '100%', height: 'auto' } : undefined}
    >
      <ArrowDefs />
      {embedded ? r.body : <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>{r.body}</g>}
    </svg>
  )

  return (
    <div ref={root} className={'diagram' + (embedded ? ' embedded' : '') + (present ? ' presenting' : '')}>
      <div
        ref={wrap}
        className={'diagram-stage' + (onTitleChange && !present ? ' title-editable' : '') + (editingTitle ? ' editing-title' : '') + (animate && !embedded ? ' flow-lines' : '')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onClick={onEmbeddedClick}
      >
        {svgEl}
        {editingTitle && (
          // Placed in canvas coordinates, so it sits exactly on the chip at any zoom.
          <input
            className="title-edit"
            autoFocus
            defaultValue={r.title}
            style={{
              left: view.x,
              top: view.y,
              width: Math.max(r.chipW + 80, 260) * view.k,
              height: CHIP_H * view.k + 1.5,
              fontSize: CHIP_FONT * view.k,
              paddingLeft: CHIP_TEXT_X * view.k - 1.5,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim()
              if (v && v !== r.title) onTitleChange?.(v)
              setEditingTitle(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                e.currentTarget.value = r.title
                e.currentTarget.blur()
              }
            }}
          />
        )}
      </div>
      {present ? (
        <div className="present-bar" onPointerDown={(e) => e.stopPropagation()}>
          <button title="Previous (←)" onClick={() => go(-1)} disabled={step === 0}>
            <ChevronLeft size={16} />
          </button>
          <span>
            {Math.min(step + 1, stepLines.length)} / {stepLines.length}
          </span>
          <button title="Next (→ or Space)" onClick={() => go(1)} disabled={step >= stepLines.length - 1}>
            <ChevronRight size={16} />
          </button>
          <button title="Exit presentation (Esc)" onClick={exitPresent}>
            <X size={16} />
          </button>
        </div>
      ) : null}
      {!present && r.errors.length > 0 && (
        <div className="diagram-errors">
          {r.errors.slice(0, 3).map((e, i) => (
            <div key={i}>
              {e.line ? `Line ${e.line}: ` : ''}
              {e.message}
            </div>
          ))}
        </div>
      )}
      <div className="diagram-tools" hidden={present}>
        {!embedded && (
          <>
            <button title="Zoom out" onClick={() => zoom(1 / 1.2)}>
              <Minus size={14} />
            </button>
            <span className="zoom-label">{Math.round(view.k * 100)}%</span>
            <button title="Zoom in" onClick={() => zoom(1.2)}>
              <Plus size={14} />
            </button>
            <button title="Fit to screen" onClick={() => ((touched.current = false), fit())}>
              <Maximize size={14} />
            </button>
            <button title={animate ? 'Stop line animation' : 'Animate lines'} className={animate ? 'on' : ''} onClick={toggleAnimate}>
              <Activity size={14} />
            </button>
          </>
        )}
        <button title="Present step by step" onClick={startPresent}>
          <Presentation size={14} />
        </button>
        {!compact && (
          <>
            <button title="Export SVG" onClick={() => exportSvg(svg.current, r, title ?? 'diagram', 'svg')}>
              <Download size={14} />
              <span>SVG</span>
            </button>
            <button title="Export PNG" onClick={() => exportSvg(svg.current, r, title ?? 'diagram', 'png')}>
              <Download size={14} />
              <span>PNG</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Serialises the diagram at 1:1 with the current theme's colours inlined. */
function exportSvg(el: SVGSVGElement | null, r: { width: number; height: number }, name: string, fmt: 'svg' | 'png') {
  if (!el) return
  const clone = el.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(r.width))
  clone.setAttribute('height', String(r.height))
  clone.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`)
  clone.removeAttribute('style')
  const g = clone.querySelector(':scope > g')
  if (g && g.getAttribute('transform')) g.removeAttribute('transform')
  const cs = getComputedStyle(document.documentElement)
  const vars = ['--d-bg', '--d-node', '--d-border', '--d-edge', '--d-text', '--d-muted', '--d-accent', '--bg-primary', '--text-normal', '--text-muted']
  const css =
    `:root{${vars.map((v) => `${v}:${cs.getPropertyValue(v)}`).join(';')}}` +
    [...document.styleSheets]
      .flatMap((s) => {
        try {
          return [...s.cssRules].map((rule) => rule.cssText).filter((t) => /\.d-|diagram-svg/.test(t))
        } catch {
          return []
        }
      })
      .join('\n')
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = css
  clone.insertBefore(style, clone.firstChild)
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', '100%')
  bg.setAttribute('height', '100%')
  bg.setAttribute('fill', cs.getPropertyValue('--d-bg'))
  clone.insertBefore(bg, style.nextSibling)
  const text = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([text], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  if (fmt === 'svg') return download(url, name + '.svg')
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = r.width * 2
    c.height = r.height * 2
    const ctx = c.getContext('2d')!
    ctx.scale(2, 2)
    ctx.drawImage(img, 0, 0)
    c.toBlob((b) => b && download(URL.createObjectURL(b), name + '.png'))
    URL.revokeObjectURL(url)
  }
  img.src = url
}

export function download(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
