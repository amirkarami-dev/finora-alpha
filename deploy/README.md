# Deploying

One compose stack at `/data/apps/metal-erp` on 185.206.94.116 serves all three deployables:

| Service | Image | Host |
|---|---|---|
| `web` | `metal-erp-web` — nginx + the built SPA | erp.metal-uae.com |
| `land` | `metal-uae-web` — Next standalone | metal-uae.com (+ www → 301) |
| `api` | `metal-erp-api` — .NET 10 | api.metal-uae.com |
| `migrator` | `metal-erp-migrator` — runs once, then exits | — |

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
