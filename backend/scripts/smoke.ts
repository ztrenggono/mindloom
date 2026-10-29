/** Exercises the API against an in-memory Postgres (PGlite), so it runs without Docker. */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { PGlite } from '@electric-sql/pglite'
import { serve } from '@hono/node-server'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import { createApp } from '../src/app.ts'
import { CLOSE_UNAUTHORIZED, createCollab, MSG, PATH } from '../src/collab.ts'
import { migrate, sync, type Db, type Query } from '../src/db.ts'

const pg = new PGlite()
const query: Query = (text, params) => pg.query(text, params) as never
const db: Db = { query, tx: (fn) => pg.transaction((t) => fn((text, params) => t.query(text, params) as never)) }
await migrate(query)
const app = createApp(db)

assert.equal((await app.request('/api/health')).status, 200)

// --- The vault from before live collaboration, still merged last-write-wins and readable once.
const file = (id: string, title: string, updatedAt: number) => ({ id, title, folder: 'Notes', doc: `# ${title}`, updatedAt })
await sync(db, { upserts: [file('a', 'First', 100), file('b', 'Second', 100)], folders: { value: ['Notes'], at: 100 } })
await sync(db, { upserts: [file('a', 'Stale', 50)] })
await sync(db, { deletes: [{ id: 'b', at: 300 }] })
await sync(db, { upserts: [file('b', 'Revived?', 250)] })
const vault = (await (await app.request('/api/vault')).json()) as any
assert.deepEqual(vault.files.map((f: any) => f.title), ['First'])
assert.deepEqual(vault.tombstones, [{ id: 'b', at: 300 }])
assert.deepEqual(vault.folders, { value: ['Notes'], at: 100 })

// Old tabs posting whole files are told to reload instead of writing where nobody reads.
const old = await app.request('/api/sync', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
assert.equal(old.status, 410)

// --- With API_TOKEN set, everything but /health needs the bearer token.
const locked = createApp(db, [], 's3cret-token')
const call = (path: string, auth?: string) => locked.request(`/api${path}`, { headers: auth ? { authorization: auth } : {} })
assert.equal((await call('/health')).status, 200)
assert.equal((await call('/vault')).status, 401)
assert.deepEqual(await (await call('/vault', 'Bearer wrong-token')).json(), { error: 'Invalid token' })
assert.equal((await call('/vault', 'Bearer s3cret-token')).status, 200)

// --- Live collaboration over a real WebSocket.
async function start(token?: string) {
  const collab = await createCollab(db, token)
  const server = await new Promise<Server>((resolve) => {
    const s = serve({ fetch: createApp(db, [], token).fetch, port: 0 }, () => resolve(s as Server)) as Server
  })
  collab.attach(server)
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}${PATH}`
  const stop = async () => {
    collab.close()
    await collab.flush()
    await new Promise((r) => server.close(r))
  }
  return { collab, url, stop }
}

/** A minimal browser stand-in: its own Y.Doc, synced through the server. */
function client(url: string, token = '') {
  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  let acks = 0
  let sent = 0
  const send = (type: number, write: (e: encoding.Encoder) => void) => {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, type)
    write(enc)
    ws.send(encoding.toUint8Array(enc))
    if (type === MSG.sync) sent++
  }
  const synced = new Promise<void>((resolve) => {
    ws.addEventListener('message', (ev) => {
      const dec = decoding.createDecoder(new Uint8Array(ev.data as ArrayBuffer))
      const type = decoding.readVarUint(dec)
      if (type === MSG.ack) acks++
      if (type === MSG.awareness) awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(dec), 'remote')
      if (type !== MSG.sync) return
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG.sync)
      const kind = syncProtocol.readSyncMessage(dec, enc, doc, 'remote')
      if (encoding.length(enc) > 1) (ws.send(encoding.toUint8Array(enc)), sent++)
      if (kind === syncProtocol.messageYjsSyncStep2) resolve()
    })
  })
  const closed = new Promise<number>((resolve) => ws.addEventListener('close', (ev) => resolve(ev.code)))
  ws.addEventListener('open', () => {
    send(MSG.auth, (e) => encoding.writeVarString(e, token))
    send(MSG.sync, (e) => syncProtocol.writeSyncStep1(e, doc))
  })
  doc.on('update', (u: Uint8Array, origin: unknown) => origin !== 'remote' && ws.readyState === ws.OPEN && send(MSG.sync, (e) => syncProtocol.writeUpdate(e, u)))
  awareness.on('update', ({ added, updated }: { added: number[]; updated: number[] }, origin: unknown) => {
    if (origin === 'local') send(MSG.awareness, (e) => encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(awareness, [...added, ...updated])))
  })
  return { doc, awareness, ws, synced, closed, settled: () => until(() => acks >= sent) }
}

async function until(ok: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out waiting for sync')
    await new Promise((r) => setTimeout(r, 10))
  }
}

{
  const live = await start()
  const a = client(live.url)
  const b = client(live.url)
  await Promise.all([a.synced, b.synced])

  // An edit on one client reaches the other.
  a.doc.getText('t').insert(0, 'hello')
  await until(() => b.doc.getText('t').toString() === 'hello')

  // Edits made at the same time merge instead of one replacing the other.
  a.doc.getText('t').insert(5, ' from a')
  b.doc.getText('t').insert(0, 'b says: ')
  await until(() => a.doc.getText('t').toString() === b.doc.getText('t').toString() && a.doc.getText('t').length > 15)
  assert.equal(a.doc.getText('t').toString(), 'b says: hello from a')

  // Presence: one client's awareness state reaches the other and goes away when it disconnects.
  a.awareness.setLocalStateField('user', { name: 'Ana' })
  await until(() => [...b.awareness.getStates().values()].some((s) => s.user?.name === 'Ana'))
  await Promise.all([a.settled(), b.settled()])
  a.ws.close()
  await until(() => ![...b.awareness.getStates().values()].some((s) => s.user?.name === 'Ana'))
  b.ws.close()
  await live.stop()

  // The document survives a restart, including after updates are merged into one row.
  const again = await start()
  assert.equal(again.collab.doc.getText('t').toString(), 'b says: hello from a')
  const c = client(again.url)
  await c.synced
  assert.equal(c.doc.getText('t').toString(), 'b says: hello from a')
  for (let i = 0; i < 520; i++) c.doc.getText('t').insert(0, '.')
  await c.settled()
  const { rows } = await query<{ n: number }>('SELECT count(*)::int AS n FROM doc_updates')
  assert.ok(rows[0].n < 100, `expected compaction, found ${rows[0].n} rows`)
  c.ws.close()
  await again.stop()
  const third = await start()
  assert.equal(third.collab.doc.getText('t').length, 520 + 'b says: hello from a'.length)
  await third.stop()
}

{
  // With API_TOKEN set, the socket needs the token first.
  const live = await start('s3cret-token')
  assert.equal(await client(live.url, 'wrong').closed, CLOSE_UNAUTHORIZED)
  const ok = client(live.url, 's3cret-token')
  await ok.synced
  ok.ws.close()
  await live.stop()
}

console.log('smoke: all checks passed')
// Node's built-in WebSocket client can keep the event loop alive after every socket closed.
process.exit(0)
