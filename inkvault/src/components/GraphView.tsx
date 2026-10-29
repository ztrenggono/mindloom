import { useEffect, useMemo, useRef, useState } from 'react'
import type { VaultFile } from '../types'
import { extractTags, fileLinks, findByTitle } from '../lib/links'

interface Props {
  files: Record<string, VaultFile>
  activeId?: string | null
  /** When set, shows only this note and its direct neighbours (local graph). */
  focusId?: string | null
  showTags?: boolean
  onOpen: (id: string | null, title: string) => void
  compact?: boolean
}

interface N {
  id: string
  label: string
  kind: 'file' | 'ghost' | 'tag'
  fileId?: string
  x: number
  y: number
  vx: number
  vy: number
  deg: number
  fixed?: boolean
}

export function GraphView({ files, activeId, focusId, showTags: initialTags = false, onOpen, compact }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [showTags, setShowTags] = useState(initialTags)
  const [showOrphans, setShowOrphans] = useState(true)
  const [filter, setFilter] = useState('')

  // Rebuild only when the link structure changes, not on every keystroke.
  const sig = useMemo(
    () => Object.values(files).map((f) => f.id + '\u0001' + f.title + '\u0001' + fileLinks(f).join('|') + '\u0001' + extractTags(f.doc).join(',')).join('\n'),
    [files],
  )
  const positions = useRef(new Map<string, { x: number; y: number }>())

  const graph = useMemo(() => {
    const nodes = new Map<string, N>()
    const links: [string, string][] = []
    const add = (id: string, label: string, kind: N['kind'], fileId?: string) => {
      if (!nodes.has(id)) {
        const p = positions.current.get(id) ?? { x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400 }
        const n: N = { id, label, kind, fileId, x: p.x, y: p.y, vx: 0, vy: 0, deg: 0 }
        positions.current.set(id, n)
        nodes.set(id, n)
      }
      return nodes.get(id)!
    }
    for (const f of Object.values(files)) add('f:' + f.id, f.title, 'file', f.id)
    for (const f of Object.values(files)) {
      for (const l of fileLinks(f)) {
        const t = findByTitle(files, l)
        const to = t ? 'f:' + t.id : 'g:' + l.toLowerCase()
        if (!t) add(to, l, 'ghost')
        if (to !== 'f:' + f.id) links.push(['f:' + f.id, to])
      }
      if (showTags) for (const tag of extractTags(f.doc)) links.push(['f:' + f.id, add('t:' + tag, '#' + tag, 'tag').id])
    }
    for (const [a, b] of links) {
      nodes.get(a)!.deg++
      nodes.get(b)!.deg++
    }
    let keep = [...nodes.values()]
    if (focusId) {
      const c = 'f:' + focusId
      const near = new Set([c])
      links.forEach(([a, b]) => (a === c ? near.add(b) : b === c ? near.add(a) : null))
      keep = keep.filter((n) => near.has(n.id))
    }
    if (!showOrphans) keep = keep.filter((n) => n.deg > 0)
    if (filter.trim()) {
      const q = filter.toLowerCase()
      keep = keep.filter((n) => n.label.toLowerCase().includes(q))
    }
    const ids = new Set(keep.map((n) => n.id))
    return { nodes: keep, links: links.filter(([a, b]) => ids.has(a) && ids.has(b)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, focusId, showTags, showOrphans, filter])

  const view = useRef({ x: 0, y: 0, k: 1 })
  const hover = useRef<N | null>(null)

  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext('2d')!
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    let raf = 0
    let alpha = 1
    let dragging: N | null = null
    let panning: { x: number; y: number; vx: number; vy: number } | null = null
    let moved = false

    const resize = () => {
      const r = cv.parentElement!.getBoundingClientRect()
      cv.width = r.width * devicePixelRatio
      cv.height = r.height * devicePixelRatio
      cv.style.width = r.width + 'px'
      cv.style.height = r.height + 'px'
      if (!view.current.x) view.current = { x: r.width / 2, y: r.height / 2, k: compact ? 0.7 : 1 }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv.parentElement!)

    const css = getComputedStyle(document.documentElement)
    const col = (v: string) => css.getPropertyValue(v).trim()

    const tick = () => {
      if (alpha > 0.005) {
        const ns = graph.nodes
        for (let i = 0; i < ns.length; i++) {
          for (let j = i + 1; j < ns.length; j++) {
            const a = ns[i]
            const b = ns[j]
            let dx = b.x - a.x
            let dy = b.y - a.y
            let d2 = dx * dx + dy * dy
            if (d2 < 1) {
              dx = Math.random()
              dy = Math.random()
              d2 = 1
            }
            const f = (7000 / d2) * alpha
            const d = Math.sqrt(d2)
            a.vx -= (dx / d) * f
            a.vy -= (dy / d) * f
            b.vx += (dx / d) * f
            b.vy += (dy / d) * f
          }
        }
        for (const [s, t] of graph.links) {
          const a = byId.get(s)!
          const b = byId.get(t)!
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          const f = (d - 150) * 0.04 * alpha
          a.vx += (dx / d) * f
          a.vy += (dy / d) * f
          b.vx -= (dx / d) * f
          b.vy -= (dy / d) * f
        }
        for (const n of ns) {
          n.vx -= n.x * 0.006 * alpha
          n.vy -= n.y * 0.006 * alpha
          if (n === dragging) continue
          n.vx *= 0.6
          n.vy *= 0.6
          n.x += n.vx
          n.y += n.vy
        }
        alpha *= 0.985
      }
      draw()
      raf = requestAnimationFrame(tick)
    }

    const radius = (n: N) => (n.kind === 'tag' ? 3.5 : 4 + Math.sqrt(n.deg) * 2.2)

    const draw = () => {
      const { x, y, k } = view.current
      const dpr = devicePixelRatio
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.translate(x, y)
      ctx.scale(k, k)
      const h = hover.current
      const near = new Set<string>()
      if (h) {
        near.add(h.id)
        graph.links.forEach(([a, b]) => (a === h.id ? near.add(b) : b === h.id ? near.add(a) : null))
      }
      ctx.lineWidth = 1 / k
      for (const [s, t] of graph.links) {
        const a = byId.get(s)!
        const b = byId.get(t)!
        const lit = h && (s === h.id || t === h.id)
        ctx.strokeStyle = lit ? col('--interactive-accent') : col('--graph-line')
        ctx.globalAlpha = h && !lit ? 0.25 : 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      for (const n of graph.nodes) {
        const dim = h && !near.has(n.id)
        ctx.globalAlpha = dim ? 0.25 : 1
        ctx.fillStyle =
          n === h || n.fileId === activeId
            ? col('--interactive-accent')
            : n.kind === 'ghost'
              ? col('--graph-ghost')
              : n.kind === 'tag'
                ? col('--graph-tag')
                : col('--graph-node')
        ctx.beginPath()
        ctx.arc(n.x, n.y, radius(n), 0, Math.PI * 2)
        ctx.fill()
        if (k > 0.55 || near.has(n.id) || compact) {
          ctx.fillStyle = col('--text-muted')
          ctx.globalAlpha = dim ? 0.2 : Math.min(1, (k - 0.4) * 2.5) || 1
          ctx.font = `${12 / Math.max(k, 0.8)}px Inter, system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(n.label, n.x, n.y + radius(n) + 13 / Math.max(k, 0.8))
        }
      }
      ctx.globalAlpha = 1
    }

    const toWorld = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect()
      const { x, y, k } = view.current
      return { x: (e.clientX - r.left - x) / k, y: (e.clientY - r.top - y) / k }
    }
    const pick = (e: MouseEvent) => {
      const p = toWorld(e)
      return graph.nodes.find((n) => (n.x - p.x) ** 2 + (n.y - p.y) ** 2 < (radius(n) + 4) ** 2) ?? null
    }
    const onDown = (e: MouseEvent) => {
      moved = false
      const n = pick(e)
      if (n) dragging = n
      else panning = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y }
    }
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        const p = toWorld(e)
        dragging.x = p.x
        dragging.y = p.y
        alpha = Math.max(alpha, 0.3)
        moved = true
      } else if (panning) {
        view.current.x = panning.vx + e.clientX - panning.x
        view.current.y = panning.vy + e.clientY - panning.y
        moved = true
      } else {
        hover.current = pick(e)
        cv.style.cursor = hover.current ? 'pointer' : 'grab'
      }
    }
    const onUp = (e: MouseEvent) => {
      if (dragging && !moved && dragging.kind !== 'tag') onOpen(dragging.fileId ?? null, dragging.label)
      dragging = null
      panning = null
      void e
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = cv.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      const v = view.current
      const k = Math.min(4, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.0015)))
      view.current = { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
    }
    cv.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    cv.addEventListener('wheel', onWheel, { passive: false })
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cv.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cv.removeEventListener('wheel', onWheel)
    }
  }, [graph, activeId, onOpen, compact])

  return (
    <div className={'graph' + (compact ? ' compact' : '')}>
      <canvas ref={canvas} />
      {!compact && (
        <div className="graph-controls">
          <div className="pane-title">Filters</div>
          <input placeholder="Search nodes…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label>
            <input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} /> Tags
          </label>
          <label>
            <input type="checkbox" checked={showOrphans} onChange={(e) => setShowOrphans(e.target.checked)} /> Orphans
          </label>
          <div className="muted small">
            {graph.nodes.length} nodes · {graph.links.length} links
          </div>
        </div>
      )}
    </div>
  )
}
