# Deployment

How to run Mindloom on a shared server, such as an office machine that several people reach over
the network. For a single laptop, the quick start in the [README](../README.md) is enough.

On a shared server, set two things that the quick start leaves off:

- **`API_TOKEN`**: without it, anyone who can reach the server can read and change the vault.
- **HTTPS**: over plain `http://`, the token crosses the network unencrypted, so anyone on the
  network can capture it.

## 1. Install

The server needs Docker with Compose v2 and Git.

```bash
git clone https://github.com/ztrenggono/mindloom.git
cd mindloom/infra
cp .env.example .env
```

## 2. Configure `infra/.env`

```bash
# Shared secret for the sync API. Generate it on the server:
#   openssl rand -hex 32
API_TOKEN=paste-the-generated-value-here

# Database password. It only takes effect when the database is first created.
POSTGRES_PASSWORD=another-long-random-value

# HTTPS with Caddy
COMPOSE_PROFILES=https
DOMAIN=mindloom.office.lan
TLS=internal
WEB_PORT=127.0.0.1:8080
```

| Setting            | What it does |
|--------------------|--------------|
| `API_TOKEN`        | Every API request except `/api/health` must carry this token. Use letters and digits only; the hex value from `openssl` is fine. |
| `COMPOSE_PROFILES` | `https` starts the `caddy` service. Leave it out to run without HTTPS. |
| `DOMAIN`           | The hostname or IP address people type in the browser. It has to match exactly, because the certificate is issued for it. |
| `TLS`              | `internal` for an office network; an email address for Let's Encrypt on a public domain (see step 4). |
| `WEB_PORT`         | `127.0.0.1:8080` keeps plain HTTP reachable from the server itself only, so traffic from other computers goes through HTTPS. |
| `HTTP_PORT`, `HTTPS_PORT` | Ports Caddy listens on. The defaults are 80 and 443. |

`DOMAIN` must resolve to the server on every computer that uses the app. Either add a DNS record on
the office network (ask whoever runs the router or DNS server), or add a line to each computer's
hosts file (`/etc/hosts` on macOS and Linux, `C:\Windows\System32\drivers\etc\hosts` on Windows):

```
192.168.1.20  mindloom.office.lan
```

If neither is possible, set `DOMAIN` to the server's IP address and open `https://192.168.1.20`.

## 3. Start

```bash
docker compose up -d --build
docker compose ps
```

The first start builds the images, which takes a few minutes. All four services (`db`, `backend`,
`web`, `caddy`) should show as running. Open `https://<DOMAIN>`.

## 4. Certificates

### Office network: `TLS=internal`

Caddy issues the certificate from its own certificate authority. Browsers show a warning until each
computer trusts that authority. This is a one-time step per computer.

Copy the root certificate off the server:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt mindloom-root.crt
```

Send `mindloom-root.crt` to each computer and install it:

- **macOS:** double-click the file, add it to the **System** keychain, open it in Keychain Access
  and set **When using this certificate** to **Always Trust**.
- **Windows:** double-click the file, choose **Install Certificate** > **Local Machine** >
  **Place all certificates in the following store** > **Trusted Root Certification Authorities**.
- **Linux (Debian, Ubuntu):** copy it to `/usr/local/share/ca-certificates/mindloom-root.crt` and
  run `sudo update-ca-certificates`. Firefox has its own store: **Settings** > **Privacy &
  Security** > **Certificates** > **View Certificates** > **Authorities** > **Import**.

Restart the browser afterwards.

The authority is stored in the `caddy_data` Docker volume. Keep that volume: if it is deleted (for
example with `docker compose down -v`), Caddy creates a new authority and every computer has to
trust the new root certificate.

### Public domain: `TLS=you@example.com`

For a real domain such as `notes.example.com`:

1. Point the domain's DNS `A` record at the server's public IP.
2. Open ports 80 and 443 to the internet.
3. Set `DOMAIN=notes.example.com` and `TLS` to your email address.

Caddy gets a Let's Encrypt certificate on first start and renews it by itself. Browsers trust it
without any extra step.

## 5. Connect each browser

1. Open `https://<DOMAIN>`.
2. At the bottom left, the status bar shows **Saved locally, enter server token**. Click it.
3. Paste the `API_TOKEN` value. The status changes to **Saved** once the vault has synced.

