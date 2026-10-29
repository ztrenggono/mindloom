import fastDiff from 'fast-diff'

/** Caret pixel position inside a textarea, measured with a mirrored div. */
export function caretXY(el: HTMLTextAreaElement, pos: number) {
  const div = document.createElement('div')
  const cs = getComputedStyle(el)
  for (const p of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'width', 'boxSizing', 'whiteSpace', 'wordWrap', 'tabSize'] as const) {
    div.style[p] = cs[p]
  }
  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  // Code editors do not wrap; notes do.
  div.style.whiteSpace = cs.whiteSpace === 'pre' ? 'pre' : 'pre-wrap'
  div.textContent = el.value.slice(0, pos)
  const span = document.createElement('span')
  span.textContent = '​'
  div.appendChild(span)
  document.body.appendChild(div)
  const out = { x: span.offsetLeft, y: span.offsetTop }
  document.body.removeChild(div)
  return out
}

/**
 * Where index `i` in `prev` ends up in `next`, so a caret stays on the same character
 * when someone else edits the text. Text inserted right at the caret goes before it.
 */
export function mapIndex(prev: string, next: string, i: number) {
  let o = 0
  let n = 0
  for (const [op, s] of fastDiff(prev, next)) {
    if (op === fastDiff.EQUAL) {
      if (i < o + s.length) return n + (i - o)
      o += s.length
      n += s.length
    } else if (op === fastDiff.DELETE) {
      if (i < o + s.length) return n
      o += s.length
    } else n += s.length
  }
  return n + (i - o)
}
