# Empty Data Start + Expense Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Each task gates on `npm run typecheck && npm run lint && npm run build` and commits its own files
> (`git add <specific files>` — NEVER `git add -A`; never stage `.claude-flow/`, `.claude/*.json`,
> `graphify-out/`, `src/graphify-out/`, `docs/brainstorm.excalidraw`). Trailer:
> `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Branch: `feature/empty-seed-expenses`.
> Repo root: `C:\Projects\Emad\finora-alpha`. Git identity is already configured locally.

**Goal:** the app starts with **zero data** (demo dataset kept behind a "Load sample data" button),
and gains a full **Expense Management** module (Invoice Expense / General Expense / Claim) plus a
**Cost Centre** master entity. Per the BINDING spec
`docs/superpowers/specs/2026-07-24-empty-seed-and-expenses-design.md` — read it first; every §n is
binding and encodes 5 critical + 12 important review findings.

---

## Phase A — Empty start

**Files:** create `src/mock/sampleData.ts`; modify `src/mock/data.ts`, `src/services/api.ts`,
`src/services/queries.ts`, `src/store/useAuthStore.ts`, `src/config/roles.ts`,
`src/pages/settings/SettingsPage.tsx`, `src/pages/customers/{CustomersPage,CustomerFormModal}.tsx`,
`src/pages/portal/CustomerPortalPage.tsx`, `src/pages/dashboard/DashboardPage.tsx`,
`src/types/index.ts`, `src/utils/calc.ts`, `scripts/smoke.mjs`, `CLAUDE.md`,
`src/i18n/locales/{en,ar,fa}.json`.

- [ ] **A1 — extract the generator (§2.1).** Move `data.ts` lines 25-899 into `src/mock/sampleData.ts`
  exporting **`buildSampleData(anchor: Dayjs = dayjs()): Db`**. All date literals inside must be
  derived **relative to `anchor`** (they are currently absolute values baked from the pinned
  `TODAY = dayjs('2026-06-13')`; keep the same offsets so the shape of the dataset is unchanged).
  Set **`portalAccount: true` on the `cust-am` customer** in a zero-`rnd()` post-pass. Move
  `containerInvoice` here from `src/utils/calc.ts` (it loses its only caller).
- [ ] **A2 — empty seed (§2.2, §2.3).** `data.ts` keeps only the header, doc comment and persistence
  tail. Seed literal uses **explicit annotations** (`[] as Customer[]` …) — bare `[]` infers
  `never[]` through `typeof seed` and breaks every `db.<x>.push`. Add `costCentres` and `expenses`
  keys. `SCHEMA_VERSION` 4 → **5**. Add the **stale-key purge** in `loadDb` (remove every
  `/^finora-db-v\d+$/` key that isn't `STORAGE_KEY`). Harden `isCompatible`: add
  `Array.isArray(o.payments)`, `typeof o.fxRate === 'number'`, plus `costCentres`/`expenses` probes,
  all `length &&`-guarded.
- [ ] **A3 — Settings (§2.4).** Add **"Load sample data"** to the danger zone: Popconfirm →
  `Object.assign(db, buildSampleData())` + `persistDb()` + **full page reload** (the reload is
  required — `api.ts` holds module-level `customerById`/`contractById`/`itemProduct` indexes that
  would be stale). Re-word `settings.resetData`/`resetDataDesc` in all three locales to a
  destructive-wipe message; add `settings.loadSample*` keys; fix the false comment at
  `SettingsPage.tsx:63` and the `resetDb` JSDoc.
- [ ] **A4 — unpin all THREE `TODAY` constants (§2.5).** `api.ts:39`, `DashboardPage.tsx:36`,
  `CustomerPortalPage.tsx:40` → `dayjs()`. Prefer deleting the two UI constants and returning the
  overdue-day count from the API row so there is one clock. Verify document numbering that embeds a
  year still produces sane numbers.
- [ ] **A5 — portal linking (§3).** `Customer.portalAccount?: boolean` (at most one). Enforce in
  `createCustomer`/`updateCustomer`; **`setCustomerActive` must clear the flag when deactivating**.
  Remove `customerId: 'cust-am'` from `roles.ts:50`. Add **`usePortalCustomer()`**; resolver requires
  `portalAccount && active`. `getCustomerPortalSummary` returns **`null`** (widen to
  `CustomerPortalSummary | null`). Portal renders the existing translated **403** when
  `!isLoading && !resolvedId` **or** the link is dangling — never the 404. Add the portal-customer
  key to `useInvalidateCustomers`' **unconditional** list. Switch + helper text in
  `CustomerFormModal`, badge in the customers table.
- [ ] **A6 — auth migrate (§3, CRITICAL).** `useAuthStore` persist gains
  `version: 1` **and** `migrate: () => ({ user: null, token: null, isAuthenticated: false })` —
  without the migrate, zustand logs `console.error` and drops state, which fails `npm run smoke`.
  Update `scripts/smoke.mjs:39` to seed `version: 1`, and `:73`'s hard-coded contract path.
- [ ] **A7 — docs.** `CLAUDE.md`: the "reference contract AM-P-251101156 is the canonical
  correctness check" claim now describes the *sample* dataset; note the empty-first-run behaviour.
- [ ] **A8 — gate + verify.** `npm run typecheck && npm run lint && npm run build`, then **`npm run smoke`
  must pass** (it is the regression net for A6). Report the observed smoke result.
- [ ] **A9 — commit** → `feat(data): start empty; move demo dataset behind Load sample data`

## Phase B — Empty-state hardening (§4)

**Files:** `src/services/api.ts`, `src/components/charts/{BarChart,DonutChart}.tsx`,
`src/pages/dashboard/DashboardPage.tsx`, `src/pages/executive/ExecutiveDashboardPage.tsx`,
`src/pages/warehouse/WarehousePage.tsx`, `src/i18n/locales/{en,ar,fa}.json`.

- [ ] **B1** Dashboard collected trend: suppress when the previous period is 0 (pass `undefined`).
- [ ] **B2** `growth()` returns `undefined` for **both** early returns (`series.length < 2` and
  `prev <= 0`), and **widen `ExecutiveSummary.invoicedGrowthPct`/`collectedGrowthPct` to
  `number | undefined`** — otherwise it will not compile.
- [ ] **B3** Shared empty fallback in `BarChart` **and** `DonutChart`, guarding
  **`data.length === 0 || data.every(d => d.value === 0)`** — a length-only guard misses the portal,
  whose charts are always fixed-length (5 aging rows, 2 donut rows). This one change fixes the six
  blank cards, the phantom `$0–$4` axes and the floating "0 / Contracts".
- [ ] **B4** `onTimeSharePct` returns `undefined` (not 100) when `totalInvoiced === 0`; the portal
  renders a dash and no green "Good standing" for a customer with zero history.
- [ ] **B5** Warehouse → Inventory tab: `Empty` when there are no warehouses.
- [ ] **B6** New `dashboard.noInvoices` key (en/ar/fa); "Recent invoices" stops saying
  "Nothing due soon".
- [ ] **B7** Gate + commit → `fix(ui): honest empty states across dashboards, charts and portal`

## Phase C — Cost centres + expenses

**Files:** `src/types/index.ts`, `src/mock/data.ts`, `src/services/{api,queries}.ts`,
`src/config/{constants,roles}.ts`, `src/components/layout/SidebarNav.tsx`, `src/routes/index.tsx`,
create `src/pages/costCentres/{CostCentresPage,CostCentreFormModal}.tsx` and
`src/pages/expenses/{ExpensesPage,ExpenseFormModal}.tsx`,
modify `src/pages/tradeInvoices/InvoiceDetailPage.tsx`, `src/i18n/locales/{en,ar,fa}.json`.

- [ ] **C1 — Cost Centre (§5).** Type + api (`createCostCentre` with `'duplicate-code'`,
  `updateCostCentre` code-immutable, `setCostCentreActive`, `getCostCentres`) + queries + page/modal
  copying `PartnersPage`/`PartnerFormModal`. Nav: operations, Manager + Staff.
- [ ] **C2 — Expense types + api (§6.1, §6.2).** The `Expense` interface verbatim from the spec
  (including `status: 'ACTIVE' | 'CANCELLED'`). Add:
  - **`getExpenseSourceInvoices(side)`** = `chainLeafDocs(side).filter(inv => isPricedType(inv.invoiceType))`
    → `{id, invoiceNumber, invoiceType, invoiceDate, customerId, customerName}`. **Do not use
    `useTradeInvoices`** for pickers (it returns DRAFT/CANCELLED/orders).
  - **`getExpensesForInvoice(invoiceId)` resolving over the CHAIN** — build `chainIds` from
    `invoiceChain(findInvoiceOrThrow(invoiceId))` exactly as `getTradeInvoice` does for payments,
    excluding `status === 'CANCELLED'`.
  - `getExpenses(type?)`, `createExpense`, `updateExpense`, **`cancelExpense`** (no hard delete).
  - **Guards in order:** `'title-required'` → `'invalid-amount'` → **`'invalid-fx'`** →
    `'category-required'` → `'invoice-required'` → `'invoice-not-found'` →
    **`'invoice-not-confirmed'`** → `'party-required'` → `'party-invoice-mismatch'`.
  - **Normalize server-side**: strip `category` for CLAIM, `claimType`/`partyId` for INVOICE/GENERAL,
    `invoiceId` for GENERAL. `amountUSD` computed once with **`round` (2dp)**.
  - **Also fix `createPayment`'s identical unguarded `amount / fxRate`** (yields `Infinity` at
    `fxRate = 0`) in the same pass.
  - Seed: `expenses`/`costCentres` arrays already added in A2.
- [ ] **C3 — queries + RBAC + routes.** `qk.expenses(type?)`, `qk.expensesForInvoice(id)`,
  `qk.expenseSourceInvoices(side)`, `qk.costCentres` + hooks + invalidation helper.
  `ROUTES.expenses`/`costCentres`; **Expenses → finance group, Manager ONLY** (payments is
  Manager-only; CEO cannot reach invoice detail and the page is data-entry); Cost Centres →
  operations, Manager + Staff; never Customer. Add both `ICONS` entries in `SidebarNav` (a missing
  icon renders blank) and guarded routes.
- [ ] **C4 — `useHasAccess` + the invoice card (§6.3, CRITICAL).** Add
  `useHasAccess(key: RouteKey): boolean` to `roles.ts`. `InvoiceDetailPage` gains a read-only
  **Expenses** card from `getExpensesForInvoice` with an `amountUSD` total — rendered **only when
  `useHasAccess('expenses')`**, otherwise **nothing at all** (an empty card still tells Staff that
  expenses exist). Keep the page's single-`activeModal` machine untouched.
- [ ] **C5 — ExpensesPage (§6.3).** `TAB_KEYS` + `useTabParam` (Invoice / General / Claim),
  per-tab create button. **Two money columns** — `amount` with `currency={r.currency}` **and**
  `amountUSD` (as `PaymentsPage` does); **all aggregates sum `amountUSD` only**; **never pass
  `colored`**. Actions: Edit + Cancel Popconfirm with per-code messages.
- [ ] **C6 — ExpenseFormModal (§6.3).** Conditional **mounting** has no precedent here — every
  existing "conditional" is a mounted field with `disabled=`. Therefore: on `expenseType` change
  `form.setFieldsValue({ category: undefined, claimType: undefined, partyId: undefined,
  invoiceId: undefined })`; on `claimType`/`partyId` change clear `invoiceId`. **Claim party list is
  derived from `getExpenseSourceInvoices(side)`** (distinct `customerId`), NOT from `customerType` —
  keep `customerType` for the label only, and retain an edit-mode escape hatch for a saved
  `partyId`. fx `min={0.0001}`, locked to 1 for USD. Modal idioms verbatim
  (`key`/`initialValues`/`destroyOnHidden`/`preserve={false}`/`App.useApp()`/`confirmLoading`).
- [ ] **C7 — i18n.** `expenses.*`, `expenseTypes.*`, `claimTypes.*`, `expenseCategories.*`
  (keyed by the exact TS union members), `costCentres.*`, `nav.expenses`, `nav.costCentres` — all
  three locales, real ar/fa translations, reusing `common.*`.
- [ ] **C8 — gate + commit** → `feat(expenses): cost centres and expense management`

## Phase D — Adversarial review + live verification

- [ ] **D1** Full-diff adversarial review (parallel lenses: empty-start/determinism, expense
  logic/RBAC, UI/i18n/regressions). Fix findings.
- [ ] **D2 — live verify** (preview MCP, `.claude/launch.json` "dev"):
  1. **First run is empty and clean** — every page loads, no console errors, no ↓100%, no blank
     chart rectangles, no phantom money axes, sensible empty copy everywhere.
  2. Hand-create: customer → contract + goods → container → purchase provisional → confirm.
  3. **All three expense types**, including **both claim workflows** (Supplier: party → its purchase
     invoices → amount; Customer: party → its sale invoices → amount).
  4. Invoice detail Expenses card shows the linked expense **for Manager** and is **absent for
     Staff**.
  5. **Load sample data** → charts populate, **no ↓100% anywhere**, dates sit around today →
     **Reset** → back to empty.
  6. Portal: unlinked → 403 "no account linked"; tick a customer's portal switch → portal scopes to
     it; deactivate that customer → flag clears and the portal returns to 403.
  7. All four roles' menus correct; `npm run smoke` passes; console clean in a fresh tab.
  8. Clean up test data and report the final state.
- [ ] **D3** Commit fixes; report. (Merge/push/deploy only on the user's explicit request.)

## Self-review
- Spec coverage: §2.1→A1, §2.2-2.3→A2, §2.4→A3, §2.5→A4, §2.6→A6/A7, §3→A5/A6, §4→B1-B6,
  §5→C1, §6.1-6.2→C2, §6.3→C4/C5/C6, §6.4→C3/C7, §8→phases. No gaps.
- Name consistency: `buildSampleData`, `usePortalCustomer`, `useHasAccess`,
  `getExpenseSourceInvoices`, `getExpensesForInvoice`, `cancelExpense`, `CostCentre` used verbatim
  throughout.
- The three highest-risk items are called out at their task: the sample-data anchor (A1), the auth
  `migrate` (A6), and the Staff leak on the invoice card (C4).
