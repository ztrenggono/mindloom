import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ArrowLeft, ChevronRight, ImagePlus, LayoutTemplate, Search, Shapes, Smile } from 'lucide-react'
import { icons, type LucideIcon } from 'lucide-react'
import type { DiagramType } from '../types'
import { TEMPLATE_CATEGORIES, TEMPLATES, type Template } from '../templates'
import { LOGOS, logoColor, type Logo } from '../dsl/logos'
import { iconFor } from '../dsl/shared'
import { TEMPLATES as BLANK, TYPE_ICON } from './CanvasPanel'

/** An icon or image ready to drop on the whiteboard. */
export interface InsertAsset {
  dataURL: string
  mimeType: string
  width: number
  height: number
}

interface Props {
  anchor: { top: number; left: number; right: number }
  onClose: () => void
  onBlank: (type: DiagramType) => void
  onTemplate: (t: Template) => void
  onAsset: (a: InsertAsset) => void
}

type View = { kind: 'root' } | { kind: 'blank' } | { kind: 'catalog' } | { kind: 'category'; id: string } | { kind: 'icons'; tab: 'logos' | 'general' }

const GENERAL = Object.keys(icons)
const PANEL_W = 340

/** Eraser-style insert menu: categories first, drill in for diagrams, templates and icons. */
export function InsertPanel({ anchor, onClose, onBlank, onTemplate, onAsset }: Props) {
  const [view, setView] = useState<View>({ kind: 'root' })
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const down = (e: globalThis.MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])

  const query = q.trim().toLowerCase()
  const results = useMemo(() => {
    if (!query) return null
    const has = (...s: string[]) => s.some((x) => x.toLowerCase().includes(query))
    return {
      templates: TEMPLATES.filter((t) => has(t.title, t.description, TEMPLATE_CATEGORIES.find((c) => c.id === t.category)!.label)),
      logos: LOGOS.filter((l) => has(l.title, l.slug)).slice(0, 24),
      general: GENERAL.filter((n) => n.toLowerCase().includes(query.replace(/[\s-]/g, ''))).slice(0, 24),
    }
  }, [query])

  // Keep the panel on screen: right-align to the + button when there is room, otherwise left-align.
  const rightAligned = anchor.right - PANEL_W >= 8
  const left = rightAligned ? anchor.right - PANEL_W : Math.max(8, anchor.left)

  const pickImage = async (f: File | undefined) => {
    if (!f) return
    const dataURL = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.onerror = () => rej(r.error)
      r.readAsDataURL(f)
    })
    const img = new Image()
    img.src = dataURL
    await img.decode().catch(() => undefined)
    const scale = Math.min(1, 480 / (img.naturalWidth || 480))
    onAsset({ dataURL, mimeType: f.type || 'image/png', width: (img.naturalWidth || 320) * scale, height: (img.naturalHeight || 240) * scale })
  }

  const pickIcon = (e: MouseEvent<HTMLButtonElement>) => {
    // Reuse the rendered SVG, baking in the colour so it stays visible once it is an image.
    const svg = e.currentTarget.querySelector('svg')
    if (!svg) return
    const color = getComputedStyle(e.currentTarget).color
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', '96')
    clone.setAttribute('height', '96')
    const markup = clone.outerHTML.replaceAll('currentColor', color)
    onAsset({ dataURL: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`, mimeType: 'image/svg+xml', width: 96, height: 96 })
  }

  const back = (to: View) => (
    <button className="insert-back" onClick={() => setView(to)}>
      <ArrowLeft size={14} /> Back
    </button>
  )

  return (
    <div ref={ref} className="insert-panel" style={{ top: anchor.top, left, width: PANEL_W, transformOrigin: rightAligned ? 'top right' : 'top left' }} role="dialog" aria-label="Insert">
      <label className="insert-search">
        <Search size={15} />
        <input autoFocus placeholder="Insert item" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="insert-body">
        {results ? (
          <>
            {results.templates.length > 0 && <div className="insert-label">Templates</div>}
            {results.templates.map((t) => (
              <TemplateRow key={t.id} t={t} onClick={() => onTemplate(t)} />
            ))}
            {results.logos.length + results.general.length > 0 && <div className="insert-label">Icons</div>}
            <IconGrid logos={results.logos} general={results.general} onPick={pickIcon} />
            {results.templates.length + results.logos.length + results.general.length === 0 && <div className="empty small">Nothing matches "{q}"</div>}
          </>
        ) : view.kind === 'root' ? (
          <>
            <div className="insert-label">All categories</div>
            <Row icon={Shapes} title="Diagram as Code" sub="Start a blank diagram from code" onClick={() => setView({ kind: 'blank' })} more />
            <Row icon={LayoutTemplate} title="Template Catalog" sub={`${TEMPLATES.length} diagrams from real IT systems`} onClick={() => setView({ kind: 'catalog' })} more />
            <Row icon={Smile} title="Icon" sub={`${LOGOS.length} tech logos and ${GENERAL.length}+ icons`} onClick={() => setView({ kind: 'icons', tab: 'logos' })} more />
            <Row icon={ImagePlus} title="Image" sub="Upload a PNG, JPG, SVG or GIF to the whiteboard" onClick={() => file.current?.click()} />
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => (pickImage(e.target.files?.[0]), (e.target.value = ''))} />
          </>
        ) : view.kind === 'blank' ? (
          <>
            {back({ kind: 'root' })}
            <div className="insert-label">Diagram as Code</div>
            {(Object.keys(BLANK) as DiagramType[]).map((t) => (
              <Row key={t} icon={TYPE_ICON[t]} title={BLANK[t].label} sub="Starter code you can edit" onClick={() => onBlank(t)} />
            ))}
          </>
        ) : view.kind === 'catalog' ? (
          <>
            {back({ kind: 'root' })}
            <div className="insert-label">Template Catalog</div>
            {TEMPLATE_CATEGORIES.map((c) => (
              <Row
                key={c.id}
                icon={iconFor(c.icon) ?? LayoutTemplate}
                title={c.label}
                sub={`${TEMPLATES.filter((t) => t.category === c.id).length} templates · ${c.description}`}
                onClick={() => setView({ kind: 'category', id: c.id })}
                more
              />
            ))}
          </>
        ) : view.kind === 'category' ? (
          <>
            {back({ kind: 'catalog' })}
            <div className="insert-label">{TEMPLATE_CATEGORIES.find((c) => c.id === view.id)?.label}</div>
            {TEMPLATES.filter((t) => t.category === view.id).map((t) => (
              <TemplateRow key={t.id} t={t} onClick={() => onTemplate(t)} />
            ))}
          </>
        ) : (
          <>
            {back({ kind: 'root' })}
            <div className="segmented insert-tabs">
              <button className={view.tab === 'logos' ? 'on' : ''} onClick={() => setView({ kind: 'icons', tab: 'logos' })}>
                Tech logos
              </button>
              <button className={view.tab === 'general' ? 'on' : ''} onClick={() => setView({ kind: 'icons', tab: 'general' })}>
                General
              </button>
            </div>
            <div className="insert-hint">Click to add to the whiteboard. In code, use the name shown on hover, e.g. icon: postgresql</div>
            {view.tab === 'logos' ? <IconGrid logos={LOGOS} general={[]} onPick={pickIcon} /> : <IconGrid logos={[]} general={GENERAL.slice(0, 300)} onPick={pickIcon} />}
          </>
        )}
      </div>
      <div className="insert-foot">
        <span>{view.kind === 'root' && !query ? 'Diagram catalog' : 'Esc to close'}</span>
        <span>Type to search everything</span>
      </div>
    </div>
  )
}

function Row({ icon: Icon, title, sub, onClick, more }: { icon: LucideIcon; title: string; sub: string; onClick: () => void; more?: boolean }) {
  return (
    <button className="insert-row" onClick={onClick}>
      <Icon size={20} />
      <span className="insert-text">
        <span className="insert-title">{title}</span>
        <span className="insert-sub">{sub}</span>
      </span>
      {more && <ChevronRight size={15} className="muted" />}
    </button>
  )
}

function TemplateRow({ t, onClick }: { t: Template; onClick: () => void }) {
  return <Row icon={TYPE_ICON[t.type]} title={t.title} sub={t.description} onClick={onClick} />
}

function IconGrid({ logos, general, onPick }: { logos: Logo[]; general: string[]; onPick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  const all = icons as Record<string, LucideIcon>
  return (
    <div className="icon-grid">
      {logos.map((l) => (
        <button key={l.slug} title={`${l.title} · icon: ${l.slug}`} style={{ color: logoColor(l, 'var(--text-normal)') }} onClick={onPick}>
          <svg viewBox="0 0 24 24" width={22} height={22}>
            <path d={l.path} fill="currentColor" />
          </svg>
        </button>
      ))}
      {general.map((n) => {
        const I = all[n]
        const code = n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])(\d)/g, '$1-$2').toLowerCase()
        return (
          <button key={n} title={`icon: ${code}`} onClick={onPick}>
            <I size={22} />
          </button>
        )
      })}
    </div>
  )
}