The browser keeps the token in its localStorage, so this is needed once per browser. Edits made
before the token is entered are kept in the browser and sync afterwards.

To point someone at one note, open it and use **⋯ → Copy link** (or copy the address bar). The
link opens that note, and the diagram on screen if the canvas is showing, for anyone who has the
token. It does not work for people without access to this server.

Share the token over a private channel, such as a password manager or a direct message, not a
group chat or a mass email. Everyone with the token shares the same vault and can read and change
all of it.

## Day-to-day operations

### Change the token

Do this when someone leaves the team or the token may have leaked:

```bash
openssl rand -hex 32          # put the new value in API_TOKEN in .env
docker compose up -d          # restarts the backend with the new token
```

Every browser then shows **enter server token** again. Give the new token to the people who should
keep access.

### Update to a new version

```bash
cd mindloom
git pull
cd infra
docker compose up -d --build
```

Data, certificates and settings in `.env` are kept.

**Updating from a version without live sync:** nothing to do by hand. The first browser that opens
the new version moves the server's vault into the live document, and each browser adds the edits
it had not sent yet. Ask everyone to reload open tabs: an old tab shows **server offline** and
keeps its edits until it is reloaded.

### Back up and restore

The vault lives in PostgreSQL. To back it up:

```bash
docker compose exec db pg_dump -U mindloom --clean --if-exists mindloom > mindloom-backup.sql
```

To restore a backup. This replaces the current vault with the one in the file:

```bash
docker compose exec -T db psql -U mindloom mindloom < mindloom-backup.sql
```

Then restart the backend, which keeps the vault in memory while it runs:

```bash
docker compose restart backend
```

Browsers keep their own copy of the vault and merge it back in when they reconnect, so a restore
alone does not undo edits those browsers have. To roll everyone back, also clear the site data in
each browser (browser settings, "Clear site data" for the Mindloom address) before it reconnects.

If you changed `POSTGRES_USER` or `POSTGRES_DB`, use those names instead of `mindloom`. Each user
can also export the whole vault as JSON from the app.

### Logs

```bash
docker compose logs -f backend   # API, including the warning when API_TOKEN is not set
docker compose logs -f caddy     # certificates and HTTPS
```

## Troubleshooting

| Problem | Cause and fix |
|---------|---------------|
| The status bar stays on **server offline** while the site loads fine | The live-sync WebSocket at `/api/collab` is blocked. A proxy in front of Mindloom must pass WebSocket upgrades; Caddy and the bundled nginx do. Check `docker compose logs backend`. |
| The browser says the connection is not private | With `TLS=internal`, the computer does not trust Caddy's root certificate yet (step 4), or the browser was not restarted after installing it. |
| The certificate is for a different name | The address in the browser does not match `DOMAIN`. Open exactly `https://<DOMAIN>`. |
| The page does not load at all | `DOMAIN` does not resolve to the server (step 2), or a firewall blocks ports 80 and 443. |
| The status bar keeps asking for the token | The token entered does not match `API_TOKEN`. Check for missing characters or spaces, and that the backend was restarted after `.env` changed. |
| A container stays in "Created" | Another program already uses one of its ports. Run `docker compose ps -a` and `docker compose logs <service>`, then free the port or change `WEB_PORT`, `HTTP_PORT` or `HTTPS_PORT`. |
| A new `POSTGRES_PASSWORD` has no effect | The password is only applied when the database volume is first created. Keep the old one, or back up, run `docker compose down -v` and restore. Note that `-v` also deletes the certificate authority. |
