import { useState } from 'react'
import { Link2, ListTree, Network, Hash } from 'lucide-react'
import type { VaultFile } from '../types'
import { backlinks, extractHeadings, extractLinks, extractTags, findByTitle, unlinkedMentions } from '../lib/links'
import { GraphView } from './GraphView'

interface Props {
  file: VaultFile | null
  files: Record<string, VaultFile>
  onOpen: (id: string | null, title: string) => void
  onHeading: (line: number) => void
  onLinkMention: (sourceId: string) => void
  onTag: (t: string) => void
}

type Tab = 'outline' | 'backlinks' | 'local'

export function RightPanel({ file, files, onOpen, onHeading, onLinkMention, onTag }: Props) {
  const [tab, setTab] = useState<Tab>('backlinks')
  return (
    <div className="right-inner">
      <div className="nav-header">
        <button className={'icon-btn' + (tab === 'backlinks' ? ' on' : '')} title="Backlinks" onClick={() => setTab('backlinks')}>
          <Link2 size={16} />
        </button>
        <button className={'icon-btn' + (tab === 'outline' ? ' on' : '')} title="Outline" onClick={() => setTab('outline')}>
          <ListTree size={16} />
        </button>
        <button className={'icon-btn' + (tab === 'local' ? ' on' : '')} title="Local graph" onClick={() => setTab('local')}>
          <Network size={16} />
        </button>
      </div>
      {!file ? (
        <div className="empty small">No note open</div>
      ) : tab === 'outline' ? (
        <Outline file={file} onHeading={onHeading} />
      ) : tab === 'local' ? (
        <div className="local-graph">
          <GraphView files={files} focusId={file.id} activeId={file.id} onOpen={onOpen} compact />
        </div>
      ) : (
        <Links file={file} files={files} onOpen={onOpen} onLinkMention={onLinkMention} onTag={onTag} />
      )}
    </div>
  )
}

function Outline({ file, onHeading }: { file: VaultFile; onHeading: (line: number) => void }) {
  const hs = extractHeadings(file.doc)
  const min = Math.min(...hs.map((h) => h.level))
  return (
    <div className="panel-body">
      <div className="pane-title">Outline</div>
      {hs.length === 0 && <div className="empty small">No headings</div>}
      {hs.map((h, i) => (
        <div key={i} className="outline-item" style={{ paddingLeft: 10 + (h.level - min) * 14 }} onClick={() => onHeading(h.line)}>
          {h.text}
        </div>
      ))}
      {file.diagrams.length > 0 && (
        <>
          <div className="pane-title">Diagrams</div>
          {file.diagrams.map((d) => (
            <div key={d.id} className="outline-item muted">
              {d.title} <span className="pill">{d.type}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function Links({ file, files, onOpen, onLinkMention, onTag }: Omit<Props, 'onHeading' | 'file'> & { file: VaultFile }) {
  const back = backlinks(files, file)
  const mentions = unlinkedMentions(files, file)
  const out = extractLinks(file.doc)
  const tags = extractTags(file.doc)
  const ctx = (f: VaultFile) => {
    const t = file.title.toLowerCase()
    return f.doc.split('\n').find((l) => l.toLowerCase().includes(t))?.trim() ?? ''
  }
  return (
    <div className="panel-body">
      <div className="pane-title">
        Linked mentions <span className="count">{back.length}</span>
      </div>
      {back.length === 0 && <div className="empty small">No backlinks found.</div>}
      {back.map((f) => (
        <div key={f.id} className="link-card" onClick={() => onOpen(f.id, f.title)}>
          <div className="title">{f.title}</div>
          <div className="snippet">{ctx(f).slice(0, 160)}</div>
        </div>
      ))}
      <div className="pane-title">
        Unlinked mentions <span className="count">{mentions.length}</span>
      </div>
      {mentions.map((f) => (
        <div key={f.id} className="link-card">
          <div className="title" onClick={() => onOpen(f.id, f.title)}>
            {f.title}
          </div>
          <div className="snippet">{ctx(f).slice(0, 160)}</div>
          <button className="btn small" onClick={() => onLinkMention(f.id)}>
            Link
          </button>
        </div>
      ))}
      <div className="pane-title">
        Outgoing links <span className="count">{out.length}</span>
      </div>
      {out.map((l) => {
        const t = findByTitle(files, l)
        return (
          <div key={l} className={'outline-item' + (t ? '' : ' unresolved')} onClick={() => onOpen(t?.id ?? null, l)}>
            {l}
          </div>
        )
      })}
      {tags.length > 0 && (
        <>
          <div className="pane-title">Tags</div>
          <div className="tag-row">
            {tags.map((t) => (
              <a key={t} className="tag" onClick={() => onTag(t)}>
                <Hash size={11} />
                {t}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
