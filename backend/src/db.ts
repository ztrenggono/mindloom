import pg from 'pg'
import type { SyncRequest, Tombstone, VaultFile, VaultSnapshot } from './types.ts'

/** The one database call the store needs, so tests can swap in an in-memory Postgres. */
export type Query = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>

export interface Db {
  query: Query
  /** Runs `fn` inside a transaction. */
  tx<T>(fn: (q: Query) => Promise<T>): Promise<T>
}

export function pgDb(url: string): Db & { close(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: url })
  const query: Query = (text, params) => pool.query(text, params) as Promise<never>
  return {
    query,
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const out = await fn((text, params) => client.query(text, params) as Promise<never>)
        await client.query('COMMIT')
        return out
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

export async function migrate(q: Query) {
  await q(`
    CREATE TABLE IF NOT EXISTS files (
      id         text PRIMARY KEY,
      title      text NOT NULL DEFAULT '',
      folder     text NOT NULL DEFAULT '',
      data       jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at bigint NOT NULL,
      deleted    boolean NOT NULL DEFAULT false
    )`)
  await q(`
    CREATE TABLE IF NOT EXISTS meta (
      key        text PRIMARY KEY,
      value      jsonb NOT NULL,
      updated_at bigint NOT NULL
    )`)
  // The live vault (see collab.ts): Yjs updates in order, merged into one row now and then.
  await q(`
    CREATE TABLE IF NOT EXISTS doc_updates (
      id   bigserial PRIMARY KEY,
      data bytea NOT NULL
    )`)
}

/**
 * Before live collaboration, browsers synced whole files through POST /api/sync, stored in
 * `files` and `meta`. Those tables are now read only, by GET /api/vault, so a browser can move
 * an older vault into the live document once. `sync` stays for that history and the tests.
 *
 * Applies a client's changes with last-write-wins per file (by `updatedAt`), then
 * returns the full vault so the client can pull edits made on other devices.
 */
export async function sync(db: Db, req: SyncRequest): Promise<VaultSnapshot> {
  return db.tx(async (q) => {
    for (const f of req.upserts ?? []) {
      await q(
        `INSERT INTO files (id, title, folder, data, updated_at, deleted)
         VALUES ($1, $2, $3, $4, $5, false)
         ON CONFLICT (id) DO UPDATE
           SET title = EXCLUDED.title, folder = EXCLUDED.folder, data = EXCLUDED.data,
               updated_at = EXCLUDED.updated_at, deleted = false
         WHERE files.updated_at <= EXCLUDED.updated_at`,
        [f.id, f.title ?? '', f.folder ?? '', JSON.stringify(f), f.updatedAt],
      )
    }
    for (const d of req.deletes ?? []) {
      await q(
        `INSERT INTO files (id, updated_at, deleted) VALUES ($1, $2, true)
         ON CONFLICT (id) DO UPDATE
           SET deleted = true, updated_at = EXCLUDED.updated_at, data = '{}'::jsonb
         WHERE files.updated_at <= EXCLUDED.updated_at`,
        [d.id, d.at],
      )
    }
    if (req.folders) {
      await q(
        `INSERT INTO meta (key, value, updated_at) VALUES ('folders', $1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
         WHERE meta.updated_at <= EXCLUDED.updated_at`,
        [JSON.stringify(req.folders.value), req.folders.at],
      )
    }
    return snapshot(q)
  })
}

export async function snapshot(q: Query): Promise<VaultSnapshot> {
  const { rows } = await q<{ id: string; data: VaultFile; updated_at: string; deleted: boolean }>(
    'SELECT id, data, updated_at, deleted FROM files',
  )
  const files: VaultFile[] = []
  const tombstones: Tombstone[] = []
  // bigint comes back as a string from node-postgres.
  for (const r of rows) r.deleted ? tombstones.push({ id: r.id, at: Number(r.updated_at) }) : files.push(r.data)
  const meta = await q<{ value: string[]; updated_at: string }>(`SELECT value, updated_at FROM meta WHERE key = 'folders'`)
  const m = meta.rows[0]
  return { files, tombstones, folders: m ? { value: m.value, at: Number(m.updated_at) } : null }
}
