# Deploying

One compose stack at `/data/apps/metal-erp` serves all three deployables:

| Service | Image | Host | Database |
|---|---|---|---|
| `web` | `metal-erp-web` — nginx + the built SPA | erp.metal-uae.com **and** erp2.metal-uae.com | — |
| `land` | `metal-uae-web` — Next standalone | metal-uae.com (+ www → 301) | — |
| `api` | `metal-erp-api` — .NET 10 | api.metal-uae.com, erp.metal-uae.com/api | `finora` |
| `api2` | same image | api2.metal-uae.com, erp2.metal-uae.com/api | `finora2` |
| `migrator` / `migrator2` | run once, then exit | — | one each |

## Which box

Two, during a move that is not finished.

| | 185.206.94.116 | 179.198.198.221 |
|---|---|---|
| Role | serving production today | the replacement, built and verified |
| DNS | every A record points here | none yet |
| Docker | 29.5.1 | 29.7.2 |
| Traefik / Postgres | belong to other stacks on the box; Traefik is v2.11 | ours, at `/data/apps/infra`; Traefik is v3.7 |
| Neighbours | ~40 other containers | none |

The new box holds a restore of both databases and answers on every hostname when asked with a
`Host:` header. It is not live until the A records move, which is a deliberate manual step: the
old box keeps serving until then, so the change is reversible by pointing DNS back.

**A dump goes stale the moment it is taken.** Anything entered on the old box after the dump is
not on the new one, so re-run the restore in *Moving to a new server* immediately before flipping
DNS rather than relying on an earlier copy.

## Two companies, one application

The two instances share the front-end container. The bundle asks for `/api/...` relative, so it
does not know which host it is on and needs no build of its own — Traefik sends each host's `/api`
to a different API process, and each process has its own database. One image to keep current, and
the two front ends cannot drift apart.

What was deliberately **not** done: one API choosing a database from the `Host` header. That is
real code — tenant resolution, per-request connections, per-tenant migrations and seeding — and it
fails silently: one bug and one company's balances render under the other's name. The separate
process costs about 90 MB, which is what the first API actually uses.

Everything the second instance owns carries a `2`: database `finora2`, services `api2` and
`migrator2`, containers `metal-erp2-*`, volume `api2-keys`, routers `metal-erp2-*`, and the hosts
`erp2.metal-uae.com` and `api2.metal-uae.com`. The two service blocks are otherwise identical, so
a difference between them is always a decision rather than a leftover.

Sessions cannot cross: the session cookie is host-scoped, so signing in to `erp` grants nothing on
`erp2`. Each database seeds its own four accounts with their own passwords.

**Both instances run the same image tag on purpose.** They are two production tenants; a version
skew between them would be an accident, never a decision. `docker compose up -d` updates both.

Traefik uses `tls=true`, not the `myresolver` ACME resolver: that resolver runs DNS-01 against
ArvanCloud, which is not authoritative for these Cloudflare-hosted zones. Cloudflare must stay on
SSL mode **Full** — the origin certificate is Traefik's own self-signed one, and Full (strict)
rejects it.

## The infrastructure stack

`deploy/docker-compose.yml` declares both of its networks `external: true`. It expects a Traefik
and a Postgres to already exist on the box and does not create them.

On 185.206.94.116 they did exist, owned by other stacks that happened to be there. On a fresh box
nothing does, so they are ours and explicit — a second stack at `/data/apps/infra`:

| Service | Image | Provides |
|---|---|---|
| `traefik` | `traefik:v3` | ports 80/443, the external `traefik` network, http→https redirect |
| `postgres` | `postgres:17-alpine` | the `postgres` network, volume `infra_pgdata` |

Postgres has **no `ports:` mapping** on purpose. It is reachable only across the `postgres`
network; publishing 5432 would put the ledger on the public internet behind one password. Traefik
gets the Docker socket read-only — it needs to watch labels, not drive Docker.

`POSTGRES_PASSWORD` lives in `/data/apps/infra/.env` (mode 600) and is generated on the box, so it
never travels. `/data/apps/metal-erp/.env` carries the same value; the app stack reads it from
there.

**Pin Traefik to `v3`, not to a v3.x patch.** Traefik v3.3's Docker client speaks API version
1.24, and Docker 29 refuses anything below 1.40. The failure is quiet and looks like a routing
problem rather than a version one: Traefik starts, answers TLS on 443, and returns 404 for every
host because it discovered no containers at all. Nothing about the app stack is wrong, and the
labels are all correct. The reason is only visible in `docker logs traefik`:

