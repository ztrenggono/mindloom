/**
 * The browser end of live collaboration (protocol in backend/src/collab.ts): keeps one
 * WebSocket to /api/collab open, syncs a Y.Doc and presence through it, and reconnects
 * with backoff. Offline edits stay in the doc and go out in the sync after reconnecting.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import type * as Y from 'yjs'

const MSG = { sync: 0, awareness: 1, auth: 2, ack: 3 } as const
const CLOSE_UNAUTHORIZED = 4401
const MIN_RETRY_MS = 1000
const MAX_RETRY_MS = 15_000

/** `pending`: connected, with edits the server has not confirmed storing yet. */
export type RemoteStatus = 'syncing' | 'synced' | 'pending' | 'offline' | 'unauthorized'

interface Options {
  token: string
  onStatus: (s: RemoteStatus) => void
  /** After each (re)connect, once the server's copy has been merged in. */
  onSynced: () => void
}

export class CollabClient {
  readonly awareness: awarenessProtocol.Awareness
  private ws: WebSocket | null = null
  private sent = 0
  private acked = 0
  private synced = false
  private retryMs = MIN_RETRY_MS
  private retryTimer: number | undefined
  private stopped = false
  private token: string
  private readonly opts: Options
  private readonly doc: Y.Doc

  constructor(doc: Y.Doc, opts: Options) {
    this.doc = doc
    this.opts = opts
    this.token = opts.token
    this.awareness = new awarenessProtocol.Awareness(doc)
    doc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    window.addEventListener('online', this.reconnect)
    this.connect()
  }

  /** True while the server has every local edit, or will after the pending ACKs. */
  get connected() {
    return this.synced && this.ws?.readyState === WebSocket.OPEN
  }

  setToken(token: string) {
    this.token = token
    this.reconnect()
  }

  /** Drops the current socket, if any, and connects again now. */
  reconnect = () => {
    if (this.stopped) return
    window.clearTimeout(this.retryTimer)
    this.retryMs = MIN_RETRY_MS
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.connect()
  }

  destroy() {
    this.stopped = true
    window.clearTimeout(this.retryTimer)
    window.removeEventListener('online', this.reconnect)
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'local')
    this.ws?.close()
    this.ws = null
    this.awareness.destroy()
  }

  private connect() {
    this.opts.onStatus(this.synced ? 'pending' : 'syncing')
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/collab`)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.sent = this.acked = 0
    this.synced = false

    ws.onopen = () => {
      this.send(MSG.auth, (e) => encoding.writeVarString(e, this.token))
      this.send(MSG.sync, (e) => syncProtocol.writeSyncStep1(e, this.doc))
      if (this.awareness.getLocalState()) {
        this.send(MSG.awareness, (e) => encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID])))
      }
    }
    ws.onmessage = (ev) => {
      if (ws !== this.ws) return
      const dec = decoding.createDecoder(new Uint8Array(ev.data as ArrayBuffer))
      const type = decoding.readVarUint(dec)
      if (type === MSG.ack) {
        this.acked++
        this.report()
      } else if (type === MSG.awareness) {
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), this)
      } else if (type === MSG.sync) {
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MSG.sync)
        const kind = syncProtocol.readSyncMessage(dec, enc, this.doc, this)
        if (encoding.length(enc) > 1) this.raw(encoding.toUint8Array(enc), true)
        if (kind === syncProtocol.messageYjsSyncStep2 && !this.synced) {
          this.synced = true
          this.retryMs = MIN_RETRY_MS
          this.opts.onSynced()
          this.report()
        }
      }
    }
    ws.onclose = (ev) => {
      if (ws !== this.ws) return
      this.ws = null
      this.synced = false
      // Others' cursors are stale once we stop hearing about them.
      const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID)
      awarenessProtocol.removeAwarenessStates(this.awareness, others, this)
      if (ev.code === CLOSE_UNAUTHORIZED) return this.opts.onStatus('unauthorized')
      this.opts.onStatus('offline')
      if (this.stopped) return
      this.retryTimer = window.setTimeout(() => this.connect(), this.retryMs)
      this.retryMs = Math.min(MAX_RETRY_MS, this.retryMs * 2)
    }
  }

  private report() {
    if (this.synced) this.opts.onStatus(this.acked >= this.sent ? 'synced' : 'pending')
  }

  private raw(data: Uint8Array, isSync: boolean) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(data)
    if (isSync) this.sent++
  }

  private send(type: number, write: (e: encoding.Encoder) => void) {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, type)
    write(enc)
    this.raw(encoding.toUint8Array(enc), type === MSG.sync)
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Before the first sync, the sync exchange itself carries local edits.
    if (origin === this || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.send(MSG.sync, (e) => syncProtocol.writeUpdate(e, update))
    this.report()
  }

  private onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === this) return
    const ids = [...added, ...updated, ...removed]
    this.send(MSG.awareness, (e) => encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids)))
  }
}
