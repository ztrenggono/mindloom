import dagre from '@dagrejs/dagre'
import type { ReactNode } from 'react'
import type { FlowDiagram } from './parse'
import { colorOf, LinkBadge, orthogonal, roundedPath, SvgIcon, textW, type Size } from './shared'

const RANKDIR = { right: 'LR', left: 'RL', down: 'TB', up: 'BT' } as const

/** `selected` is a 1-based source line; the matching node, group or edge is highlighted. */
export function renderFlow(d: FlowDiagram, selected?: number | null): Size & { body: ReactNode; title?: string } {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true })
  g.setGraph({ rankdir: RANKDIR[d.direction], nodesep: 36, ranksep: 64, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const grp of d.groups.values()) g.setNode('g:' + grp.id, { label: grp.label, paddingTop: 28 })
  for (const grp of d.groups.values()) if (grp.parent) g.setParent('g:' + grp.id, 'g:' + grp.parent)

  for (const n of d.nodes.values()) {
    const base = textW(n.label) + (n.icon ? 26 : 0) + 32
    let width = Math.max(110, base)
    let height = 44
    if (n.shape === 'diamond') {
      width = Math.max(140, base * 1.45)
      height = 76
    } else if (n.shape === 'circle') {
      width = height = Math.max(70, base * 0.9)
    } else if (n.shape === 'cylinder') height = 58
    g.setNode('n:' + n.id, { width, height })
    if (n.group && d.groups.has(n.group)) g.setParent('n:' + n.id, 'g:' + n.group)
  }

  // Edges can target a group; dagre cannot, so point them at the group's first node.
  const resolve = (id: string): string | null => {
    if (d.nodes.has(id)) return 'n:' + id
    const child = [...d.nodes.values()].find((n) => n.group === id)
    if (child) return 'n:' + child.id
    const sub = [...d.groups.values()].find((x) => x.parent === id)
    return sub ? resolve(sub.id) : null
  }
  d.edges.forEach((e, i) => {
    const a = resolve(e.from)
    const b = resolve(e.to)
    if (!a || !b) return
    const lw = e.label ? textW(e.label, 12) + 14 : 0
    g.setEdge(a, b, { label: e.label, width: lw, height: e.label ? 22 : 0, labelpos: 'c', idx: i }, 'e' + i)
  })

  dagre.layout(g)
  const { width = 0, height = 0 } = g.graph()

  const groups = [...d.groups.values()].map((grp) => {
    const n = g.node('g:' + grp.id)
    if (!n) return null
    const on = grp.line === selected
    const c = colorOf(grp.color, 'var(--d-muted)')
    const x = n.x - n.width / 2
    const y = n.y - n.height / 2 - 14
    return (
      <g key={'g' + grp.id} data-line={grp.line} className="d-pick">
        <rect x={x} y={y} width={n.width} height={n.height + 14} rx={10} fill={c} fillOpacity={0.06} stroke={on ? 'var(--d-select)' : c} strokeOpacity={on ? 1 : 0.55} strokeWidth={on ? 2 : 1} strokeDasharray={on ? undefined : '5 4'} />
        <SvgIcon name={grp.icon} x={x + 10} y={y + 8} size={14} color={c} />
        <text x={x + (grp.icon ? 30 : 12)} y={y + 20} className="d-group-label" fill={c}>
          {grp.label}
        </text>
      </g>
    )
  })

  const edges = g.edges().map((ref) => {
    const ed = g.edge(ref)
    const meta = d.edges[ed.idx as number]
    // Right-angle connectors with rounded corners, leaving along the layout direction.
    const horizontal = d.direction === 'right' || d.direction === 'left'
    const pts = orthogonal(ed.points[0], ed.points[ed.points.length - 1], horizontal)
    const path = roundedPath(pts, 12)
    const mid = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 }
    const dashed = meta.op === '-->' || meta.op === '<--' || meta.op === '--'
    const start = meta.op === '<' || meta.op === '<>' || meta.op === '<--'
    const end = meta.op === '>' || meta.op === '<>' || meta.op === '-->'
    const on = meta.line === selected
    const c = on ? 'var(--d-select)' : meta.color ? colorOf(meta.color) : 'var(--d-edge)'
    return (
      <g key={ref.name} data-line={meta.line} className="d-pick">
        <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
        <path
          d={path}
          fill="none"
          stroke={c}
          strokeWidth={on ? 2.2 : 1.6}
          strokeDasharray={dashed ? '6 5' : undefined}
          className={'d-edge-line' + (dashed ? ' dashed' : '')}
          markerEnd={end ? 'url(#arrow)' : undefined}
          markerStart={start ? 'url(#arrow)' : undefined}
        />
        {meta.label && (
          <g transform={`translate(${mid.x},${mid.y})`}>
            <rect x={-ed.width / 2} y={-11} width={ed.width} height={22} rx={6} className="d-edge-label-bg" />
            <text textAnchor="middle" dy={4} className="d-edge-label">
              {meta.label}
            </text>
          </g>
        )}
      </g>
    )
  })

  const nodes = [...d.nodes.values()].map((n) => {
    const p = g.node('n:' + n.id)
    if (!p) return null
    const c = colorOf(n.color)
    const x = p.x - p.width / 2
    const y = p.y - p.height / 2
    const common = { fill: 'var(--d-node)', stroke: c, strokeWidth: 1.6 }
    let shape: ReactNode
    switch (n.shape) {
      case 'diamond':
        shape = <polygon points={`${p.x},${y} ${x + p.width},${p.y} ${p.x},${y + p.height} ${x},${p.y}`} {...common} strokeLinejoin="round" />
        break
      case 'oval':
      case 'ellipse':
        shape = <rect x={x} y={y} width={p.width} height={p.height} rx={p.height / 2} {...common} />
        break
      case 'circle':
        shape = <circle cx={p.x} cy={p.y} r={p.width / 2} {...common} />
        break
      case 'cylinder':
        shape = (
          <g>
            <path d={`M${x},${y + 8} v${p.height - 16} a${p.width / 2},8 0 0 0 ${p.width},0 v${-(p.height - 16)}`} {...common} />
            <ellipse cx={p.x} cy={y + 8} rx={p.width / 2} ry={8} {...common} />
          </g>
        )
        break
      default:
        shape = <rect x={x} y={y} width={p.width} height={p.height} rx={8} {...common} />
    }
    const tw = textW(n.label) + (n.icon ? 22 : 0)
    const tx = p.x - tw / 2
    return (
      <g key={'n' + n.id} className="d-node d-pick" data-line={n.line}>
        {n.line === selected && <rect x={x - 5} y={y - 5} width={p.width + 10} height={p.height + 10} rx={12} fill="var(--d-select-bg)" stroke="var(--d-select)" strokeWidth={2} />}
        {shape}
        <rect x={x} y={y} width={p.width} height={p.height} fill="transparent" />
        <SvgIcon name={n.icon} x={tx} y={p.y - 8} size={16} color={c} />
        <text x={tx + (n.icon ? 22 : 0)} y={p.y + 4.5} className="d-node-label">
          {n.label}
        </text>
        <LinkBadge to={n.link} x={x + p.width - 2} y={y + 2} />
      </g>
    )
  })

  return {
    width,
    height,
    title: d.title,
    body: (
      <>
        {groups}
        {edges}
        {nodes}
      </>
    ),
  }
}