```
Failed to retrieve information of the docker client and server host
error="client version 1.24 is too old. Minimum supported API version is 1.40"
```

Note what this is *not*: both boxes run Docker 29 (29.5.1 and 29.7.2), so the daemon is not the
variable. 185.206.94.116 is unaffected because its Traefik is v2.11, whose client negotiates a
version the daemon still accepts. The trap is specific to the older v3 patch releases, and `v3`
floats past it.

## Images are built here and shipped

Both boxes are small — 2 cores on the new one, and the old one's RAM is mostly spoken for by
forty-odd neighbouring containers. `next build` and the .NET SDK build compete with production
there; here they compete with nothing.

```bash
npm run build          # both front ends — the Dockerfiles only copy the output
docker build -f deploy/erp-panel/Dockerfile             -t metal-erp-web:latest      .
docker build -f deploy/land-web/Dockerfile              -t metal-uae-web:latest      .
docker build -f deploy/api/Dockerfile --target api      -t metal-erp-api:latest      .
docker build -f deploy/api/Dockerfile --target migrator -t metal-erp-migrator:latest .

docker save metal-erp-web:latest metal-uae-web:latest \
            metal-erp-api:latest metal-erp-migrator:latest | gzip -1 > metal-stack.tar.gz
# ship it, then on the server:
docker load -i metal-stack.tar.gz
docker compose up -d
```

Four `docker build` calls rather than one `docker compose build`, because compose interpolates the
whole file before it builds anything: with no `.env` beside it, `${POSTGRES_PASSWORD:?}` in the
`api` and `migrator` service definitions aborts the run even when you asked only for `web` and
`land`. The Dockerfiles take no build args, so calling them directly loses nothing.

Only ship what changed. A front-end-only release is two images and about 95 MB; all four is 168 MB.

## Two files that stay on the server

Neither is committed. Both are mode 600.

**`.env`** — what compose interpolates into the file above:

```
POSTGRES_PASSWORD=…      # the postgres superuser password
POSTGRES_NETWORK=postgres
```

`POSTGRES_NETWORK` names the Docker network the `postgres` container sits on, and it differs per
box because it depends on who created that container: `postgresql_default` on 185.206.94.116,
where Postgres belongs to somebody else's stack, and `postgres` on 179.198.198.221, where the
infra stack names it explicitly. Get it wrong and the API cannot resolve the host `postgres`.

**`docker-compose.override.yml`** — the seeded accounts' passwords:

```yaml
services:
  migrator:
    environment:
      Identity__SeedPasswords__ceo@finora.app: "…"
      Identity__SeedPasswords__amir@finora.app: "…"
      Identity__SeedPasswords__staff@finora.app: "…"
      Identity__SeedPasswords__portal@alcometal.ae: "…"
```

These cannot go in `.env`. Compose's dotenv parser rejects the `@` and the dot in a variable
name, and `${...}` interpolation only accepts `[A-Za-z_][A-Za-z0-9_]*`. A YAML `environment:`
mapping has neither restriction, and compose merges `docker-compose.override.yml` automatically.

Without them the seeder creates every account unusable — on purpose, so a production deploy
cannot silently inherit the demo passwords published on the development login page. To rotate a
password, edit the override file and re-run the migrator:

```bash
docker compose run --rm migrator
```

**A database restored from another box does not need this file.** `SeedUsersAsync` skips any
account whose email already exists, so `Identity:SeedPasswords` is never read for a user the
restore brought over — the password hashes travel inside the dump, and the logins are unchanged on
the new box without the secrets ever being copied. The file matters again the moment a release
adds a *new* seeded account: that one, and only that one, is created with a random unusable
password until its entry is present.

## What production deliberately does not have

- **`Erp:AllowDestructiveAdmin` is off**, so `PUT /api/erp/snapshot` answers 403. "Load sample
  data" and "Reset" are demo aids; production starts empty and is filled by hand.
- **`Identity:AllowDemoPasswords` is off**, so the four published demo passwords do not work.
- **The login page does not list any accounts.** That block, and the prefilled credentials, are
  behind `import.meta.env.DEV` and are absent from the production bundle.

## Moving to a new server

The order matters in one place: **restore before the app stack ever starts.** The migrator seeds
into whatever it finds, and seeding a database you are about to overwrite wastes the run at best
and collides at worst.

1. **Docker**, from Docker's own apt repository with the signing key — not the `get.docker.com`
   convenience script, which pipes a remote shell script into root.

