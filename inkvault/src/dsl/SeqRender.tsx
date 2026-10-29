import type { ReactNode } from 'react'
import type { SeqDiagram, SeqItem } from './parse'
import { colorOf, SvgIcon, textW, type Size } from './shared'

const TOP = 24
const BOX_H = 44

/** `selected` is a 1-based source line; the matching participant, message or block is highlighted. */
export function renderSequence(d: SeqDiagram, selected?: number | null): Size & { body: ReactNode; title?: string } {
  const ps = d.participants
  const idx = new Map(ps.map((p, i) => [p.name, i]))
  const boxW = ps.map((p) => Math.max(110, textW(p.name, 13.5) + (p.icon ? 28 : 0) + 32))

  // Widen the gap between neighbours so every message label fits on its line.
  const gaps = ps.slice(1).map((_, i) => (boxW[i] + boxW[i + 1]) / 2 + 48)
  const walkMsgs = (items: SeqItem[], fn: (m: Extract<SeqItem, { kind: 'msg' }>) => void) => {
    for (const it of items) {
      if (it.kind === 'msg') fn(it)
      else if (it.kind === 'block') it.sections.forEach((s) => walkMsgs(s.items, fn))
    }
  }
  walkMsgs(d.items, (m) => {
    const a = idx.get(m.from)!
    const b = idx.get(m.to)!
    const [lo, hi] = a < b ? [a, b] : [b, a]
    const need = textW(m.label ?? '', 12.5) + 60
    if (lo === hi) {
      if (lo < gaps.length) gaps[lo] = Math.max(gaps[lo], need + 30)
      return
    }
    let have = 0
    for (let i = lo; i < hi; i++) have += gaps[i]
    if (have < need) for (let i = lo; i < hi; i++) gaps[i] += (need - have) / (hi - lo)
  })
  const top = TOP
  const xs: number[] = []
  ps.forEach((_, i) => xs.push(i === 0 ? 32 + boxW[0] / 2 : xs[i - 1] + gaps[i - 1]))

  const blocks: ReactNode[] = []
  const msgs: ReactNode[] = []
  const acts: ReactNode[] = []
  const active = new Map<string, number[]>()
  let y = top + BOX_H + 26
  let n = 0
  let key = 0

  const offset = (who: string) => ((active.get(who)?.length ?? 0) > 0 ? 6 : 0)

  const walk = (items: SeqItem[], depth: number) => {
    for (const it of items) {
      if (it.kind === 'act') {
        const st = active.get(it.who) ?? []
        if (it.on) st.push(y - 10)
        else {
          const y0 = st.pop()
          if (y0 !== undefined) acts.push(actBar(xs[idx.get(it.who)!], y0, y + 4, st.length, key++))
        }
        active.set(it.who, st)
        continue
      }
      if (it.kind === 'msg') {
        n++
        const label = (d.autoNumber ? `${n}. ` : '') + (it.label ?? '')
        const a = xs[idx.get(it.from)!]
        const b = xs[idx.get(it.to)!]
        const dashed = it.op === '-->' || it.op === '<--' || it.op === '--'
        const arrowEnd = it.op !== '-' && it.op !== '<' && it.op !== '--' && it.op !== '<--'
        const arrowStart = it.op === '<' || it.op === '<>' || it.op === '<--'
        const on = it.line === selected
        const stroke = on ? 'var(--d-select)' : 'var(--d-edge)'
        if (a === b) {
          y += 8
          const x = a + offset(it.from)
          const lw = Math.max(46, textW(label, 12.5) + 20)
          msgs.push(
            <g key={key++} data-line={it.line} className="d-pick">
              <rect x={x} y={y - 22} width={lw} height={52} rx={6} fill={on ? 'var(--d-select-bg)' : 'transparent'} />
              <text x={x + 10} y={y - 6} className="d-edge-label" textAnchor="start">
                {label}
              </text>
              <path d={`M${x},${y} h36 v26 h-34`} fill="none" stroke={stroke} strokeWidth={on ? 2 : 1.5} strokeDasharray={dashed ? '6 5' : undefined} markerEnd="url(#arrow)" />
            </g>,
          )
          y += 52
          continue
        }
        y += 14
        const dir = Math.sign(b - a)
        const x1 = a + dir * offset(it.from)
        const x2 = b - dir * offset(it.to)
        msgs.push(
          <g key={key++} data-line={it.line} className="d-pick">
            <rect x={Math.min(x1, x2)} y={y - 24} width={Math.abs(x2 - x1)} height={32} rx={6} fill={on ? 'var(--d-select-bg)' : 'transparent'} />
            <text x={(x1 + x2) / 2} y={y - 7} className="d-edge-label" textAnchor="middle">
              {label}
            </text>
            <line
              x1={x1}
              x2={x2}
              y1={y}
              y2={y}
              stroke={stroke}
              strokeWidth={on ? 2 : 1.5}
              strokeDasharray={dashed ? '6 5' : undefined}
              markerEnd={arrowEnd ? 'url(#arrow)' : undefined}
              markerStart={arrowStart ? 'url(#arrow)' : undefined}
            />
          </g>,
        )
        y += 30
        continue
      }
      // Block (loop / alt / opt / par ...)
      const involved = new Set<number>()
      walkMsgs([it], (m) => {
        involved.add(idx.get(m.from)!)
        involved.add(idx.get(m.to)!)
      })
      const list = involved.size ? [...involved] : ps.map((_, i) => i)
      const pad = 24 - depth * 6
      const lo = Math.min(...list)
      const hi = Math.max(...list)
      const x0 = xs[lo] - Math.max(pad + 40, boxW[lo] / 2)
      const x1 = xs[hi] + Math.max(pad + 60, boxW[hi] / 2)
      const y0 = y
      const c = colorOf(it.color, 'var(--d-muted)')
      const dividers: ReactNode[] = []
      y += 30
      it.sections.forEach((sec, si) => {
        if (si > 0) {
          y += 4
          dividers.push(
            <g key={'dv' + si}>
              <line x1={x0} x2={x1} y1={y} y2={y} stroke={c} strokeDasharray="5 4" strokeOpacity={0.7} />
              {sec.label && (
                <text x={x0 + 10} y={y + 16} className="d-block-label" fill={c}>
                  [{sec.label}]
                </text>
              )}
            </g>,
          )
          y += 22
        }
        walk(sec.items, depth + 1)
      })
      y += 10
      const first = it.sections[0]?.label
      const tagW = textW(it.type, 12) + 18
      const on = it.line === selected
      blocks.push(
        <g key={key++} data-line={it.line} className="d-pick">
          <rect x={x0} y={y0} width={x1 - x0} height={y - y0} rx={6} fill={c} fillOpacity={0.05} stroke={on ? 'var(--d-select)' : c} strokeOpacity={on ? 1 : 0.7} strokeWidth={on ? 2 : 1} />
          <path d={`M${x0},${y0 + 20} v-14 a6,6 0 0 1 6,-6 h${tagW} v12 l-8,8 z`} fill={c} fillOpacity={0.85} />
          <text x={x0 + 8} y={y0 + 14} className="d-block-tag">
            {it.type}
          </text>
          {first && (
            <text x={x0 + tagW + 12} y={y0 + 15} className="d-block-label" fill={c}>
              [{first}]
            </text>
          )}
          {dividers}
        </g>,
      )
      y += 10
    }
  }
  walk(d.items, 0)
  for (const [who, st] of active) st.forEach((y0, i) => acts.push(actBar(xs[idx.get(who)!], y0, y, i, key++)))
  y += 16

  const width = (xs.at(-1) ?? 0) + (boxW.at(-1) ?? 0) / 2 + 80
  const heads = ps.map((p, i) => {
    const c = colorOf(p.color)
    const w = boxW[i]
    const x = xs[i] - w / 2
    const tw = textW(p.name, 13.5) + (p.icon ? 24 : 0)
    const on = p.line != null && p.line === selected
    return (
      <g key={p.name} className="d-node">
        <line x1={xs[i]} x2={xs[i]} y1={top + BOX_H} y2={y} stroke={on ? 'var(--d-select)' : 'var(--d-border)'} strokeWidth={1.5} strokeDasharray="4 4" />
        {on && <rect x={x - 5} y={top - 5} width={w + 10} height={BOX_H + 10} rx={12} fill="var(--d-select-bg)" stroke="var(--d-select)" strokeWidth={2} />}
        <rect data-line={p.line} className="d-pick" x={x} y={top} width={w} height={BOX_H} rx={8} fill="var(--d-node)" stroke={c} strokeWidth={1.6} />
        <SvgIcon name={p.icon} x={xs[i] - tw / 2} y={top + 14} size={16} color={c} />
        <text x={xs[i] - tw / 2 + (p.icon ? 24 : 0)} y={top + 27} className="d-node-label">
          {p.name}
        </text>
      </g>
    )
  })

  return {
    width,
    height: y + 16,
    title: d.title,
    body: (
      <>
        {heads}
        {blocks}
        {acts}
        {msgs}
      </>
    ),
  }
}

function actBar(x: number, y0: number, y1: number, level: number, key: number) {
  return <rect key={key} x={x - 6 + level * 5} y={y0} width={12} height={Math.max(12, y1 - y0)} rx={2} fill="var(--d-node)" stroke="var(--d-accent)" strokeWidth={1.4} />
}
