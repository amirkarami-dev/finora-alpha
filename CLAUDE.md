# CLAUDE.md

Project context for Claude Code. Read this first.

## What this is

**Finora** — a modern web app for **metals & commodities trading receivables**.
It replaces a spreadsheet ("Customers Accounts" workbook) for an LME-priced
metals trading desk. Runs entirely on deterministic **mock data** (no backend).

## Commands

```bash
npm install
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve dist on :4173
npm run lint       # ESLint flat config (must stay clean)
npm run typecheck  # tsc -b
npm run smoke      # Playwright screenshots + console-error check (preview must be running)
```

Demo login accepts **any** email/password.

## Tech stack

Vite 6 · React 18 · TypeScript (strict) · Ant Design 5 · React Router 6 ·
TanStack Query · Zustand · react-i18next · Recharts · dayjs.

## Architecture

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

**Pricing** (in `src/utils/calc.ts`, validated against real workbook figures):

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
page (`src/mock/data.ts`'s module-level lookup indexes must not go stale).

## Conventions

- **Data is mock & deterministic, but starts empty.** `src/mock/data.ts` holds
  only the (empty) seed + the localStorage persistence layer; the demo dataset
  generator is `src/mock/sampleData.ts`'s `buildSampleData()`, invoked only by
  "Load sample data" (see "Empty start" above). Aggregations/selectors live in
  `src/services/api.ts`; components consume them only via the hooks in
  `src/services/queries.ts`. To go real, replace `api.ts` internals.
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

1. Create `src/pages/<feature>/<Feature>Page.tsx`.
2. Add a route in `src/routes/index.tsx` and a path in `config/constants.ts:ROUTES`.
3. Add a nav entry in `src/components/layout/SidebarNav.tsx`.
4. Add i18n keys in all three locale files.
5. Read data via a hook in `src/services/queries.ts`.

## Current status

**Done & verified** (build + lint clean, smoke-tested in headless Chromium):
landing, login, dashboard, customers (+detail), contracts (+detail with goods
& containers), containers, invoices, payments, reports, settings; dark/light;
en/ar/fa + RTL; responsive.

**Stubbed (good next steps):**
- "New…" buttons (customer/contract/container/payment) show a placeholder —
  no create/edit forms yet. Add AntD `Form` in a `Modal`/`Drawer`, mutate via
  TanStack Query against `api.ts`.
- Header search and notifications are visual only.
- Export buttons are no-ops (wire CSV/print export).
- No persistence of edits (mock data is read-only); add a backend or
  Google Sheets sync to make it real.

## Notes

- Fonts load from Google Fonts; offline/strict-TLS environments fall back to
  system fonts (cosmetic only).
- This branch is `claude/awesome-turing-b8ven2`.
