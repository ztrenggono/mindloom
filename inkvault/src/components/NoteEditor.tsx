import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { VaultFile } from '../types'
import { DiagramView } from '../dsl/DiagramView'
import { renderNote, toggleTask } from '../lib/markdown'

interface Props {
  file: VaultFile
  allTitles: string[]
  mode: 'edit' | 'read'
  onChange: (doc: string) => void
  onOpenLink: (title: string, newTab: boolean) => void
  onTag: (tag: string) => void
  scrollToLine?: { line: number; n: number }
}

export function NoteEditor({ file, allTitles, mode, onChange, onOpenLink, onTag, scrollToLine }: Props) {
  return mode === 'edit' ? (
    <SourceEditor file={file} allTitles={allTitles} onChange={onChange} scrollToLine={scrollToLine} />
  ) : (
    <Reading file={file} onChange={onChange} onOpenLink={onOpenLink} onTag={onTag} scrollToLine={scrollToLine} />
  )
}

function Reading({ file, onChange, onOpenLink, onTag, scrollToLine }: Omit<Props, 'mode' | 'allTitles'>) {
  // The inline title already shows the note name, so drop a matching leading H1.
  const segs = useMemo(() => {
    const m = /^#\s+(.+)\n?/.exec(file.doc)
    const body = m && m[1].trim().toLowerCase() === file.title.trim().toLowerCase() ? file.doc.slice(m[0].length) : file.doc
    return renderNote(body)
  }, [file.doc, file.title])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scrollToLine || !ref.current) return
    const text = file.doc.split('\n')[scrollToLine.line]?.replace(/^#+\s*/, '').trim()
    const h = [...ref.current.querySelectorAll('h1,h2,h3,h4,h5,h6')].find((el) => el.textContent?.trim() === text)
    h?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToLine])

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    const link = t.closest<HTMLElement>('a.internal-link')
    if (link) {
      e.preventDefault()
      onOpenLink(link.dataset.target!, e.metaKey || e.ctrlKey)
      return
    }
    const tag = t.closest<HTMLElement>('a.tag')
    if (tag) return onTag(tag.dataset.tag!)
    if (t instanceof HTMLInputElement && t.dataset.task) onChange(toggleTask(file.doc, Number(t.dataset.task)))
    const ext = t.closest<HTMLAnchorElement>('a[href]')
    if (ext && /^https?:/.test(ext.href)) {
      e.preventDefault()
      window.open(ext.href, '_blank', 'noopener')
    }
  }

  return (
    <div className="reading markdown" ref={ref} onClick={onClick}>
      {segs.map((s, i) =>
        s.kind === 'html' ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: s.html }} />
        ) : (
          <div key={i} className="md-diagram">
            <DiagramView type={s.type} code={s.code} embedded title={`${file.title}-${s.type}`} />
          </div>
        ),
      )}
    </div>
  )
}

