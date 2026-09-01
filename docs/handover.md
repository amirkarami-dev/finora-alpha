# Handover

Where the project stands, for whoever picks it up next — including a Claude Code session on a
different machine with none of this in its memory.

`CLAUDE.md` explains what the project *is*. This file explains what is **half-done**, which is the
part no amount of reading the code will tell you.

Last updated: 2026-09-01.

---

## 1. There are two servers, and the move between them is not finished

| | 185.206.94.116 | 179.198.198.221 |
|---|---|---|
| Status | **live** — every A record points here | built, verified, serving nobody |
| Data | the real ledger | a restore of it, taken 2026-09-01 11:33 UTC |
| Backups | nightly cron at 02:15 UTC | **none** |

The new box runs the full stack — Traefik, Postgres 17, both front ends, both API instances — and
answers on every hostname when asked with a `Host:` header. It was verified end to end: row counts
diffed equal against the old box (`finora` 36 tables / 92 rows, `finora2` 36 tables / 193 rows),
and both migrators reported *"No migrations were applied. The database is already up to date."*

**Nothing is switched.** DNS is a manual step and was left to the owner.

Three things must happen before the flip, in this order:

1. **Test it as a human.** Add a hosts-file entry pointing `erp.metal-uae.com` at
   `179.198.198.221` and sign in for real. Nobody has done this yet — the automated checks proved
   routing and data, not that a person can log in and use it.
2. **Re-dump and restore.** The copy is from 11:33 on 2026-09-01. Anything entered on the old box
   since then does not exist on the new one. The full procedure is in
   [`deploy/README.md`](../deploy/README.md) under *Moving to a new server*; at this data size it
   takes seconds.
3. **Install the backup cron** (`deploy/backup/pg-backup.sh`). A box holding the only live copy of
   the ledger with no nightly dump is a worse position than the one being migrated away from.

Then point the A records at `179.198.198.221`, keeping Cloudflare on SSL mode **Full** — the
origin certificate is Traefik's own self-signed one, and Full (strict) rejects it.

Rollback is pointing DNS back. The old box keeps running and keeps its data.

---

## 2. The next piece of work: moving the reads to the server

The backend port is **half finished, and the half that is done is the writes.**

All ~60 ERP write operations run on the server. Reading still works the old way: the browser
fetches `GET /api/erp/snapshot` — the entire database — on load, then derives every figure itself
in `apps/erp-panel/src/services/api.ts` (4,052 lines, 126 exported functions, feeding 123 hooks in
`queries.ts`).

Four reasons that has to change, worst first:

- **Every customer's data is in every browser.** The portal user downloads the same snapshot the
  CEO does. The UI hides other customers; the data is still there for anyone who opens devtools.
- **The maths exists twice** — C# on write, TypeScript on read. If they ever disagree you get a
  wrong number and no error.
- **Nothing renders until the whole database arrives.** Fine now, not at three years of data.
- **The snapshot is a photo taken at load.** A colleague's change is invisible until reload.

The work was mapped but **not started**, at the owner's request — they wanted to use the current
version first. It is roughly 11 sessions across 6 slices. **Slice 0 is a parity harness**: run the
old browser derivation and the new server answer side by side and fail loudly when they differ, so
a wrong number is caught in development rather than at the trading desk. Do that before moving
anything.

---

## 3. Setting up a fresh machine

**Clone to `C:\Projects\Emad\finora-alpha`.** Not a nicer path — that exact one.

Claude Code stores a project's memory and history in a folder whose name is derived from the
project's path (`C:\Projects\Emad\finora-alpha` → `C--Projects-Emad-finora-alpha`). Clone
somewhere else and every previous session becomes invisible. Copy
`~/.claude/projects/C--Projects-Emad-finora-alpha/` from the old machine; the `memory/` subfolder
is the valuable part and is only a few KB.

Then:

- **Set git identity**, locally for this repo. It has been forgotten on every new machine so far,
  and the failure is `unable to auto-detect email address` at the first commit:
  ```bash
  git config user.name "Amir" && git config user.email "amirkarami.dev@gmail.com"
  ```
- **Check `plink` and `pscp` are on PATH.** Deploys use PuTTY's tools and they are not in the repo.
- `npm install` installs both trees — `apps/land-web` is deliberately not a workspace and is
  driven by a postinstall hook. See `CLAUDE.md`.
- Untracked local files that will not come with a clone: `docs/brainstorm.excalidraw`,
  `docs/expens-task.txt`.

---

## 4. Things that are true and easy to get wrong

**Secrets live on the servers, never in the repo and never in a transcript.** The seeded accounts'
passwords are in `/data/apps/metal-erp/docker-compose.override.yml` (mode 600) and the database
superuser password in `.env` beside it. Read them into a variable server-side if you need them;
do not print them.

**A restored database needs no seed-password file.** `SeedUsersAsync` skips any account whose
email already exists, so password hashes travel inside the dump and logins survive a server move
without the secrets being copied. This is why the migration above moved no credentials at all. It
matters again only when a release adds a *new* seeded account.

**`docker compose build` does not work from a checkout.** Compose interpolates the whole file
before building anything, so `${POSTGRES_PASSWORD:?}` in a service you did not ask for aborts a
build of the two front ends. Use the four `docker build` calls in `deploy/README.md`.

**Pin Traefik to `v3`, not a patch release.** v3.3's Docker client speaks API 1.24 and Docker 29
refuses anything below 1.40. The symptom is a 404 on every host with correct labels and a healthy
stack, which reads as a routing bug; the cause is only in `docker logs traefik`.

**Ship only the images that changed.** A front-end-only release is two images and about 95 MB; all
four is 168 MB.

**`npm run smoke` cannot fetch Chromium on these machines** — the Playwright CDN is blocked. Run
it against Edge instead.
