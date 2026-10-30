# Mindloom

Linked notes, diagram-as-code and a whiteboard in one app. The writing side is inspired by
Obsidian and the diagram side by [Eraser](https://www.eraser.io): write ERD, flowchart, sequence,
cloud-architecture or mind-map diagrams as code, see them drawn live, and keep them next to the notes that
explain them.

## Features

**Write and draw**

- **Notes** with folders, `[[wikilinks]]` (autocomplete; clicking a link to a missing note creates
  it), backlinks and unlinked mentions, tags, an outline, and a global and local graph view.
- **Diagrams as code**: ERD, flowchart, sequence, cloud architecture and mind map, in
  Eraser-compatible syntax. The diagram redraws as you type; click a row or shape to jump to its
  line. Syntax highlighting, a problems list, syntax help and 120+ tech logos
  (`icon: postgresql`, `icon: aws-s3`, `icon: k8s`).
- **57 templates** from real systems, in 8 categories: database design, API and auth flows, cloud
  architecture, DevOps, product processes, AI and data, security, and mobile.
- **Whiteboard** (Excalidraw) for free drawing, with icon and image upload.
- **Three layouts per note**: Document, Document + Canvas, or Canvas only.
- **Compare versions** of a diagram against a saved snapshot, and present a diagram step by step.

**Find, move and share**

- **Full-text search** across notes and diagram code: `"exact phrase"`, `#tag`, `folder:Database`,
  `in:notes` / `in:diagrams`. Each result jumps to its line.
- **Mermaid in and out**: copy any diagram as Mermaid for GitHub, GitLab or Notion; import
  Mermaid flowcharts, sequence diagrams, ER diagrams and mind maps.
- **Share links** that open a note, or one of its diagrams, for anyone on the same server.
- **Export**: a note as Markdown, a diagram as SVG or PNG, or the whole vault as a JSON backup.

**Work together**

- **Live collaboration**: several people edit the same vault at once and see each other's
  typing, cursors and names.
- **Offline first**: edits save in the browser first. Edits made offline merge in when the
  server is back, without overwriting anyone's work, and the app lists the notes it merged.
- **Phones and tablets**: the layout stacks on small screens.
- **Your own server**: self-hosted with Docker, PostgreSQL storage, a shared access token and
  optional HTTPS.

## Install

Pick one:

| Where | When | How |
|-------|------|-----|
| Your laptop, with Docker | Try it, or use it alone | [Local with Docker](#local-with-docker) |
| Your laptop, without Docker | Change the code | [Local for development](#local-for-development) |
| A server | Share one vault with a team | [On your own server](#on-your-own-server) |

### Local with Docker

You need [Docker](https://docs.docker.com/get-docker/) with Compose v2 (Docker Desktop, OrbStack
or Docker Engine) and Git.

```bash
git clone https://github.com/ztrenggono/mindloom.git
cd mindloom/infra
docker compose up -d --build
```

Open http://localhost:8080. The first start builds the images, which takes a few minutes. Notes
are stored in PostgreSQL in the `pgdata` Docker volume, and survive restarts.

```bash
docker compose logs -f backend   # follow the API log
docker compose down              # stop, keep data
docker compose down -v           # stop and delete all data
```

If port 8080 is taken, copy `infra/.env.example` to `infra/.env` and set `WEB_PORT=8090`, then run
`docker compose up -d` again.

| Service   | What it runs                                  | Exposed            |
|-----------|-----------------------------------------------|--------------------|
| `web`     | The built app on nginx, proxying `/api`       | `localhost:8080`   |
| `backend` | Live sync API (Node + Hono + Yjs)             | Only inside Docker |
| `db`      | PostgreSQL 16, data in the `pgdata` volume    | Only inside Docker |
| `caddy`   | HTTPS in front of `web` (optional)            | `:80`, `:443`      |

### Local for development

You need Node.js 22.18 or newer, and Docker for the database.

```bash
git clone https://github.com/ztrenggono/mindloom.git
cd mindloom/backend
npm install && cp .env.example .env
npm run db:up    # PostgreSQL in Docker on :5432
npm run dev      # API on :8787

# in a second terminal
cd mindloom/frontend
npm install
npm run dev      # app on http://localhost:5173, with hot reload
```

The frontend also runs on its own, without the backend: it keeps everything in the browser and
shows **Saved locally, server offline**. Checks and the project layout are in
[docs/development.md](docs/development.md).

### On your own server

For an office machine or a VPS that several people reach over the network. The server needs
Docker with Compose v2 and Git. In short:

1. Clone the repository and create the settings file:

   ```bash
   git clone https://github.com/ztrenggono/mindloom.git
   cd mindloom/infra
   cp .env.example .env
   ```

2. In `infra/.env`, set a token and a database password, and turn on HTTPS:

   ```bash
   API_TOKEN=...            # openssl rand -hex 32
   POSTGRES_PASSWORD=...    # another long random value
   COMPOSE_PROFILES=https
   DOMAIN=mindloom.office.lan   # or the server's IP, or a public domain
   TLS=internal                 # office network; your email for Let's Encrypt on a public domain
   WEB_PORT=127.0.0.1:8080
   ```

3. Start it with `docker compose up -d --build` and open `https://<DOMAIN>`.
4. In each browser, click **Saved locally, enter server token** in the status bar and paste the
   `API_TOKEN`. Each browser asks only once.

Without `API_TOKEN` and HTTPS, anyone who can reach the server can read and change the vault.
[docs/deployment.md](docs/deployment.md) covers each step in detail: DNS or hosts entries,
trusting the certificate on macOS, Windows and Linux, changing the token, updates, backups and
troubleshooting.

To update to a new version later:

```bash
cd mindloom/infra && git pull && docker compose up -d --build
```

## Using Mindloom

The app opens with a sample vault. The **Welcome** note links to the rest.

### Notes

- **New note**: Ctrl+N, or the file icon in the left rail. Folders: the buttons at the top of the
  file list; drag notes between them, double-click to rename, right-click to delete.
- **Edit or read**: Ctrl+E switches between the Markdown source and the rendered note.
- **Link notes**: type `[[` and pick a note. Renaming a note updates every link to it. The right
  panel shows the outline, backlinks, unlinked mentions and the local graph.
- **Markdown extras**: `#tags`, task lists, callouts (`> [!note]`), `==highlights==`, and
  diagrams inside a note with a fenced block such as ```` ```erd ````.

### Diagrams

1. Switch the note to **Document + Canvas** (Ctrl+2) or **Canvas** (Ctrl+3).
2. Click **+** in the canvas tab bar to add a blank diagram, one of the templates, an icon or an
   image.
3. Open the code editor with the **`</>`** button and write, for example:

   ```
   users [icon: user] {
     id uuid pk
     email varchar unique
   }
   orders {
     id uuid pk
     user_id uuid
   }
   orders.user_id > users.id
   ```

   The diagram redraws as you type. The **?** button in the editor shows the full syntax for each
   diagram type.

4. The toolbar under the diagram zooms, animates the lines, presents step by step, and exports
   SVG, PNG or Mermaid. **Compare versions** in the tab bar saves a snapshot and shows what
   changed since.

The **Whiteboard** tab in the same bar is a free drawing canvas.

### Search

Ctrl+Shift+F, or the magnifier in the left rail. All words must appear, in any order:

| Query | Finds |
|-------|-------|
| `payment retry` | Notes and diagrams containing both words |
| `"idempotency key"` | That exact phrase |
| `#database` | Notes with that tag |
| `folder:Database` | Notes in that folder or below |
| `in:diagrams users` | `users` in diagram code only (`in:notes` for note text) |

### Working together

Everyone who opens the same server, with its token, shares one vault.

- Edits appear on other screens as people type. A colored caret with a name shows where
  someone else is typing, and avatars in the note header show who has it open.
- Click your name at the bottom of the window to change the name others see.
- Offline, keep working: the status bar shows **Saved locally, server offline**. When the server
  is back, edits from both sides are merged, and a notice lists the notes that were edited on
  both sides.
- To point someone at a note, use **⋯ → Copy link** in the note header, or copy the address bar.
  The link opens that note, and the diagram on screen if the canvas is showing.

### Import, export and backup

- **Import** (arrow icon in the left rail): Markdown (`.md`), Eraser files (`.eraser`), Mermaid
  (`.mmd`) or a Mermaid block inside Markdown, and a full vault backup (`.json`).
- **Export**: **⋯ → Export as Markdown** for one note; the download icon in the left rail for a
  JSON backup of the whole vault.
- On a server, back up the database itself as well; see
  [docs/deployment.md](docs/deployment.md#back-up-and-restore).

### Keyboard shortcuts

On macOS, use Cmd instead of Ctrl.

| Keys | Action |
|------|--------|
| Ctrl+P | Command palette |
| Ctrl+O | Quick switcher |
| Ctrl+N | New note |
| Ctrl+E | Switch between editing and reading |
| Ctrl+1 / 2 / 3 | Layout: Document / Document + Canvas / Canvas |
| Ctrl+Shift+F | Search all notes |
| Ctrl+G | Graph view |
| Ctrl+W | Close the current tab |

## Documentation

- [docs/deployment.md](docs/deployment.md): running Mindloom on a shared server, step by step.
- [docs/development.md](docs/development.md): hot reload, checks and the project layout.
- [docs/features.md](docs/features.md): feature overview (in Indonesian).
- [backend/README.md](backend/README.md): the sync API and how edits merge.

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
