import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from 'lucide-react'
import type { SaveStatus } from '../store'

interface Props {
  status: SaveStatus
  onRetry: () => void
  onExport: () => void
}

/** Where the latest edit is safe: in this browser, on the server, or nowhere yet. */
export function SaveIndicator({ status, onRetry, onExport }: Props) {
  if (status.local === 'error')
    return (
      <button className="save-state error" title={status.error} onClick={onExport}>
        <AlertTriangle size={13} /> Not saved in this browser. Export a backup
      </button>
    )
  if (status.local === 'loading')
    return (
      <span className="save-state">
        <Loader2 size={13} className="spin" /> Loading
      </span>
    )
  if (status.remote === 'offline')
    return (
      <button className="save-state warn" title="Edits are saved in this browser and will sync when the server is back" onClick={onRetry}>
        <CloudOff size={13} /> Saved locally, server offline
      </button>
    )
  if (status.local === 'saving' || status.remote === 'syncing' || status.remote === 'pending')
    return (
      <span className="save-state">
        <RefreshCw size={13} className="spin" /> Syncing
      </span>
    )
  return (
    <span className="save-state ok">
      <Check size={13} /> Saved
    </span>
  )
}
