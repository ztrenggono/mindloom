import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { snapshot, sync, type Db } from './db.ts'
import type { SyncRequest } from './types.ts'

/** With a `token`, every route except /health needs `Authorization: Bearer <token>`. */
export function createApp(db: Db, origins: string[] = [], token?: string) {
  const app = new Hono().basePath('/api')
  if (origins.length) app.use('*', cors({ origin: origins }))

  // Before the auth check, so container health checks need no token.
  app.get('/health', async (c) => {
    await db.query('SELECT 1')
    return c.json({ ok: true })
  })

  if (token) app.use('*', bearerAuth({ token, noAuthenticationHeaderMessage: { error: 'Missing token' }, invalidTokenMessage: { error: 'Invalid token' } }))

  app.get('/vault', async (c) => c.json(await snapshot(db.query)))

  app.post('/sync', async (c) => {
    const body = await c.req.json<SyncRequest>().catch(() => null)
    const error = validate(body)
    if (error) return c.json({ error }, 400)
    return c.json(await sync(db, body!))
  })

  app.onError((err, c) => {
    // Auth failures (401) and other deliberate HTTP errors keep their status.
    if (err instanceof HTTPException) return err.getResponse()
    console.error(err)
    return c.json({ error: 'Internal error' }, 500)
  })

  return app
}

function validate(b: SyncRequest | null): string | null {
  if (!b || typeof b !== 'object') return 'Body must be a JSON object'
  for (const f of b.upserts ?? []) {
    if (typeof f?.id !== 'string' || typeof f.updatedAt !== 'number') return 'Each upsert needs a string id and numeric updatedAt'
  }
  for (const d of b.deletes ?? []) {
    if (typeof d?.id !== 'string' || typeof d.at !== 'number') return 'Each delete needs a string id and numeric at'
  }
  if (b.folders && (!Array.isArray(b.folders.value) || typeof b.folders.at !== 'number')) return 'folders needs a value array and numeric at'
  return null
}
