import { useState } from 'react'
import { X } from 'lucide-react'
import type { CommentAnchor, CommentThread, VaultFile } from '../types'
import type { Vault } from '../store'
import './CommentsPanel.css'

export function CommentsPanel({ file, vault, draft, onCancelDraft, onClose, onJump }: {
  file: VaultFile; vault: Vault; draft: CommentAnchor | null
  onCancelDraft: () => void; onClose: () => void; onJump: (anchor: CommentAnchor) => void
}) {
  const [body, setBody] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const threads = (file.comments ?? []).filter((t) => showResolved || !t.resolved)
  return <aside className="comments-panel" aria-label="Comments">
    <div className="comments-heading"><strong>Comments</strong><button className="icon-btn" aria-label="Close comments" onClick={onClose}><X size={16} /></button></div>
    <label className="comments-filter"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Include resolved</label>
    {draft && <form className="comment-card" onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; vault.addComment(file.id, draft, body); setBody(''); onCancelDraft() }}>
      <blockquote>{draft.quote}</blockquote>
      <textarea autoFocus aria-label="New comment" placeholder="Write a comment…" value={body} onChange={(e) => setBody(e.target.value)} required />
      <div className="comment-actions"><button className="btn" type="submit" disabled={!body.trim()}>Post comment</button><button className="btn" type="button" onClick={() => { setBody(''); onCancelDraft() }}>Cancel</button></div>
    </form>}
    {!draft && threads.length === 0 && <p className="muted">No {showResolved ? '' : 'open '}comments. Select text in a note or an object in a diagram, then choose Comment.</p>}
    {threads.map((thread) => <Thread key={thread.id} thread={thread} onJump={() => onJump(thread.anchor)} onResolve={() => vault.resolveComment(file.id, thread.id, !thread.resolved)} onReply={(body) => vault.replyComment(file.id, thread.id, body)} />)}
  </aside>
}

function Thread({ thread, onJump, onResolve, onReply }: { thread: CommentThread; onJump: () => void; onResolve: () => void; onReply: (body: string) => void }) {
  const [reply, setReply] = useState('')
  return <article className="comment-card">
    <button className="comment-anchor" disabled={thread.anchor.missing} onClick={onJump} title="Go to commented section">{thread.anchor.quote}</button>
    {thread.anchor.missing && <div className="muted">Original section was removed.</div>}
    {[thread, ...thread.replies].map((message) => <div className="comment-message" key={message.id}>
      <strong>{message.author}</strong> <time className="muted" dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleString()}</time>
      <p>{message.body}</p>
    </div>)}
    <button className="btn" onClick={onResolve}>{thread.resolved ? 'Reopen' : 'Resolve'}</button>
    {!thread.resolved && <form onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { onReply(reply); setReply('') } }}>
      <textarea aria-label={`Reply to ${thread.author}`} placeholder="Reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
      <button className="btn" type="submit" disabled={!reply.trim()}>Reply</button>
    </form>}
  </article>
}
