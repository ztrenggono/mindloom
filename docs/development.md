# Development

Run the three parts separately for hot reload:

```bash
# 1. Database (PostgreSQL in Docker, from infra/docker-compose.dev.yml)
cd backend && npm install && cp .env.example .env && npm run db:up

# 2. API on :8787 (in backend/)
npm run dev

# 3. Frontend on :5173
cd ../frontend && npm install && npm run dev
```

Vite proxies `/api` to `localhost:8787`. The frontend also works with no backend: it keeps
everything in the browser and shows "Saved locally, server offline".

## Checks

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npm run lint
cd backend && npm run typecheck && npm run smoke
```

## Project layout

```
frontend/   React + Vite app (diagram parsers and renderers in src/dsl, templates in src/templates.ts)
backend/    Sync API: Hono, node-postgres; see backend/README.md for the API
infra/      Docker Compose files: full stack (docker-compose.yml) and database only (docker-compose.dev.yml)
docs/       Documentation and sample diagrams
```

## Full stack with Docker

```bash
cd infra
cp .env.example .env   # optional; every setting has a default
docker compose up -d --build
```

## Moving from Inkvault

The app was renamed from Inkvault to Mindloom. The browser reads data from the old `inkvault`
IndexedDB as a fallback, so existing notes appear and are saved under the new name. A Docker
database created under the old name keeps its `inkvault` user and database; set
`POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` to `inkvault` in `infra/.env` to keep using it,
or start fresh with `docker compose down -v`. The volume is now named `mindloom_pgdata`.
