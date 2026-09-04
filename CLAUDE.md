# CLAUDE.md

Project context for Claude Code. Read this first.

## What this is

A **monorepo** for the Jalil Jalal Metals Trading estate:

| Path | What | Deployed at |
|---|---|---|
| `apps/erp-panel` | **Finora** — receivables/trading ERP. Vite 6 · React 18 · AntD 5 | erp.metal-uae.com + erp2 |
| `apps/land-web` | Corporate site. Next 15 · React 19 | metal-uae.com |
| `backend/` | .NET 10 modular monolith (Identity · CMS · ERP) | api.metal-uae.com + api2 |
| `deploy/` | One compose stack + per-app Dockerfiles; see `deploy/README.md` | /data/apps/metal-erp |

**Finora** replaces a spreadsheet ("Customers Accounts" workbook) for an LME-priced
metals trading desk. The backend is merged and live: data lives in **PostgreSQL**,
every domain write has its own endpoint, and the panel hydrates its dataset from the
server on sign-in (see "How data flows" below). Production runs **two tenants** —
`erp2`/`api2` are a second company on the same image with its own database
(`deploy/README.md` explains why it's a second process, not Host-header routing).

## Commands

```bash
npm install        # installs BOTH trees (land-web is installed by a postinstall hook)
npm run dev        # erp-panel  → http://localhost:5173
npm run dev:land   # land-web   → http://localhost:3032
npm run build      # both apps
npm run preview    # serve erp-panel's dist on :4173
npm run lint       # ESLint — erp-panel only (land-web has no linter configured)
npm run typecheck  # both apps
npm run smoke      # Playwright screenshots + console-error check (preview must be running)
                   # SMOKE_BASE / SMOKE_OUT override the target and output directory
```

Everything above also runs per app: `npm run <script> -w @finora/erp-panel`.

> **`apps/land-web` is deliberately NOT an npm workspace.** It is React 19 + Next 15
> while `apps/erp-panel` is React 18 + AntD 5. In one hoisted tree `next` lands beside
> React 18 while the app's own modules resolve React 19 — two Reacts in one process.
> It keeps its own `package-lock.json` and `node_modules`; the root scripts drive it
> with `--prefix`.

### Running the backend

```bash
dotnet run --project backend/src/Finora.AppHost
```

Aspire starts PostgreSQL 17, Redis and pgAdmin, migrates, seeds, then serves the API on
**:5080** — the port both the vite dev server and `vite preview` proxy `/api` to. The ERP panel
needs it running to sign in.

```bash
dotnet build backend/Finora.slnx   # warnings are errors
dotnet test  backend/Finora.slnx   # unit + architecture + integration tests
```

`Finora.ArchitectureTests` fails the build on cross-module references, EF Core in a
Domain project, `float`/`double` in domain files, or `Math.Round` outside
`BuildingBlocks.Domain.Rounding` — see `backend/README.md` for the reasoning. Every
API failure is RFC 9457 ProblemDetails with a machine code in `extensions.code`
(catalogued in `backend/contracts/error-codes.json`); the front end's `http.ts`
surfaces that code as the `ApiError` message components branch on.

**Sign-in is real.** Four seeded accounts, listed on the login page:

| Account | Role | Sees |
|---|---|---|
| ceo@finora.app | CEO | executive, reports, settings |
| amir@finora.app | Manager | everything (18 route keys) |
| staff@finora.app | Staff | operations, no finance pages |
| portal@alcometal.ae | Customer | the portal only |

The session is an **HttpOnly cookie**, not a token — nothing in the browser can read it, and
nothing is persisted client-side. Permissions come from `/api/identity/me` on every load, so the
sidebar and route guards show what the server actually granted rather than what a table in the
bundle claims. The demo passwords only seed in development; production requires
`Identity:SeedPasswords:<email>` or the account is created unusable. Not every permission is a
route key: `conversions.confirm` (Manager only) gates just the Confirm button on a conversion
document — create/edit/cancel/list stay on the existing `warehouse` key.

## Tech stack

Vite 6 · React 18 · TypeScript (strict) · Ant Design 5 · React Router 6 ·
TanStack Query · Zustand · react-i18next · Recharts · dayjs.

## Architecture

`apps/erp-panel/`, all paths below relative to it:

```
src/
├── components/{charts,common,layout}   # UI building blocks
├── config/constants.ts                 # enums, route map, brand palette, locales
├── hooks/useLocaleEffect.ts            # syncs i18n + dayjs + <html dir/lang>
├── i18n/{index.ts,locales/*.json}      # en / ar / fa / ku (+ antd-ku, dayjs-ku)
├── mock/data.ts                        # client-side store + localStorage persistence
├── mock/sampleData.ts                  # demo dataset generator ("Load sample data")
├── pages/<feature>/                    # one folder per route
├── routes/index.tsx                    # router + RequireAuth
├── services/
│   ├── api.ts                          # derived reads + writes, over the hydrated store
│   ├── queries.ts                      # React Query hooks — the only way components read data
│   ├── http.ts                         # one fetch wrapper: cookie auth + ApiError(code)
│   ├── snapshot.ts                     # boot hydration from /api/erp/snapshot (strangler seam)
│   ├── identity.ts                     # sign-in, /api/identity/me permissions
│   └── {contracts,invoices,payments,containers,warehouseDocs,charges,claims,
│        transfers,exchangeGainLoss,masterData,users,conversions}.ts   # per-feature endpoints
├── store/                              # zustand: useUiStore, useAuthStore, useSettingsStore
├── theme/tokens.ts                     # AntD light/dark design tokens
├── types/index.ts                      # domain types
└── utils/{format.ts,calc.ts}           # formatting + pricing math
```

## Domain model

```
Customer 1─* Contract 1─* Item (goods) 1─* Container (shipment)
Customer 1─* Payment
```

An **Item (goods)** carries: `quantityMt`, `lmePercent`, `lmeFixed`,
`fixedLmePrice`, `premium`, `incoterm`, `status`, `notes`, `remainingMt`.

An **invoice line** on the four invoice types carries `grossMt` and `tareMt` typed by the user;
its `quantityMt` is the **net** (gross − tare) and is set by the server. Order lines carry
`quantityMt` only. See `docs/superpowers/specs/2026-09-04-invoice-line-weights-design.md`.

Conversion documents (Warehouse › Conversions) turn stock of one product into others inside a
warehouse and carry the cost: every receipt, issue, conversion input and output stores its cost
per MT; `StockLedger` folds quantity and value per (warehouse, product). See
`docs/superpowers/specs/2026-09-03-warehouse-conversion-design.md`.

**Pricing** (in `apps/erp-panel/src/utils/calc.ts`, validated against real workbook figures):

```
unitPrice (USD/MT) = fixedLmePrice * (lmePercent / 100) + premium
invoice    (USD)   = unitPrice * quantityMt
AED → USD          = amountAED / fxRate           (fxRate ≈ 3.6725)
IQD → USD          = amountIQD / fxRate           (default 1310, form-prefilled only)
```

Currencies are `USD`/`AED`/`IQD`. Use `config/constants.ts:defaultFxFor()` to pick
the rate — an inline `=== 'AED' ? rate : 1` silently gave IQD a rate of 1 once.

Reference contract `AM-P-251101156` (Alco Metal) is seeded verbatim from the
workbook into the **sample dataset** and is its canonical correctness check —
see "Empty start" below for how that dataset relates to what a fresh install
shows.

## How data flows (the strangler seam)

The panel's **derived reads are still computed client-side**: one person's balance
walks customers, invoices, payments, claims, charge docs, cheques and transfers
together, so no single entity's reads could move to the server alone without
leaving balances quietly wrong. Instead:

- On sign-in, `services/snapshot.ts` fills the client store (`mock/data.ts`'s `db`)
  from **`GET /api/erp/snapshot`** in one piece; `api.ts`'s selectors and
  aggregations keep running over it. If the API is unreachable the app degrades to
  whatever localStorage holds rather than a blank screen.
- **Writes go to real per-feature endpoints** (`services/contracts.ts`,
  `payments.ts`, …) — every domain entity has its own by now. The only remaining
  user of the debounced whole-dataset `PUT /api/erp/snapshot` is the demo-data
  pair in Settings; that PUT is gated on `Erp:AllowDestructiveAdmin`, which
  production leaves **off** (the `SyncAlert` banner then says "refused").
- `snapshot.ts` deletes itself when the last read moves server-side. On sign-out,
  `clearHydratedData()` empties store + localStorage so the next user on the
  browser can't read the previous user's data.

## Empty start

The app boots with **zero data** — every entity array is empty until the user
enters something. The full demo dataset (customers, contracts, containers,
invoices, payments, incl. the `AM-P-251101156` reference contract above) lives
behind **Settings → Danger zone → "Load sample data"**, which regenerates it
centred on the current date (so it always sits inside every rolling
12-month/aging chart, no matter when it's pressed) and persists it exactly
like hand-entered data — including pushing it to the server when one is reachable
(dev only; production refuses, see above). "Reset" wipes back to empty; both
actions reload the page (`apps/erp-panel/src/services/api.ts`'s module-level
lookup indexes must not go stale).

## Conventions

- **All reads through hooks.** Aggregations/selectors live in
  `apps/erp-panel/src/services/api.ts`; components consume them only via the hooks in
  `apps/erp-panel/src/services/queries.ts` — never by importing `db` or a service
  file directly. `mock/data.ts` holds the (empty) seed, the localStorage layer and
  `SCHEMA_VERSION` — bump it when a persisted entity's shape changes.
- **i18n is mandatory.** No hard-coded user-facing strings — add keys to all
  four locale files (`en`, `ar`, `fa`, `ku`) and use `t('...')`. Keep `ar`/`fa`/`ku` in
  sync with `en`. Layout must stay RTL-safe (use logical CSS:
  `marginInlineStart`, `inset-inline-*`, etc.).
- **Theming via tokens.** Read colors with `theme.useToken()`; don't hard-code
  hex except the shared brand palette in `config/constants.ts` (`BRAND`,
  `CHART_PALETTE`). Charts pull colors from `components/charts/chartTheme.ts`.
- **Money/status/dates** render through `components/common/Money.tsx`,
  `StatusTag.tsx`, and `utils/format.ts` — reuse them, don't reformat inline.
- Keep `npm run lint` and `npm run build` clean before committing.
- **Codes and document numbers are server-assigned** (`Finora.Erp.Domain.Numbering`, mirrored in `utils/numbering.ts` for the offline path). Forms never take a code; see `docs/superpowers/specs/2026-09-03-auto-codes-design.md`.

## Adding a page (pattern)

Paths relative to `apps/erp-panel/`:

1. Create `src/pages/<feature>/<Feature>Page.tsx`.
2. Add a route in `src/routes/index.tsx` and a path in `config/constants.ts:ROUTES`.
3. Add a nav entry in `src/components/layout/SidebarNav.tsx`.
4. Add i18n keys in all four locale files.
5. Read data via a hook in `src/services/queries.ts`.

## Current status

**Done & verified** (build + lint clean, smoke-tested): landing, login, dashboard,
persons (+detail +ledger), contracts (+goods +containers), containers, warehouse
documents, warehouse conversions (inputs/outputs/costs, stock and cost of sales),
purchase/sale documents (six types with the conversion chain), payments
(header + lines + allocations), cheques, transfers, expenses/revenues, claims,
exchange gain/loss, base info, five report tabs with real `.xlsx` export, settings,
customer portal, executive dashboard; dark/light; en/ar/fa/ku + RTL; responsive; RBAC
across CEO/Manager/Staff/Customer.

The backend has **landed on `main`**: sign-in, permissions and every domain
entity's writes (contracts, trade documents, payments, cheques, containers,
warehouse docs, expenses/revenues, claims, transfers, exchange gain/loss) go to
their own PostgreSQL-backed endpoints, behind server-side permission checks.

**Open:**
- **The reads still run in the browser.** Every ERP *write* is on the server; reading is still
  one `GET /api/erp/snapshot` of the whole database, derived client-side in `api.ts` (see
  "How data flows" above — `services/snapshot.ts` disappears when the reads move). Mapped,
  not started — see [docs/handover.md](docs/handover.md).
- **A server move is half-done.** 179.198.198.221 is built and verified; DNS still points at
  185.206.94.116. Same file.
- Header search and notifications are visual only.
- `apps/land-web` has no linter wired up.
- Root `package.json` still lists `packages/*` in workspaces, but the directory
  no longer exists (harmless — the glob matches nothing).

> **Read [docs/handover.md](docs/handover.md) before starting work.** It carries the state that
> is not in the code: what is half-finished, what must happen before the DNS flip, and the
> setup a fresh machine needs.

## Notes

- Design docs live in `docs/superpowers/{specs,plans}` — dated per feature; schema
  and behaviour decisions cite them, so check there before re-deciding something.
- Fonts load from Google Fonts; offline/strict-TLS environments fall back to
  system fonts (cosmetic only).
- The default branch is `main`.
