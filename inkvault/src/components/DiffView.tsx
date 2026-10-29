import { useMemo, useState } from 'react'
import { Camera, X } from 'lucide-react'
import type { Diagram, VaultFile } from '../types'
import { DiagramView } from '../dsl/DiagramView'
import { diffDiagrams } from '../dsl/diff'

interface Props {
  diagram: Diagram
  file: VaultFile
  files: Record<string, VaultFile>
  onUpsert: (d: Diagram) => void
  onClose: () => void
}

const SNAPSHOT = '__snapshot__'
const SIGN = { added: '+', removed: '−', changed: '~' } as const

/** Flowcharts and cloud diagrams share one syntax, so they can be compared with each other. */
const family = (t: Diagram['type']) => (t === 'cloud' ? 'flowchart' : t)

function ago(at: number) {
  const s = Math.round((Date.now() - at) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(at).toLocaleDateString()
}

/** Before/after view of a diagram against its snapshot or another diagram of the same kind. */
export function DiffView({ diagram, file, files, onUpsert, onClose }: Props) {
  const others = useMemo(
    () =>
      Object.values(files)
        .flatMap((f) => f.diagrams.map((d) => ({ f, d })))
        .filter(({ d }) => d.id !== diagram.id && family(d.type) === family(diagram.type))
        .sort((a, b) => (a.f.id === file.id ? -1 : b.f.id === file.id ? 1 : a.f.title.localeCompare(b.f.title))),
    [files, diagram.id, diagram.type, file.id],
  )
  const [source, setSource] = useState(diagram.snapshot ? SNAPSHOT : (others[0]?.d.id ?? ''))
  const base = source === SNAPSHOT ? diagram.snapshot?.code : others.find((o) => o.d.id === source)?.d.code
  const result = useMemo(() => (base == null ? null : diffDiagrams(diagram.type, base, diagram.code)), [base, diagram.type, diagram.code])

  const snapshot = () => {
    onUpsert({ ...diagram, snapshot: { code: diagram.code, at: Date.now() } })
    setSource(SNAPSHOT)
  }
  const totals = result && (['added', 'removed', 'changed'] as const).map((k) => [k, result.changes.filter((c) => c.kind === k).length] as const)

  return (
    <div className="diff-view">
      <div className="diff-head">
        <strong>Compare</strong>
        <span className="muted">{diagram.title} with</span>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Compare against">
          {diagram.snapshot && <option value={SNAPSHOT}>Snapshot · {ago(diagram.snapshot.at)}</option>}
          {others.map(({ f, d }) => (
            <option key={d.id} value={d.id}>
              {f.id === file.id ? d.title : `${f.title} / ${d.title}`}
            </option>
          ))}
          {!diagram.snapshot && !others.length && <option value="">Nothing to compare yet</option>}
        </select>
        <button className="btn" title="Save the current code as the baseline" onClick={snapshot}>
          <Camera size={14} /> {diagram.snapshot ? 'Update snapshot' : 'Save snapshot'}
        </button>
        <div className="spacer" />
        <button className="icon-btn" title="Close compare" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      {result && base != null ? (
        <div className="diff-body">
          <div className="diff-summary">
            <div className="totals">
              {totals!.map(([k, n]) => (
                <span key={k} className={'c-' + k}>
                  {SIGN[k]}
                  {n}
                </span>
              ))}
            </div>
            {result.changes.length === 0 && <div className="diff-change muted">No changes</div>}
            {result.changes.map((c, i) => (
              <div key={i} className="diff-change">
                <span className={'sign c-' + c.kind}>{SIGN[c.kind]}</span>
                <div>
                  <div>{c.what}</div>
                  {c.detail && <div className="detail">{c.detail}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="diff-panes">
            <div className="diff-pane">
              <span className="diff-pane-label">Before</span>
              <DiagramView type={diagram.type} code={base} title={diagram.title} marks={result.before} compact />
            </div>
            <div className="diff-pane">
              <span className="diff-pane-label">After</span>
              <DiagramView type={diagram.type} code={diagram.code} title={diagram.title} marks={result.after} compact />
            </div>
          </div>
        </div>
      ) : (
        <div className="diff-empty">
          <div>Save a snapshot, then edit the diagram to see what changed.</div>
          <div>
            <button className="btn" onClick={snapshot}>
              <Camera size={14} /> Save snapshot
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
