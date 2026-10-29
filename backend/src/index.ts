import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createCollab } from './collab.ts'
import { migrate, pgDb } from './db.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.')
  process.exit(1)
}

const db = pgDb(url)

// A fresh Postgres container restarts once after initialising, so the first connections can drop.
for (let attempt = 1; ; attempt++) {
  try {
    await migrate(db.query)
    break
  } catch (e) {
    if (attempt >= 30) throw e
    if (attempt === 1) console.log('Waiting for PostgreSQL...')
    await new Promise((r) => setTimeout(r, 1000))
  }
}

const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const port = Number(process.env.PORT ?? 8787)
const token = process.env.API_TOKEN?.trim() || undefined
if (!token) console.warn('API_TOKEN is not set: anyone who can reach this API can read and change the vault.')

const collab = await createCollab(db, token)
const server = serve({ fetch: createApp(db, origins, token).fetch, port }, (info) => console.log(`Mindloom API on http://localhost:${info.port}/api`))
collab.attach(server as Server)

// Stores updates still in flight before exiting, e.g. on `docker compose stop`.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, async () => {
    collab.close()
    await collab.flush()
    await db.close()
    process.exit(0)
  })
}
