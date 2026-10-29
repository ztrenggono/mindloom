import { useLayoutEffect, useRef, type RefObject } from 'react'
import { mapIndex } from './caret'

/**
 * Keeps the caret on the same character when the textarea's text changes under it, e.g. from
 * someone else's edit. React would otherwise move it to the end.
 */
export function useKeepSelection(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  const saved = useRef<{ value: string; start: number; end: number } | null>(null)
  const el = ref.current
  // Read during render, before React writes the new value into the element.
  if (el && el.value !== value && document.activeElement === el) saved.current = { value: el.value, start: el.selectionStart, end: el.selectionEnd }
  useLayoutEffect(() => {
    const s = saved.current
    const el = ref.current
    saved.current = null
    if (s && el) el.setSelectionRange(mapIndex(s.value, value, s.start), mapIndex(s.value, value, s.end))
  }, [ref, value])
}
