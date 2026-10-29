import type { ReactNode } from 'react'
import type { MindDiagram, MindNode } from './parse'
import { colorOf, LinkBadge, SvgIcon, textW, type Size } from './shared'

const BRANCH = ['blue', 'orange', 'green', 'purple', 'pink', 'teal', 'red', 'yellow']
const HGAP = 56
const VGAP = 12
const ROOT_GAP = 48
const MARGIN = 24

interface Box {
  n: MindNode
  w: number
  h: number
  font: number
  x: number
  y: number
  color: string
  side: 1 | -1
  parent?: Box
}

function size(n: MindNode) {
  const font = n.depth === 0 ? 15 : n.depth === 1 ? 13.5 : 12.5
  const h = n.depth === 0 ? 48 : n.depth === 1 ? 38 : 30
  return { font, h, w: textW(n.label, font) + (n.icon ? 24 : 0) + (n.depth === 0 ? 40 : 26) }
}

/** Classic mind map: the root in the middle, branches split to the right and left. */
export function renderMindmap(d: MindDiagram, selected?: number | null): Size & { body: ReactNode; title?: string } {
  const boxes: Box[] = []
  const span = new Map<MindNode, number>()
  const spanOf = (n: MindNode): number => {
    const own = size(n).h
    const kids = n.children.reduce((s, c) => s + spanOf(c), 0) + VGAP * Math.max(0, n.children.length - 1)
    const v = Math.max(own, kids)
    span.set(n, v)
    return v
  }

  const place = (n: MindNode, side: 1 | -1, edge: number, top: number, color: string, parent: Box) => {
    const s = size(n)
    const c = n.color ? colorOf(n.color) : color
    const b: Box = { n, ...s, x: side > 0 ? edge : edge - s.w, y: top + span.get(n)! / 2 - s.h / 2, color: c, side, parent }
    boxes.push(b)
    const kids = n.children.reduce((sum, k) => sum + span.get(k)!, 0) + VGAP * Math.max(0, n.children.length - 1)
    let y = top + (span.get(n)! - kids) / 2
    const next = side > 0 ? b.x + b.w + HGAP : b.x - HGAP
    for (const k of n.children) {
      place(k, side, next, y, c, b)
      y += span.get(k)! + VGAP
    }
  }

  let offsetY = 0
  for (const root of d.roots) {
    root.children.forEach(spanOf)
    // Balance the two sides by height, keeping the outline order on each side.
    const total = root.children.reduce((s, c) => s + span.get(c)!, 0)
    const right: MindNode[] = []
    const left: MindNode[] = []
    let acc = 0
    for (const c of root.children) {
      if (acc < total / 2 || root.children.length < 3) right.push(c)
      else left.push(c)
      acc += span.get(c)!
    }
    const side = (list: MindNode[]) => list.reduce((s, c) => s + span.get(c)!, 0) + VGAP * Math.max(0, list.length - 1)
    const s = size(root)
    const height = Math.max(s.h, side(right), side(left))
    const rb: Box = { n: root, ...s, x: 0, y: offsetY + height / 2 - s.h / 2, color: colorOf(root.color), side: 1 }
    boxes.push(rb)
    const branchColor = (i: number) => colorOf(BRANCH[i % BRANCH.length])
    let y = offsetY + (height - side(right)) / 2
    right.forEach((c, i) => {
      place(c, 1, rb.x + rb.w + HGAP, y, branchColor(i), rb)
      y += span.get(c)! + VGAP
    })
    y = offsetY + (height - side(left)) / 2
    left.forEach((c, i) => {
      place(c, -1, rb.x - HGAP, y, branchColor(right.length + i), rb)
      y += span.get(c)! + VGAP
    })
    offsetY += height + ROOT_GAP
  }

  if (!boxes.length) return { width: 300, height: 80, title: d.title, body: null }
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  for (const b of boxes) {
    b.x += MARGIN - minX
    b.y += MARGIN - minY
  }
  const width = Math.max(...boxes.map((b) => b.x + b.w)) + MARGIN
  const height = Math.max(...boxes.map((b) => b.y + b.h)) + MARGIN

  // Each node's group holds the branch to its parent, so presentation reveals them together.
  const body = boxes.map((b) => {
    const on = b.n.line === selected
    let branch: ReactNode = null
    if (b.parent) {
      const p = b.parent
      const x1 = b.side > 0 ? p.x + p.w : p.x
      const y1 = p.y + p.h / 2
      const x2 = b.side > 0 ? b.x : b.x + b.w
      const y2 = b.y + b.h / 2
      const mx = (x1 + x2) / 2
      branch = <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={b.color} strokeWidth={b.n.depth === 1 ? 2.6 : 1.6} strokeOpacity={0.85} className="d-edge-line" />
    }
    const root = b.n.depth === 0
    const tw = textW(b.n.label, b.font) + (b.n.icon ? 24 : 0)
    const tx = b.x + (b.w - tw) / 2
    return (
      <g key={b.n.line} data-line={b.n.line} className="d-pick d-node">
        {branch}
        {on && <rect x={b.x - 5} y={b.y - 5} width={b.w + 10} height={b.h + 10} rx={b.h / 2 + 5} fill="var(--d-select-bg)" stroke="var(--d-select)" strokeWidth={2} />}
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={root ? b.h / 2 : 8} fill="var(--d-node)" />
        <rect
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={root ? b.h / 2 : 8}
          fill={b.color}
          fillOpacity={root ? 0.2 : b.n.depth === 1 ? 0.08 : 0}
          stroke={b.color}
          strokeOpacity={b.n.depth > 1 ? 0.6 : 1}
          strokeWidth={root ? 2 : 1.6}
        />
        <SvgIcon name={b.n.icon} x={tx} y={b.y + b.h / 2 - 8} size={16} color={b.color} />
        <text x={tx + (b.n.icon ? 24 : 0)} y={b.y + b.h / 2 + b.font * 0.35} className="d-node-label" style={{ fontSize: b.font, fontWeight: root ? 600 : undefined }}>
          {b.n.label}
        </text>
        <LinkBadge to={b.n.link} x={b.x + b.w - 2} y={b.y + 2} />
      </g>
    )
  })

  return { width, height, title: d.title, body: <>{body}</> }
}
