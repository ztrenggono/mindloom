import { useEffect, useMemo, useState } from 'react'
import type { VaultFile } from '../types'

export interface Command {
  id: string
  name: string
  hotkey?: string
  run: () => void
}

interface Props {
  mode: 'commands' | 'files'
  commands: Command[]
  files: VaultFile[]
  onOpenFile: (id: string, newTab: boolean) => void
  onCreate: (title: string) => void
  onClose: () => void
}

/** Subsequence match with a score that favours early and consecutive hits. */
function fuzzy(q: string, s: string) {
  if (!q) return 1
  const a = q.toLowerCase()
  const b = s.toLowerCase()
  let i = 0
  let score = 0
  let last = -1
  for (let j = 0; j < b.length && i < a.length; j++) {
    if (b[j] === a[i]) {
      score += last === j - 1 ? 3 : 1
      if (j === 0) score += 2
      last = j
      i++
    }
  }
  return i === a.length ? score / (b.length * 0.1 + 1) : 0
}

export function CommandPalette({ mode, commands, files, onOpenFile, onCreate, onClose }: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)

  const items = useMemo(() => {
    if (mode === 'commands')
      return commands
        .map((c) => ({ key: c.id, label: c.name, hint: c.hotkey, score: fuzzy(q, c.name), run: () => c.run() }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
    const list = files
      .map((f) => ({ key: f.id, label: f.title, hint: f.folder, score: fuzzy(q, f.title) + (fuzzy(q, f.folder + '/' + f.title) > 0 ? 0.01 : 0), run: (nt: boolean) => onOpenFile(f.id, nt) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    if (q.trim() && !files.some((f) => f.title.toLowerCase() === q.trim().toLowerCase()))
      list.push({ key: '__new', label: `Create new note “${q.trim()}”`, hint: 'Enter', score: 0, run: () => onCreate(q.trim()) })
    return list
  }, [mode, q, commands, files, onOpenFile, onCreate])

  useEffect(() => setSel(0), [q])

  const go = (i: number, newTab = false) => {
    const it = items[i]
    if (!it) return
    onClose()
    ;(it.run as (nt: boolean) => void)(newTab)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={mode === 'commands' ? 'Type a command…' : 'Find or create a note…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(items.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              go(sel, e.metaKey || e.ctrlKey)
            } else if (e.key === 'Escape') onClose()
          }}
        />
        <div className="palette-list">
          {items.length === 0 && <div className="empty small">No matches</div>}
          {items.slice(0, 50).map((it, i) => (
            <div key={it.key} className={'palette-item' + (i === sel ? ' active' : '')} onMouseEnter={() => setSel(i)} onClick={(e) => go(i, e.metaKey || e.ctrlKey)}>
              <span>{it.label}</span>
              {it.hint && <span className="hint">{it.hint}</span>}
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          {mode === 'files' && <span>⌘/Ctrl ↵ new tab</span>}
          <span>esc dismiss</span>
        </div>
      </div>
    </div>
  )
}
