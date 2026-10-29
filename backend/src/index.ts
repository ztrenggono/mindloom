import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
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

serve({ fetch: createApp(db, origins).fetch, port }, (info) => console.log(`Inkvault API on http://localhost:${info.port}/api`))
