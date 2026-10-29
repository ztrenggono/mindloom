# Mindloom

Linked notes, diagram-as-code and a whiteboard in one app. The writing side is inspired by
Obsidian and the diagram side by [Eraser](https://www.eraser.io): write ERD, flowchart, sequence or
cloud-architecture diagrams as code, see them drawn live, and keep them next to the notes that
explain them.

- **Diagrams as code**: ERD, flowchart, sequence and cloud architecture, using Eraser-compatible syntax.
  Click a row or shape on the canvas to jump to its line of code. Syntax highlighting, syntax help and
  120+ tech logos (`icon: postgresql`, `icon: aws-s3`, `icon: k8s`).
- **45 templates** from real systems, in 8 categories: database design, API and auth flows, cloud
  architecture, DevOps, product processes, AI and data, security, and mobile.
- **Whiteboard** (Excalidraw) with icon and image upload.
- **Notes**: folders, `[[wikilinks]]`, backlinks, graph view, tags, outline, command palette.
- **Works offline**: edits save in the browser (IndexedDB) first and sync to PostgreSQL when the
  server is reachable. Several browsers can share one vault.

## Quick start with Docker

You need Docker with Compose v2.

```bash
git clone <your-fork-url> mindloom
cd mindloom/infra
docker compose up -d --build
```

Open http://localhost:8080. The first start builds the images, so it takes a few minutes.

| Service   | What it runs                                  | Exposed            |
|-----------|-----------------------------------------------|--------------------|
| `web`     | The built app on nginx, proxying `/api`       | `localhost:8080`   |
| `backend` | Sync API (Node + Hono)                        | Only inside Docker |
| `db`      | PostgreSQL 16, data in the `pgdata` volume    | Only inside Docker |
| `caddy`   | HTTPS in front of `web` (optional, see below) | `:80`, `:443`      |

Useful commands:

```bash
docker compose logs -f backend   # follow the API log
docker compose down              # stop, keep data
docker compose down -v           # stop and delete all data
```

To change the port or database password, copy `infra/.env.example` to `infra/.env` and edit it.

**On a server other people can reach**, also set `API_TOKEN` and turn on HTTPS. Without them,
anyone on the network can read and change the vault. [docs/deployment.md](docs/deployment.md)
walks through it: the token, HTTPS with Caddy (office network or public domain), trusting the
certificate, backups and troubleshooting.

## Development

Hot-reload setup, checks and the project layout are in [docs/development.md](docs/development.md).
Feature overview: [docs/features.md](docs/features.md). Running on a shared server:
[docs/deployment.md](docs/deployment.md). Backend API: [backend/README.md](backend/README.md).

## Contributing

Issues and pull requests are welcome. For a new template, add an entry to
`frontend/src/templates.ts`; it has to parse without errors and use icon names that exist
(tech logos are listed in `frontend/src/dsl/logos.ts`).

## License

Copyright (C) 2026 Mindloom contributors

Mindloom is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed in the hope that it will be
useful, but WITHOUT ANY WARRANTY. See [LICENSE](LICENSE) for the full text.