2. **The infra stack** at `/data/apps/infra`: Traefik and Postgres as above, then create both
   databases. `Database.Migrate()` would create them, but doing it here means a failure surfaces
   now rather than inside a migrator container's logs.

   ```bash
   docker exec -u postgres postgres createdb -O postgres finora
   docker exec -u postgres postgres createdb -O postgres finora2
   ```

3. **The data**, custom-format so `pg_restore` can reorder around constraints. Both boxes run
   `postgres:17-alpine`; check that before assuming a dump will load, since `pg_restore` reads
   forward into a newer server but not backward into an older one.

   ```bash
   # on the old box
   docker exec -u postgres postgres pg_dump -Fc finora  -f /tmp/finora.dump
   docker exec -u postgres postgres pg_dump -Fc finora2 -f /tmp/finora2.dump
   docker cp postgres:/tmp/finora.dump /tmp/finora.dump      # and finora2
   # ship, then on the new box
   docker cp /tmp/finora.dump postgres:/tmp/finora.dump      # and finora2
   docker exec -u postgres postgres pg_restore -d finora  --no-owner --no-privileges /tmp/finora.dump
   docker exec -u postgres postgres pg_restore -d finora2 --no-owner --no-privileges /tmp/finora2.dump
   ```

   `--no-owner --no-privileges` because the roles on the two boxes need not match; everything ends
   up owned by the connecting superuser.

4. **Prove the copy rather than assume it.** Count every table in the `erp` and `identity` schemas
   on both boxes and diff the two lists. "It restored without errors" is not the same claim.

5. **The app stack**: ship `docker-compose.yml`, write `.env` (above), load the images, `up -d`.
   A migrator that prints *"No migrations were applied. The database is already up to date"* is
   the confirmation that the restored schema matches the deployed code.

6. **Verify before DNS**, which is the whole point of doing it in this order. Traefik routes on the
   `Host` header, so the new box can be tested in full while every A record still points at the old
   one:

   ```bash
   curl -sk -o /dev/null -w '%{http_code}\n' -H 'Host: erp.metal-uae.com' https://localhost/
   curl -sk                                  -H 'Host: erp.metal-uae.com' https://localhost/api/identity/me
   ```

   The second is the one worth reading rather than counting. `{"user":null}` as
   `application/json` is the API answering; HTML means Traefik gave the SPA's router the request
   and nginx replied with `index.html`, which the app reads as a broken API and can never sign in
   through. Add a hosts-file entry to click through it in a real browser.

7. **Re-dump, restore again, then flip DNS.** Step 3's copy is stale by however long steps 4-6
   took.

Left for the new box after cutover: the backup cron below, which is not installed there.

## Backups

> **Installed on 185.206.94.116 only.** 179.198.198.221 has no backup job yet. Set this up there
> before it takes production traffic — a box holding the only live copy of the ledger and no
> nightly dump is a worse position than the one being migrated away from.

`deploy/backup/pg-backup.sh` lives on the server at `/data/backups/pg-backup.sh` and runs from
cron at 02:15 UTC nightly:

```
15 2 * * * /data/backups/pg-backup.sh >/dev/null 2>&1
```

It dumps `finora` and `finora2` with `pg_dump -Fc` into `/data/backups/postgres/`, keeps 30 days,
and appends a line per database to `backup.log`. It runs from the host and reaches into the
`postgres` container, so it needs no client installed and survives the container being recreated.
The password is read from the stack's `.env` at run time and appears nowhere in the script.

Two things it does that a one-line `pg_dump` in cron does not. Each dump is written to `.part`
and renamed only on success, so an interrupted run cannot leave a plausible-looking file that
becomes the newest "backup". And each finished dump is read back with `pg_restore --list` — a
truncated or empty file is caught that night rather than on the night it is needed.

**Restoring:**

```bash
docker exec -e PGPASSWORD="$PGPW" postgres createdb -U postgres finora_restored
cat /data/backups/postgres/finora-YYYYMMDD-HHMMSS.dump   | docker exec -i -e PGPASSWORD="$PGPW" postgres pg_restore -U postgres -d finora_restored --no-owner
```

Restore into a new database first and compare it against the live one; point the stack at it only
once you are satisfied. This was exercised end to end when the script was installed — the restored
copy matched the live database on every table count.

**What this does not protect against.** The dumps sit on the same disk as the database they came
from. That covers a dropped table, a bad migration or a mistaken delete; it does not cover losing
the volume or the machine. An off-box copy is the missing half.
