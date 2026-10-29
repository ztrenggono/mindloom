/** Exercises the API against an in-memory Postgres (PGlite), so it runs without Docker. */
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { createApp } from '../src/app.ts'
import { migrate, type Db, type Query } from '../src/db.ts'

const pg = new PGlite()
const query: Query = (text, params) => pg.query(text, params) as never
const db: Db = { query, tx: (fn) => pg.transaction((t) => fn((text, params) => t.query(text, params) as never)) }
await migrate(query)
const app = createApp(db)

const post = async (body: unknown) => {
  const res = await app.request('/api/sync', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  return { status: res.status, json: (await res.json()) as any }
}
const file = (id: string, title: string, updatedAt: number) => ({ id, title, folder: 'Notes', doc: `# ${title}`, updatedAt })

assert.equal((await app.request('/api/health')).status, 200)

let r = await post({ upserts: [file('a', 'First', 100), file('b', 'Second', 100)], folders: { value: ['Notes'], at: 100 } })
assert.equal(r.status, 200)
assert.equal(r.json.files.length, 2)
assert.deepEqual(r.json.folders, { value: ['Notes'], at: 100 })

// An older edit does not overwrite a newer one.
r = await post({ upserts: [file('a', 'Stale', 50)] })
assert.equal(r.json.files.find((f: any) => f.id === 'a').title, 'First')

r = await post({ upserts: [file('a', 'Newer', 200)] })
assert.equal(r.json.files.find((f: any) => f.id === 'a').title, 'Newer')

// A delete becomes a tombstone, and an edit made before the delete cannot revive the file.
r = await post({ deletes: [{ id: 'b', at: 300 }] })
assert.deepEqual(r.json.tombstones, [{ id: 'b', at: 300 }])
r = await post({ upserts: [file('b', 'Revived?', 250)] })
assert.equal(r.json.files.some((f: any) => f.id === 'b'), false)

assert.equal((await post({ upserts: [{ title: 'no id' }] })).status, 400)
assert.equal((await post('nope')).status, 400)

// With API_TOKEN set, everything but /health needs the bearer token.
const locked = createApp(db, [], 's3cret-token')
const call = (path: string, auth?: string, init: RequestInit = {}) =>
  locked.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) } })
assert.equal((await call('/health')).status, 200)
assert.equal((await call('/vault')).status, 401)
assert.equal((await call('/vault', 'Bearer wrong-token')).status, 401)
assert.deepEqual(await (await call('/vault', 'Bearer wrong-token')).json(), { error: 'Invalid token' })
assert.equal((await call('/sync', undefined, { method: 'POST', body: '{}' })).status, 401)
assert.equal((await call('/vault', 'Bearer s3cret-token')).status, 200)
assert.equal((await call('/sync', 'Bearer s3cret-token', { method: 'POST', body: '{}' })).status, 200)

console.log('smoke: all checks passed')
