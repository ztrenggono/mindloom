import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { snapshot, sync, type Db } from './db.ts'
import type { SyncRequest } from './types.ts'

export function createApp(db: Db, origins: string[] = []) {
  const app = new Hono().basePath('/api')
  if (origins.length) app.use('*', cors({ origin: origins }))

  app.get('/health', async (c) => {
    await db.query('SELECT 1')
    return c.json({ ok: true })
  })

  app.get('/vault', async (c) => c.json(await snapshot(db.query)))

  app.post('/sync', async (c) => {
    const body = await c.req.json<SyncRequest>().catch(() => null)
    const error = validate(body)
    if (error) return c.json({ error }, 400)
    return c.json(await sync(db, body!))
  })

  app.onError((err, c) => {
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
