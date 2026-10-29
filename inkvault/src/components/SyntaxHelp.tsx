import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { DiagramType } from '../types'

interface Entry {
  label: string
  code: string
  note?: string
}

const ERD: Entry[] = [
  { label: 'Define entity', code: 'users {\n  // define attributes\n}' },
  { label: 'Entity properties', code: 'users [icon: user, color: purple] {\n  // define attributes\n}' },
  { label: 'Define attribute', code: 'id string' },
  { label: 'Primary / foreign key', code: 'id string pk\nteam_id int fk' },
  { label: 'One to many', code: 'users.id < posts.user_id', note: '1 → *' },
  { label: 'Many to one', code: 'posts.user_id > users.id', note: '* → 1' },
  { label: 'One to one', code: 'users.id - profiles.user_id', note: '1 → 1' },
  { label: 'Many to many', code: 'users.id <> teams.id', note: '* → *' },
  { label: 'Link to a note', code: 'users [link: User accounts] {\n  id int pk\n}', note: 'Click the badge, or Ctrl+click the table' },
  { label: 'Title', code: 'title Order System' },
]

const FLOW: Entry[] = [
  { label: 'Define node', code: 'Start' },
  { label: 'Node properties', code: 'Start [shape: oval, icon: play, color: green]', note: 'shape: rectangle, oval, diamond, circle, cylinder' },
  { label: 'Custom label', code: 'db [label: "Main Database", shape: cylinder]' },
  { label: 'Group', code: 'Backend [color: blue] {\n  API\n  Worker\n}' },
  { label: 'Arrow', code: 'Start > Process' },
  { label: 'Arrow with label', code: 'Decide > End: no' },
  { label: 'Two-way arrow', code: 'API <> Cache' },
  { label: 'Dashed / plain line', code: 'API --> Logs\nAPI - Config' },
  { label: 'Chain and fan out', code: 'A > B > C\nA > B, C' },
  { label: 'Connection color', code: 'A > B [color: red]' },
  { label: 'Link to a note', code: 'API [icon: server, link: API design]', note: 'Click the badge, or Ctrl+click the shape' },
  { label: 'Direction', code: 'direction right', note: 'right, left, down, up' },
  { label: 'Title', code: 'title Checkout Flow' },
]

const SEQ: Entry[] = [
  { label: 'Participant', code: 'Browser [icon: monitor, color: gray]' },
  { label: 'Message', code: 'Browser > API: GET /items' },
  { label: 'Reply (dashed)', code: 'API --> Browser: 200 OK' },
  { label: 'Activation', code: 'activate API\ndeactivate API' },
  { label: 'Loop', code: 'loop [label: every 5s] {\n  Client > API: poll\n}' },
  { label: 'Alternative', code: 'alt [label: found] {\n  API --> Client: 200\n}\nelse [label: missing] {\n  API --> Client: 404\n}' },
  { label: 'Other blocks', code: 'opt [label: cache hit] {\n  API > Cache: get\n}', note: 'also par / and, break, critical' },
  { label: 'Link to a note', code: 'API [icon: server, link: API design]' },
  { label: 'Auto numbering', code: 'autoNumber on' },
  { label: 'Title', code: 'title Login Flow' },
]

const MIND: Entry[] = [
  { label: 'Central topic', code: 'Product Launch' },
  { label: 'Branches', code: 'Product Launch\n  Research\n  Build', note: 'Indent a line to make it a child' },
  { label: 'Deeper levels', code: 'Build\n  MVP scope\n    Auth\n    Billing' },
  { label: 'Bullets work too', code: '- Product Launch\n  - Research\n  - Build' },
  { label: 'Topic properties', code: 'Marketing [icon: megaphone, color: pink]', note: 'A colour applies to the whole branch' },
  { label: 'Link to a note', code: 'Research [link: User interviews]' },
  { label: 'Title', code: 'title Product Launch' },
]

const SECTIONS: Record<DiagramType, { title: string; entries: Entry[] }> = {
  mindmap: { title: 'Mind Map', entries: MIND },
  erd: { title: 'Entity Relationship', entries: ERD },
  flowchart: { title: 'Flowchart', entries: FLOW },
  cloud: { title: 'Cloud Architecture', entries: FLOW },
  sequence: { title: 'Sequence', entries: SEQ },
}

export function SyntaxHelp({ type, onClose }: { type: DiagramType; onClose: () => void }) {
  const { title, entries } = SECTIONS[type]
  const [copied, setCopied] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = (i: number, code: string) => {
    navigator.clipboard?.writeText(code)
    setCopied(i)
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 1200)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="syntax-help" role="dialog" aria-label="Syntax help">
        <div className="syntax-head">
          <div>
            <h3>Syntax Help</h3>
            <span className="muted">{title}</span>
          </div>
          <button className="btn" onClick={onClose}>
            Close <kbd>Esc</kbd>
          </button>
        </div>
        <div className="syntax-cols">
          <span>Description</span>
          <span>Example</span>
        </div>
        <div className="syntax-list">
          {entries.map((e, i) => (
            <div key={i} className="syntax-row">
              <div className="syntax-label">
                {e.label}
                {e.note && <div className="syntax-note">{e.note}</div>}
              </div>
              <div className="syntax-code">
                <pre>{e.code}</pre>
                <button className="icon-btn tiny" title="Copy" onClick={() => copy(i, e.code)}>
                  {copied === i ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
