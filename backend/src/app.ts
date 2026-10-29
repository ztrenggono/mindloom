import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { snapshot, type Db } from './db.ts'

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

  // The vault from before live collaboration, which browsers import once (see collab.ts).
  app.get('/vault', async (c) => c.json(await snapshot(db.query)))

  // Edits now travel over /api/collab. A tab still running the old app gets told to reload,
  // and keeps its edits in the browser, where the new app picks them up.
  app.post('/sync', (c) => c.json({ error: 'This server syncs live now. Reload the page.' }, 410))

  app.onError((err, c) => {
    // Auth failures (401) and other deliberate HTTP errors keep their status.
    if (err instanceof HTTPException) return err.getResponse()
    console.error(err)
    return c.json({ error: 'Internal error' }, 500)
  })

  return app
}

