# Mindloom backend

Sync API for the Mindloom frontend (`../frontend`). It keeps the vault's notes, diagrams and
whiteboards in PostgreSQL. The frontend works offline from IndexedDB and syncs here when the API
is up.

Stack: Node 22.18+ (runs TypeScript directly), [Hono](https://hono.dev), `pg`.

## Run

```bash
cp .env.example .env
npm install
npm run db:up      # PostgreSQL 16 in Docker on :5432 (infra/docker-compose.dev.yml)
npm run dev        # API on http://localhost:8787/api
```

The Vite dev server proxies `/api` to `http://localhost:8787`, so open the frontend as usual.

## API

| Method | Path          | What it does |
|--------|---------------|--------------|
| GET    | `/api/health` | Checks the database connection. |
| GET    | `/api/vault`  | Returns every file, deletion tombstone and the folder list. |
| POST   | `/api/sync`   | Applies `{ upserts, deletes, folders }` and returns the same shape as `/api/vault`. |

When `API_TOKEN` is set, every route except `/api/health` needs `Authorization: Bearer <token>` and
answers 401 without it. The frontend asks for the token the first time it gets a 401 (click
"enter server token" in the status bar) and keeps it in that browser's localStorage. With no
`API_TOKEN` the API is open and logs a warning at startup.

Conflicts resolve per file by last write wins on `updatedAt`. A delete is kept as a tombstone, so
an older copy of the file on another device cannot bring it back. Open tabs and the theme stay in
each browser and are not synced.

## Tables

- `files`: `id`, `title`, `folder`, `data` (the whole file as `jsonb`), `updated_at`, `deleted`
- `meta`: key/value rows; `folders` holds the folder list

## Check

```bash
npm run typecheck
npm run smoke      # API tests against in-memory Postgres (PGlite), no Docker needed
```
