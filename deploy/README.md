# Deploying

One compose stack at `/data/apps/metal-erp` on 185.206.94.116 serves all three deployables:

| Service | Image | Host | Database |
|---|---|---|---|
| `web` | `metal-erp-web` — nginx + the built SPA | erp.metal-uae.com **and** erp2.metal-uae.com | — |
| `land` | `metal-uae-web` — Next standalone | metal-uae.com (+ www → 301) | — |
| `api` | `metal-erp-api` — .NET 10 | api.metal-uae.com, erp.metal-uae.com/api | `finora` |
| `api2` | same image | api2.metal-uae.com, erp2.metal-uae.com/api | `finora2` |
| `migrator` / `migrator2` | run once, then exit | — | one each |

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
ArvanCloud, which is not authoritative for these Cloudflare-hosted zones.

## Images are built here and shipped

The box has ~12 GB free on `/data` and about 5 GB of RAM to spare, most of it already spoken for
by forty-odd other containers. Building there competes with production; building here does not.

```bash
npm run build                                          # both front ends
docker compose -f deploy/docker-compose.yml build      # all four images
docker save metal-erp-web:latest metal-uae-web:latest \
            metal-erp-api:latest metal-erp-migrator:latest | gzip -1 > metal-stack.tar.gz
# ship it, then on the server:
docker load -i metal-stack.tar.gz
docker compose up -d
```

## Two files that stay on the server

Neither is committed. Both are mode 600.

**`.env`** — what compose interpolates into the file above:

```
POSTGRES_PASSWORD=…      # the existing postgres container's superuser password
POSTGRES_NETWORK=postgresql_default
```

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

## What production deliberately does not have

- **`Erp:AllowDestructiveAdmin` is off**, so `PUT /api/erp/snapshot` answers 403. "Load sample
  data" and "Reset" are demo aids; production starts empty and is filled by hand.
- **`Identity:AllowDemoPasswords` is off**, so the four published demo passwords do not work.
- **The login page does not list any accounts.** That block, and the prefilled credentials, are
  behind `import.meta.env.DEV` and are absent from the production bundle.
