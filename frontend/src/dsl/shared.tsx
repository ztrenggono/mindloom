import { icons, type LucideIcon } from 'lucide-react'
import { logoColor, logoFor } from './logos'

const PALETTE: Record<string, string> = {
  red: '#e5484d',
  orange: '#f76b15',
  yellow: '#e2b93b',
  green: '#30a46c',
  teal: '#12a594',
  blue: '#3e8ef7',
  purple: '#8e6cf0',
  pink: '#d6409f',
  gray: '#8b8d98',
  grey: '#8b8d98',
  black: '#5a5a5a',
  white: '#d0d0d0',
}

export function colorOf(name?: string, fallback = 'var(--d-accent)') {
  if (!name) return fallback
  const c = name.toLowerCase().trim()
  return PALETTE[c] ?? (/^#|^rgb/.test(c) ? c : fallback)
}

const ALIASES: Record<string, string> = {
  tool: 'wrench',
  home: 'house',
  'check-square': 'square-check',
  'help-circle': 'circle-help',
  'alert-circle': 'circle-alert',
  'alert-triangle': 'triangle-alert',
  'message-circle': 'message-circle',
  'check-circle': 'circle-check',
  'x-circle': 'circle-x',
  'play-circle': 'circle-play',
  database: 'database',
  aws: 'cloud',
  gcp: 'cloud',
  azure: 'cloud',
}

function pascal(s: string) {
  return s.replace(/(^|[-_ ])(\w)/g, (_, __, c: string) => c.toUpperCase())
}

export function iconFor(name?: string): LucideIcon | null {
  if (!name) return null
  const key = name.toLowerCase().trim()
  const all = icons as Record<string, LucideIcon>
  return all[pascal(ALIASES[key] ?? key)] ?? all[pascal(key.replace(/^(aws|gcp|azure)-/, ''))] ?? null
}

export function SvgIcon({ name, x, y, size = 16, color }: { name?: string; x: number; y: number; size?: number; color: string }) {
  // Brand names (postgresql, docker, aws-s3...) draw the real logo in its brand colour.
  const logo = logoFor(name)
  if (logo)
    return (
      <svg x={x} y={y} width={size} height={size} viewBox="0 0 24 24">
        <path d={logo.path} fill={logoColor(logo)} />
      </svg>
    )
  const I = iconFor(name)
  if (!I) return null
  return <I x={x} y={y} width={size} height={size} color={color} strokeWidth={2} />
}

/** Rough text width for layout; avoids measuring the DOM before render. */
export function textW(s: string, px = 13) {
  let w = 0
  for (const ch of s) w += /[A-Z]/.test(ch) ? px * 0.66 : /[il.,:;'|]/.test(ch) ? px * 0.3 : px * 0.56
  return w
}

export function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y}L${pts[1].x},${pts[1].y}`
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    d += ` Q${pts[i].x},${pts[i].y} ${i === pts.length - 2 ? `${pts[i + 1].x},${pts[i + 1].y}` : `${mx},${my}`}`
  }
  return d
}

/** Path through axis-aligned points with rounded corners, like Eraser's connectors. */
export function roundedPath(pts: { x: number; y: number }[], r = 8) {
  const p = pts.filter((q, i) => i === 0 || q.x !== pts[i - 1].x || q.y !== pts[i - 1].y)
  if (p.length < 2) return ''
  let d = `M${p[0].x},${p[0].y}`
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]
    const b = p[i]
    const c = p[i + 1]
    const r1 = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2)
    const ux = Math.sign(b.x - a.x)
    const uy = Math.sign(b.y - a.y)
    const vx = Math.sign(c.x - b.x)
    const vy = Math.sign(c.y - b.y)
    d += ` L${b.x - ux * r1},${b.y - uy * r1} Q${b.x},${b.y} ${b.x + vx * r1},${b.y + vy * r1}`
  }
  const last = p[p.length - 1]
  return d + ` L${last.x},${last.y}`
}

/** Right-angle route between two ports. `horizontal` leaves and enters sideways. */
export function orthogonal(a: { x: number; y: number }, b: { x: number; y: number }, horizontal: boolean) {
  if (horizontal) {
    const mx = (a.x + b.x) / 2
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]
  }
  const my = (a.y + b.y) / 2
  return [a, { x: a.x, y: my }, { x: b.x, y: my }, b]
}

/** Badge on a node's corner that opens the note named by its `link:` property. */
export function LinkBadge({ to, x, y }: { to?: string; x: number; y: number }) {
  if (!to) return null
  return (
    <g className="d-link" data-link={to}>
      <title>{`Open note "${to}" (or Ctrl+click the shape)`}</title>
      <circle cx={x} cy={y} r={9.5} />
      <SvgIcon name="file-text" x={x - 5.5} y={y - 5.5} size={11} color="currentColor" />
    </g>
  )
}

export function ArrowDefs() {
  return (
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,1 L9,5 L0,9 z" fill="var(--d-edge)" />
      </marker>
    </defs>
  )
}

export interface Size {
  width: number
  height: number
}
