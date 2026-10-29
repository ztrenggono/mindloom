import { useEffect, useRef, useState } from 'react'

const DELAY = 400
// After one tooltip closes, the next opens at once (no delay, no animation) while moving along a toolbar.
const WARM_MS = 400

interface Tip {
  text: string
  x: number
  y: number
  instant: boolean
}

/**
 * One shared tooltip for every element with `data-tip`, shown to its right with an arrow.
 * Mount once near the app root.
 */
export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const lastHide = useRef(0)
  const shown = useRef(false)

  useEffect(() => {
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip
      if (!text) return
      const r = el.getBoundingClientRect()
      const instant = Date.now() - lastHide.current < WARM_MS
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        shown.current = true
        setTip({ text, x: r.right + 10, y: r.top + r.height / 2, instant })
      }, instant ? 0 : DELAY)
    }
    const hide = () => {
      window.clearTimeout(timer.current)
      // Recorded right away, so a pointerover that follows in the same tick sees it.
      if (shown.current) lastHide.current = Date.now()
      shown.current = false
      setTip(null)
    }
    const target = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null

    const over = (e: PointerEvent) => {
      const el = target(e)
      if (el && !el.contains(e.relatedTarget as Node)) show(el)
    }
    const out = (e: PointerEvent) => {
      const el = target(e)
      if (el && !el.contains(e.relatedTarget as Node)) hide()
    }
    const focus = (e: FocusEvent) => {
      const el = target(e)
      if (el?.matches(':focus-visible')) show(el)
    }

    document.addEventListener('pointerover', over)
    document.addEventListener('pointerout', out)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', hide)
    // Clicking usually opens something; the tooltip would just cover it.
    document.addEventListener('pointerdown', hide)
    return () => {
      window.clearTimeout(timer.current)
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerout', out)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('pointerdown', hide)
    }
  }, [])

  if (!tip) return null
  return (
    <div className={'tooltip' + (tip.instant ? ' instant' : '')} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  )
}
