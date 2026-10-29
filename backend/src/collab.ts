/**
 * Live collaboration: one shared Yjs document holds the whole vault. Browsers connect over a
 * WebSocket at /api/collab, exchange Yjs sync and awareness (who is online, where their cursor is)
 * messages, and the server merges, relays and stores every update. The server never reads the
 * vault's contents; the schema lives in frontend/src/lib/vaultDoc.ts.
 *
 * Messages are binary, starting with a varUint type:
 *   0 SYNC       y-protocols sync message (step 1, step 2 or update), both ways
 *   1 AWARENESS  y-protocols awareness update, both ways
 *   2 AUTH       client → server, varString token; must come first when API_TOKEN is set
 *   3 ACK        server → client, one per SYNC message once its changes are stored
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import type { Db } from './db.ts'

export const MSG = { sync: 0, awareness: 1, auth: 2, ack: 3 } as const
export const PATH = '/api/collab'
/** Close codes the client acts on: a bad token stops retrying until a new one is entered. */
export const CLOSE_UNAUTHORIZED = 4401

/** Stored updates are merged into one row after this many. */
const COMPACT_AFTER = 500
const PING_MS = 30_000
/** Matches nginx's client_max_body_size, since whiteboard images travel inside updates. */
const MAX_MESSAGE = 50 * 1024 * 1024

interface Conn {
  authed: boolean
  alive: boolean
  /** Awareness client ids this connection controls, removed when it closes. */
  ids: Set<number>
}

export interface Collab {
  doc: Y.Doc
  /** Routes WebSocket upgrades for /api/collab on `server`; other upgrade paths are refused. */
  attach(server: Server): void
  /** Resolves once every received update is stored. */
  flush(): Promise<void>
  close(): void
}

export async function createCollab(db: Db, token?: string): Promise<Collab> {
  const doc = new Y.Doc()
  const { rows } = await db.query<{ data: Uint8Array }>('SELECT data FROM doc_updates ORDER BY id')
  Y.transact(doc, () => rows.forEach((r) => Y.applyUpdate(doc, r.data)), 'load')
  let stored = rows.length

  const awareness = new awarenessProtocol.Awareness(doc)
  awareness.setLocalState(null)
  const conns = new Map<WebSocket, Conn>()
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE })

  // Writes run one after another, so ACKs go out in order and only once their update is stored.
  let chain = Promise.resolve()
  const queue = (fn: () => Promise<unknown>) => {
    chain = chain.then(fn).then(
      () => undefined,
      (e) => console.error('collab: storing an update failed', e),
    )
  }

  const send = (ws: WebSocket, data: Uint8Array) => {
    if (ws.readyState === ws.OPEN) ws.send(data, (err) => err && ws.terminate())
  }
  const broadcast = (data: Uint8Array, except?: unknown) => {
    for (const [ws, c] of conns) if (c.authed && ws !== except) send(ws, data)
  }

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'load') return
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MSG.sync)
    syncProtocol.writeUpdate(enc, update)
    broadcast(encoding.toUint8Array(enc), origin)
    queue(async () => {
      await db.query('INSERT INTO doc_updates (data) VALUES ($1)', [Buffer.from(update)])
      if (++stored >= COMPACT_AFTER) await compact()
    })
  })

  /** Replaces the stored rows with one merged state. */
  const compact = () =>
    db.tx(async (q) => {
      const { rows: [last] } = await q<{ id: string }>('SELECT max(id) AS id FROM doc_updates')
      await q('DELETE FROM doc_updates WHERE id <= $1', [last.id])
      await q('INSERT INTO doc_updates (data) VALUES ($1)', [Buffer.from(Y.encodeStateAsUpdate(doc))])
      stored = 1
    })

  awareness.on('update', ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    const changed = [...added, ...updated, ...removed]
    const conn = conns.get(origin as WebSocket)
    if (conn) {
      added.forEach((id) => conn.ids.add(id))
      removed.forEach((id) => conn.ids.delete(id))
    }
    broadcast(awarenessMessage(awareness, changed))
  })

  const welcome = (ws: WebSocket) => {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MSG.sync)
    syncProtocol.writeSyncStep1(enc, doc)
    send(ws, encoding.toUint8Array(enc))
    const states = [...awareness.getStates().keys()]
    if (states.length) send(ws, awarenessMessage(awareness, states))
  }

  const onMessage = (ws: WebSocket, conn: Conn, data: Uint8Array) => {
    const dec = decoding.createDecoder(data)
    const type = decoding.readVarUint(dec)
    if (!conn.authed) {
      if (type !== MSG.auth) return ws.close(CLOSE_UNAUTHORIZED, 'Missing token')
      if (!sameToken(decoding.readVarString(dec), token!)) return ws.close(CLOSE_UNAUTHORIZED, 'Invalid token')
      conn.authed = true
      return welcome(ws)
    }
    if (type === MSG.sync) {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG.sync)
      syncProtocol.readSyncMessage(dec, enc, doc, ws)
      if (encoding.length(enc) > 1) send(ws, encoding.toUint8Array(enc))
      // Queued after the update's own write, so the client hears back only once it is stored.
      queue(async () => send(ws, ack))
    } else if (type === MSG.awareness) {
      awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(dec), ws)
    }
    // AUTH from an already-trusted client (no API_TOKEN set) is ignored.
  }

  wss.on('connection', (ws: WebSocket) => {
    const conn: Conn = { authed: !token, alive: true, ids: new Set() }
    conns.set(ws, conn)
    if (conn.authed) welcome(ws)
    ws.on('pong', () => (conn.alive = true))
    ws.on('message', (raw: RawData) => {
      try {
        onMessage(ws, conn, toBytes(raw))
      } catch (e) {
        console.error('collab: bad message', e)
        ws.close(1003, 'Bad message')
      }
    })
    ws.on('close', () => {
      conns.delete(ws)
      awarenessProtocol.removeAwarenessStates(awareness, [...conn.ids], null)
    })
  })

  // Drops connections that stopped answering, e.g. a laptop that went to sleep.
  const ping = setInterval(() => {
    for (const [ws, c] of conns) {
      if (!c.alive) ws.terminate()
      else ((c.alive = false), ws.ping())
    }
  }, PING_MS)

  return {
    doc,
    attach(server) {
      server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (new URL(req.url ?? '/', 'http://x').pathname !== PATH) return socket.destroy()
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
      })
    },
    flush: () => chain,
    close() {
      clearInterval(ping)
      for (const ws of conns.keys()) ws.terminate()
      wss.close()
    },
  }
}

interface AwarenessChange {
  added: number[]
  updated: number[]
  removed: number[]
}

const ack = (() => {
  const enc = encoding.createEncoder()
  encoding.writeVarUint(enc, MSG.ack)
  return encoding.toUint8Array(enc)
})()

function awarenessMessage(awareness: awarenessProtocol.Awareness, ids: number[]) {
  const enc = encoding.createEncoder()
  encoding.writeVarUint(enc, MSG.awareness)
  encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, ids))
  return encoding.toUint8Array(enc)
}

function toBytes(raw: RawData): Uint8Array {
  if (Array.isArray(raw)) return new Uint8Array(Buffer.concat(raw))
  return raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
}

/** Compares hashes so the check takes the same time however much of the token matches. */
function sameToken(given: string, expected: string) {
  const h = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(h(given), h(expected))
}
