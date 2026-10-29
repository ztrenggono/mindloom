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
Before exposing the app beyond your machine, also set `API_TOKEN` there (for example
`openssl rand -hex 32`). Without it, anyone who can reach the server can read and change the vault.
Each browser asks for the token once, from the status bar.

### HTTPS on a shared server

Over plain `http://` the token crosses the network unencrypted. To serve the app over HTTPS,
uncomment the HTTPS block in `infra/.env` and run `docker compose up -d`. This starts
[Caddy](https://caddyserver.com) on ports 80 and 443 in front of the app:

```bash
COMPOSE_PROFILES=https
DOMAIN=mindloom.office.lan   # the hostname or IP address people type in the browser
TLS=internal                 # or your email, for Let's Encrypt on a public domain
WEB_PORT=127.0.0.1:8080      # plain HTTP only from the server itself
```

- **Office network (`TLS=internal`):** Caddy issues the certificate from its own certificate
  authority, so browsers warn until each computer trusts that authority once. Copy the root
  certificate off the server, then install it on each computer: on macOS, double-click it, add it to
  the System keychain and set it to Always Trust; on Windows, import it into "Trusted Root
  Certification Authorities".

  ```bash
  docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt mindloom-root.crt
  ```

  The authority lives in the `caddy_data` volume. Keep that volume, or every computer has to
  trust a new certificate.
- **Public domain (`TLS=you@example.com`):** point the domain's DNS at the server and open ports 80
  and 443 to the internet. Caddy gets and renews a Let's Encrypt certificate by itself.

`DOMAIN` has to match what people type: open `https://mindloom.office.lan`, not the server's IP,
unless `DOMAIN` is that IP. Plain `http://` requests are redirected to HTTPS.

## Development

Hot-reload setup, checks and the project layout are in [docs/development.md](docs/development.md).
Feature overview: [docs/features.md](docs/features.md). Backend API: [backend/README.md](backend/README.md).

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
