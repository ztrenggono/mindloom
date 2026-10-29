# Mindloom backend

Live sync for the Mindloom frontend (`../frontend`). The whole vault (notes, diagrams,
whiteboards) is one [Yjs](https://yjs.dev) document: browsers edit their own copy, offline too,
and exchange changes with this server over a WebSocket. The server merges them, passes them on to
everyone else connected, and stores them in PostgreSQL.

Stack: Node 22.18+ (runs TypeScript directly), [Hono](https://hono.dev), `pg`, `ws`, `yjs`.

## Run

```bash
cp .env.example .env
npm install
npm run db:up      # PostgreSQL 16 in Docker on :5432 (infra/docker-compose.dev.yml)
npm run dev        # API on http://localhost:8787/api
```

The Vite dev server proxies `/api`, WebSocket included, to `http://localhost:8787`, so open the
frontend as usual. Open it in two browsers (or a normal and a private window) to see edits and
cursors arrive live.

## API

| Method | Path          | What it does |
|--------|---------------|--------------|
| GET    | `/api/health` | Checks the database connection. |
| WS     | `/api/collab` | The live vault: Yjs sync, presence and ACK messages (protocol in `src/collab.ts`). |
| GET    | `/api/vault`  | The vault from before live sync (whole files, tombstones, folders), read once by browsers to move it into the live document. |
| POST   | `/api/sync`   | Retired: answers 410 so a tab still running an older app shows offline and keeps its edits until reloaded. |

When `API_TOKEN` is set, every HTTP route except `/api/health` needs `Authorization: Bearer <token>`
and answers 401 without it. Browsers cannot set headers on a WebSocket, so the socket's first
message carries the token instead; a wrong one closes it with code 4401. The frontend asks for the
token (click "enter server token" in the status bar) and keeps it in that browser's localStorage.
With no `API_TOKEN` the API is open and logs a warning at startup.

### How edits merge

- **Text** (notes and diagram code) merges character by character. Two people typing in the same
  note, or someone coming back online after editing offline, keep all of their edits.
- **Whiteboard** elements keep the newest version of each element, the same rule Excalidraw uses.
- **Other fields** (title, folder, layout, pin) take the last write.
- **Deleting** a note only marks it. If someone edited it after the delete, for example while
  offline, the note stays, and they see a notice saying so.

After reconnecting, the app lists the notes where offline edits were merged with someone else's.
Open tabs and the theme stay in each browser and are not shared.

## Tables

- `doc_updates`: the live vault as Yjs updates in order, merged into one row every 500 updates.
- `files`, `meta`: the vault from before live sync. Read only, by `GET /api/vault`.

## Check

```bash
npm run typecheck
npm run smoke      # API tests against in-memory Postgres (PGlite), no Docker needed
```
