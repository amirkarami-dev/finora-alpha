# CLAUDE.md

Project context for Claude Code. Read this first.

## What this is

A **monorepo** for the Jalil Jalal Metals Trading estate:

| Path | What | Deployed at |
|---|---|---|
| `apps/erp-panel` | **Finora** — receivables/trading ERP. Vite 6 · React 18 · AntD 5 | erp.metal-uae.com |
| `apps/land-web` | Corporate site. Next 15 · React 19 | metal-uae.com |
| `backend/` | .NET 10 modular monolith (Identity · CMS · ERP) | api.metal-uae.com |
| `packages/` | Shared TS packages (API client) | — |
| `deploy/` | One compose stack + per-app Dockerfiles | /data/apps/metal-erp |

**Finora** replaces a spreadsheet ("Customers Accounts" workbook) for an LME-priced
metals trading desk. It currently runs on deterministic **mock data**; the backend
that replaces it is being built on `feat/monorepo-dotnet-backend`.

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

Demo login accepts **any** email/password (until the Identity module lands).

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
├── i18n/{index.ts,locales/*.json}      # en / ar / fa
├── mock/data.ts                        # empty seed + persistence (single source of truth)
├── mock/sampleData.ts                  # demo dataset generator ("Load sample data")
├── pages/<feature>/                    # one folder per route
├── routes/index.tsx                    # router + RequireAuth
├── services/{api.ts,queries.ts}        # mock async API + React Query hooks
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

**Pricing** (in `apps/erp-panel/src/utils/calc.ts`, validated against real workbook figures):

```
unitPrice (USD/MT) = fixedLmePrice * (lmePercent / 100) + premium
invoice    (USD)   = unitPrice * quantityMt
AED → USD          = amountAED / fxRate           (fxRate ≈ 3.6725)
```

Reference contract `AM-P-251101156` (Alco Metal) is seeded verbatim from the
workbook into the **sample dataset** and is its canonical correctness check —
see "Empty start" below for how that dataset relates to what a fresh install
shows.

## Empty start

The app boots with **zero data** — every entity array is empty until the user
enters something. The full demo dataset (customers, contracts, containers,
invoices, payments, incl. the `AM-P-251101156` reference contract above) lives
behind **Settings → Danger zone → "Load sample data"**, which regenerates it
centred on the current date (so it always sits inside every rolling
12-month/aging chart, no matter when it's pressed) and persists it exactly
like hand-entered data. "Reset" wipes back to empty; both actions reload the
page (`apps/erp-panel/src/mock/data.ts`'s module-level lookup indexes must not go stale).

## Conventions

- **Data is mock & deterministic, but starts empty.** `apps/erp-panel/src/mock/data.ts` holds
  only the (empty) seed + the localStorage persistence layer; the demo dataset
  generator is `apps/erp-panel/src/mock/sampleData.ts`'s `buildSampleData()`, invoked only by
  "Load sample data" (see "Empty start" above). Aggregations/selectors live in
  `apps/erp-panel/src/services/api.ts`; components consume them only via the hooks in
  `apps/erp-panel/src/services/queries.ts`. To go real, replace `api.ts` internals.
- **i18n is mandatory.** No hard-coded user-facing strings — add keys to all
  three locale files (`en`, `ar`, `fa`) and use `t('...')`. Keep `ar`/`fa` in
  sync with `en`. Layout must stay RTL-safe (use logical CSS:
  `marginInlineStart`, `inset-inline-*`, etc.).
- **Theming via tokens.** Read colors with `theme.useToken()`; don't hard-code
  hex except the shared brand palette in `config/constants.ts` (`BRAND`,
  `CHART_PALETTE`). Charts pull colors from `components/charts/chartTheme.ts`.
- **Money/status/dates** render through `components/common/Money.tsx`,
  `StatusTag.tsx`, and `utils/format.ts` — reuse them, don't reformat inline.
- Keep `npm run lint` and `npm run build` clean before committing.

## Adding a page (pattern)

Paths relative to `apps/erp-panel/`:

1. Create `src/pages/<feature>/<Feature>Page.tsx`.
2. Add a route in `src/routes/index.tsx` and a path in `config/constants.ts:ROUTES`.
3. Add a nav entry in `src/components/layout/SidebarNav.tsx`.
4. Add i18n keys in all three locale files.
5. Read data via a hook in `src/services/queries.ts`.

## Current status

**Done & verified** (build + lint clean, smoke-tested): landing, login, dashboard,
persons (+detail +ledger), contracts (+goods +containers), containers, warehouse
documents, purchase/sale documents (six types with the conversion chain), payments
(header + lines + allocations), cheques, transfers, expenses/revenues, claims,
exchange gain/loss, base info, five report tabs with real `.xlsx` export, settings,
customer portal, executive dashboard; dark/light; en/ar/fa + RTL; responsive; RBAC
across CEO/Manager/Staff/Customer.

Create/edit forms, localStorage persistence and Excel export all exist — an older
version of this file said they were stubbed, which has not been true for some time.

**Open:**
- The backend replacing `api.ts` (see `backend/`); until it lands, data is per-browser.
- Header search and notifications are visual only.
- `apps/land-web` has no linter wired up.

## Notes

- Fonts load from Google Fonts; offline/strict-TLS environments fall back to
  system fonts (cosmetic only).
- The default branch is `main`. `claude/awesome-turing-b8ven2` was the default
  until 2026-07-28 and still exists pointing at the same commit; prefer `main`.
