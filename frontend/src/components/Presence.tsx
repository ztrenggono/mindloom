import { X } from 'lucide-react'
import type { MergeNotice, Vault } from '../store'

/** Your name as others see it, and who else has the vault open. Click your name to change it. */
export function Presence({ vault }: { vault: Vault }) {
  const { peers, me, setName } = vault
  const names = peers.map((p) => p.name)
  return (
    <span className="presence">
      <button
        className="link"
        data-tip="Your name next to your cursor. Click to change"
        onClick={() => {
          const n = window.prompt('Your name, shown to others editing with you', me)
          if (n?.trim()) setName(n)
        }}
      >
        {me}
      </button>
      {peers.length > 0 && <span title={names.join(', ')}>{peers.length === 1 ? `+ ${names[0]}` : `+ ${peers.length} others`}</span>}
    </span>
  )
}

/** After reconnecting: which notes got your offline edits merged with someone else's. */
export function MergeNoticeCard({ notice, onOpen, onClose }: { notice: MergeNotice; onOpen: (id: string) => void; onClose: () => void }) {
  const list = (items: MergeNotice['merged']) =>
    items.map((f) => (
      <button key={f.id} className="link" onClick={() => onOpen(f.id)}>
        {f.title}
      </button>
    ))
  return (
    <div className="merge-notice" role="status">
      <button className="icon-btn tiny close" aria-label="Dismiss" onClick={onClose}>
        <X size={13} />
      </button>
      {notice.merged.length > 0 && (
        <p>
          Back online. Your edits were merged with changes others made meanwhile in: {list(notice.merged)}
        </p>
      )}
      {notice.kept.length > 0 && (
        <p>
          Deleted by someone else, but kept because you edited them: {list(notice.kept)}
        </p>
      )}
    </div>
  )
}
