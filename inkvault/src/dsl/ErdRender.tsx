import dagre from '@dagrejs/dagre'
import type { ReactNode } from 'react'
import type { ErdDiagram } from './parse'
import { colorOf, LinkBadge, orthogonal, roundedPath, SvgIcon, textW, type Size } from './shared'

const HEAD = 36
const ROW = 27

/** `selected` is a 1-based source line; the matching row, entity or relationship is highlighted. */
export function renderErd(d: ErdDiagram, selected?: number | null): Size & { body: ReactNode; title?: string } {
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 120, marginx: 28, marginy: 28 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const e of d.entities.values()) {
    const colW = Math.max(0, ...e.columns.map((c) => textW(c.name, 12) + textW([c.type, ...c.flags].join(' '), 11) + 48))
    const width = Math.max(150, textW(e.name, 13.5) + (e.icon ? 56 : 32), colW)
    g.setNode(e.name, { width, height: HEAD + Math.max(1, e.columns.length) * ROW })
  }
  // The "many" side sits left of the "one" side, which reads like a typical ERD.
  d.rels.forEach((r, i) => {
    const [a, b] = r.op === '<' ? [r.to.entity, r.from.entity] : [r.from.entity, r.to.entity]
    if (a !== b) g.setEdge(a, b, {}, 'r' + i)
  })
  dagre.layout(g)
  const { width = 0, height = 0 } = g.graph()

  const box = (name: string) => {
    const n = g.node(name)
    return { x: n.x - n.width / 2, y: n.y - n.height / 2, w: n.width, h: n.height, cx: n.x }
  }
  const rowY = (entity: string, col?: string) => {
    const b = box(entity)
    const idx = col ? d.entities.get(entity)!.columns.findIndex((c) => c.name === col) : -1
    return idx < 0 ? b.y + HEAD / 2 : b.y + HEAD + idx * ROW + ROW / 2
  }

  const rels = d.rels.map((r, i) => {
    const A = box(r.from.entity)
    const B = box(r.to.entity)
    const ay = rowY(r.from.entity, r.from.column)
    const by = rowY(r.to.entity, r.to.column)
    let pts: { x: number; y: number }[]
    let adir: number, bdir: number
    if (r.from.entity === r.to.entity || Math.abs(A.cx - B.cx) < (A.w + B.w) / 2) {
      // Self or stacked entities: loop out around the right side.
      const out = Math.max(A.x + A.w, B.x + B.w) + 28
      pts = [
        { x: A.x + A.w, y: ay },
        { x: out, y: ay },
        { x: out, y: by },
        { x: B.x + B.w, y: by },
      ]
      adir = bdir = 1
    } else if (A.cx < B.cx) {
      pts = orthogonal({ x: A.x + A.w, y: ay }, { x: B.x, y: by }, true)
      adir = 1
      bdir = -1
    } else {
      pts = orthogonal({ x: A.x, y: ay }, { x: B.x + B.w, y: by }, true)
      adir = -1
      bdir = 1
    }
    const path = roundedPath(pts, 12)
    const manyFrom = r.op === '>' || r.op === '<>'
    const manyTo = r.op === '<' || r.op === '<>'
    const on = r.line === selected
    const stroke = on ? 'var(--d-select)' : 'var(--d-line)'
    const a = pts[0]
    const b = pts[pts.length - 1]
    return (
      <g key={'r' + i} data-line={r.line} className="d-pick">
        <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
        <path d={path} fill="none" stroke={stroke} strokeWidth={on ? 2.2 : 1.6} className="d-edge-line" />
        <circle cx={a.x} cy={a.y} r={2.4} fill={stroke} />
        <circle cx={b.x} cy={b.y} r={2.4} fill={stroke} />
        {cardinality(a.x, a.y, adir, manyFrom, on)}
        {cardinality(b.x, b.y, bdir, manyTo, on)}
      </g>
    )
  })

  const ents = [...d.entities.values()].map((e) => {
    const b = box(e.name)
    const c = colorOf(e.color, 'var(--d-muted)')
    const active = selected != null && (e.line === selected || e.columns.some((col) => col.line === selected))
    return (
      // data-line on the whole entity lets presentation and diff treat it as one unit.
      <g key={e.name} className="d-node" data-line={e.line}>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill="var(--d-node)" />
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill={c} fillOpacity={0.08} />
        <path d={`M${b.x},${b.y + 6} a6,6 0 0 1 6,-6 h${b.w - 12} a6,6 0 0 1 6,6 v${HEAD - 6} h${-b.w} z`} fill={c} fillOpacity={0.16} />
        <text x={b.x + 12} y={b.y + 23} className="d-entity-name">
          {e.name}
        </text>
        <SvgIcon name={e.icon} x={b.x + b.w - 28} y={b.y + 10} size={16} color="var(--d-text)" />
        {e.line && <rect data-line={e.line} className="d-pick" x={b.x} y={b.y} width={b.w} height={HEAD} fill="transparent" />}
        {e.columns.map((col, i) => {
          const y = b.y + HEAD + i * ROW
          const on = col.line === selected
          return (
            <g key={col.name + i} data-line={col.line} className="d-pick">
              <rect x={b.x + 1} y={y} width={b.w - 2} height={ROW} fill={on ? 'var(--d-select-bg)' : 'transparent'} />
              {on && <rect x={b.x + 3} y={y + 2} width={b.w - 6} height={ROW - 4} rx={4} fill="none" stroke="var(--d-select)" strokeWidth={1.5} />}
              <line x1={b.x} x2={b.x + b.w} y1={y} y2={y} stroke={c} strokeOpacity={0.25} />
              <text x={b.x + 12} y={y + 17.5} className="d-col">
                {col.name}
              </text>
              <text x={b.x + b.w - 10} y={y + 17.5} textAnchor="end" className="d-col-type" style={{ fill: c }}>
                {[col.type, ...col.flags].filter(Boolean).join(' ')}
              </text>
            </g>
          )
        })}
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill="none" stroke={c} strokeWidth={1.5} pointerEvents="none" />
        {active && <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} rx={9} fill="none" stroke="var(--d-select)" strokeWidth={2} pointerEvents="none" />}
        <LinkBadge to={e.link} x={b.x + b.w} y={b.y} />
      </g>
    )
  })

  return {
    width,
    height,
    title: d.title,
    body: (
      <>
        {rels}
        {ents}
      </>
    ),
  }
}

/** Chen-style label above the line end, as Eraser draws it: "1" for one, "*" for many. */
function cardinality(x: number, y: number, dir: number, many: boolean, on: boolean) {
  return (
    <text
      x={x + dir * (many ? 10 : 14)}
      y={y - 6}
      textAnchor={dir > 0 ? 'start' : 'end'}
      className={'d-card' + (many ? ' many' : '')}
      style={on ? { fill: 'var(--d-select)' } : undefined}
    >
      {many ? '*' : '1'}
    </text>
  )
}
