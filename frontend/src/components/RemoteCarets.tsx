import type { RefObject } from 'react'
import type { RemoteCaret } from '../store'
import { caretXY } from '../lib/caret'

/** Other people's carets over a textarea; render it next to the textarea, in the same positioned parent. */
export function RemoteCarets({ target, carets }: { target: RefObject<HTMLTextAreaElement | null>; carets: RemoteCaret[] }) {
  const el = target.current
  if (!el || !carets.length) return null
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 20
  return (
    <>
      {carets.map((c) => {
        const { x, y } = caretXY(el, Math.min(c.index, el.value.length))
        const top = el.offsetTop + y - el.scrollTop
        const left = el.offsetLeft + x - el.scrollLeft
        if (top < el.offsetTop - lh || top > el.offsetTop + el.clientHeight) return null
        return (
          <div key={c.id} className="remote-caret" style={{ top, left, height: lh, '--peer': c.color } as React.CSSProperties} aria-hidden>
            <span className="remote-caret-name">{c.name}</span>
          </div>
        )
      })}
    </>
  )
}