function SourceEditor({ file, allTitles, onChange, scrollToLine }: Omit<Props, 'mode' | 'onOpenLink' | 'onTag'>) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const [suggest, setSuggest] = useState<{ query: string; start: number; x: number; y: number; sel: number } | null>(null)

  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [file.doc])

  useEffect(() => {
    const el = ta.current
    if (!scrollToLine || !el) return
    const pos = file.doc.split('\n').slice(0, scrollToLine.line).join('\n').length + 1
    el.focus()
    el.setSelectionRange(pos, pos)
    const { y } = caretXY(el, pos)
    el.closest('.pane-scroll')?.scrollTo({ top: el.offsetTop + y - 80, behavior: scrollBehavior() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToLine])

  const matches = useMemo(() => {
    if (!suggest) return []
    const q = suggest.query.toLowerCase()
    const hits = allTitles.filter((t) => t.toLowerCase().includes(q)).sort((a, b) => a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q))
    if (q && !allTitles.some((t) => t.toLowerCase() === q)) hits.push(suggest.query)
    return hits.slice(0, 8)
  }, [suggest, allTitles])

  const refreshSuggest = (el: HTMLTextAreaElement) => {
    const pos = el.selectionStart
    const before = el.value.slice(0, pos)
    const m = /\[\[([^\]\n|]*)$/.exec(before)
    if (!m) return setSuggest(null)
    const { x, y } = caretXY(el, pos)
    setSuggest((s) => ({ query: m[1], start: pos - m[1].length, x, y, sel: s?.query === m[1] ? s.sel : 0 }))
  }

  const accept = (title: string) => {
    const el = ta.current!
    const v = el.value
    const end = el.selectionStart
    const after = v.slice(end).startsWith(']]') ? v.slice(end + 2) : v.slice(end)
    const next = v.slice(0, suggest!.start) + title + ']]' + after
    onChange(next)
    setSuggest(null)
    const caret = suggest!.start + title.length + 2
    requestAnimationFrame(() => el.setSelectionRange(caret, caret))
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    if (suggest && matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setSuggest({ ...suggest, sel: (suggest.sel + d + matches.length) % matches.length })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        accept(matches[suggest.sel])
        return
      }
      if (e.key === 'Escape') return setSuggest(null)
    }
    const { selectionStart: s, selectionEnd: en, value: v } = el
    const insert = (text: string, caret = text.length) => {
      e.preventDefault()
      onChange(v.slice(0, s) + text + v.slice(en))
      requestAnimationFrame(() => el.setSelectionRange(s + caret, s + caret))
    }
    if (e.key === 'Tab') return insert('  ')
    if (e.key === '[' && v[s - 1] === '[') return insert('[]]', 1)
    if (e.key === 'Enter') {
      // Continue lists like Obsidian does.
      const lineStart = v.lastIndexOf('\n', s - 1) + 1
      const line = v.slice(lineStart, s)
      const m = /^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)\. |> )/.exec(line)
      if (m) {
        if (line.trim() === m[2].trim()) {
          e.preventDefault()
          onChange(v.slice(0, lineStart) + v.slice(s))
          requestAnimationFrame(() => el.setSelectionRange(lineStart, lineStart))
          return
        }
        const bullet = m[3] ? `${Number(m[3]) + 1}. ` : m[2].replace(/\[[xX]\]/, '[ ]')
        return insert('\n' + m[1] + bullet)
      }
    }
    const mod = e.metaKey || e.ctrlKey
    if (mod && (e.key === 'b' || e.key === 'i')) {
      const mark = e.key === 'b' ? '**' : '*'
      e.preventDefault()
      onChange(v.slice(0, s) + mark + v.slice(s, en) + mark + v.slice(en))
      requestAnimationFrame(() => el.setSelectionRange(s + mark.length, en + mark.length))
    }
  }

  return (
    <div className="source">
      <textarea
        ref={ta}
        className="source-editor"
        value={file.doc}
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value)
          refreshSuggest(e.target)
        }}
        onKeyDown={onKey}
        onKeyUp={(e) => !['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key) && refreshSuggest(e.currentTarget)}
        onClick={(e) => refreshSuggest(e.currentTarget)}
        onBlur={() => setTimeout(() => setSuggest(null), 150)}
        placeholder="Start writing… use [[ to link notes"
      />
      {suggest && matches.length > 0 && (
        <div className="suggest" style={{ left: suggest.x, top: suggest.y + 24 }}>
          {matches.map((m, i) => (
            <div key={m} className={'suggest-item' + (i === suggest.sel ? ' active' : '')} onMouseDown={(e) => (e.preventDefault(), accept(m))}>
              {allTitles.includes(m) ? m : <>Create “{m}”</>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function scrollBehavior(): ScrollBehavior {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** Caret pixel position inside a textarea, measured with a mirrored div. */
function caretXY(el: HTMLTextAreaElement, pos: number) {
  const div = document.createElement('div')
  const cs = getComputedStyle(el)
  for (const p of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'width', 'boxSizing', 'whiteSpace', 'wordWrap', 'tabSize'] as const) {
    div.style[p] = cs[p]
  }
  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.textContent = el.value.slice(0, pos)
  const span = document.createElement('span')
  span.textContent = '​'
  div.appendChild(span)
  document.body.appendChild(div)
  const out = { x: span.offsetLeft, y: span.offsetTop }
  document.body.removeChild(div)
  return out
}
