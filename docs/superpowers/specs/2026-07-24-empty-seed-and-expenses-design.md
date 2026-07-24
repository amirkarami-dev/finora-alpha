# Empty Data Start + Expense Management — Design

Date: 2026-07-24 · Branch: `feature/empty-seed-expenses` · Status: design, pre-approval

## 1. Scope

Two requests:
1. **Start empty** — customers, contracts, items, containers, purchase/sale documents, payments,
   partners, warehouses, inventory documents and every other entity begin blank so the user enters
   everything from scratch.
2. **Expense Management** — per `docs/expens-task.txt`: Invoice Expense, General Expense, and Claim
   (Supplier / Customer), with Title*, Type, Amount, Date, Cost Center, Description and conditional
   invoice pickers.

**User-approved decisions (2026-07-24):**
- The demo generator is **kept behind a "Load sample data" button** in Settings, not deleted.
- The customer-portal account is **linked from the customer record**; until one is linked the portal
  shows an explicit "no account linked" state.
- **Cost Centre is a managed entity** with its own CRUD.
- **Expense categories are built-in** per type, exactly as listed in the task file.

**Assumptions (flag if wrong):** expense amounts follow the Payment convention
(`currency` + `fxRate` + `amountUSD`, computed once in the API); **no journal/accounting posting**
(consistent with the standing instruction) — expenses are recorded, listed and shown on their
invoice, but do not affect receivables/KPIs; a Claim records type + amount with direction noted for
a future ledger, but posts nothing.

All anchors below were verified by a 4-agent map (`wf_f2e618a4-318`) that **ran the app with an
all-empty database** and walked it as Manager, CEO and Customer.

## 2. Emptying the data (`src/mock/data.ts`)

### 2.1 Structure
`src/mock/data.ts` lines 25-899 are one contiguous generation region with **no runtime exports** —
`api.ts` imports only `db`, `persistDb`, `resetDb`. Move that whole region into a new
`src/mock/sampleData.ts` exporting **`buildSampleData(): Db`** (pure, unchanged logic, same seeded
PRNG so the sample set stays deterministic). `data.ts` keeps only the header, the doc comment, the
persistence tail and an **empty** seed.

### 2.2 Empty seed — typing matters
```ts
const seed = {
  customers: [] as Customer[], contracts: [] as Contract[], containers: [] as Container[],
  payments: [] as Payment[], partners: [] as Partner[], warehouses: [] as Warehouse[],
  invoices: [] as Invoice[], inventoryDocs: [] as InventoryDocument[],
  costCentres: [] as CostCentre[], expenses: [] as Expense[],
  fxRate: DEFAULT_FX_AED_PER_USD,
};
```
**Bare `[]` infers `never[]`** through `typeof seed` → `Db`, and every `db.<x>.push` in `api.ts`
then fails to compile under strict TS. Explicit annotations are mandatory.

### 2.3 Persistence
- **`SCHEMA_VERSION` 4 → 5** (bundle the expense/cost-centre keys into this one bump — do not do
  4→5→6). Without it every existing browser reloads `finora-db-v4` and the old 14-customer seed
  returns intact.
- **Stale-key purge in `loadDb`**: iterate `localStorage` keys matching `/^finora-db-v\d+$/` and
  remove any that are not `STORAGE_KEY` (`resetDb` only removes the current key, so old blobs
  linger forever).
- **Harden `isCompatible`**: it currently misses `Array.isArray(o.payments)` and
  `typeof o.fxRate === 'number'`. Persisted data is now the user's **only** data — a malformed blob
  that passes validation crashes `api.ts` rather than falling back. Add probes for `costCentres`
  and `expenses` too. Every probe stays `length &&`-guarded so an empty db is accepted.

### 2.4 Load sample data / Reset
Settings danger zone gains **"Load sample data"** (`loadSampleData()` → `Object.assign(db,
buildSampleData())` + `persistDb()` + reload) beside the existing reset. Re-word
`settings.resetData` / `resetDataDesc` in en/ar/fa from "Reset demo data / restore defaults" to a
destructive-wipe message, and fix the now-false comments at `SettingsPage.tsx:63` and the `resetDb`
JSDoc. Loading sample data over existing data must ask for confirmation.

### 2.5 `TODAY` must be unpinned — **critical for a real-data app**
`api.ts:39` pins `const TODAY = dayjs('2026-06-13')` purely to match the seed anchor. Left as-is in
an empty app: **nothing a user enters is ever overdue**, new records fall outside every 12-month
chart window, and convert-to-invoice **backdates** new documents to Jun 2026. Replace with
`dayjs()`. (The sample dataset remains internally consistent because its dates are relative to its
own constants; verify its charts still populate after the change.)

### 2.6 Other hardcoded-seed dependencies
- `scripts/smoke.mjs:73` navigates to contract `AM-P-251101156` → will 404. Repoint at a page that
  exists in an empty app (and consider adding a portal pass so the empty path is covered).
- `CLAUDE.md`'s "reference contract AM-P-251101156 is the canonical correctness check" claim needs
  rewording — it now describes the *sample* dataset.
- `src/utils/calc.ts` `containerInvoice` loses its only caller (its JSDoc already says seed-only) —
  move it into `sampleData.ts` or delete it.

## 3. Customer portal linking

- **`Customer` gains `portalAccount?: boolean`** (exactly one customer may hold it; setting it on
  another clears the previous — enforced in `updateCustomer`/`createCustomer`). Surfaced as a
  switch in `CustomerFormModal` with helper text, and a badge in the customers table.
- **Remove the hardcoded `customerId: 'cust-am'`** from `roles.ts:50`. The Customer-role session
  resolves its customer at read time: the customer flagged `portalAccount`, else none.
- `getCustomerPortalSummary` currently **returns `undefined`** for an unknown id, which TanStack
  Query rejects (dev console error) and renders a misleading **404 "Page not found"**. Change it to
  return **`null`** (widen to `CustomerPortalSummary | null`) and have the portal render the
  existing, already-translated **403 "Account unavailable / No customer account is linked to this
  login"** state whenever there is no linked customer *or* the link is dangling.
- **Bump the auth store's persist `version`** (`useAuthStore.ts:62-70` has none) so existing
  sessions carrying `customerId: 'cust-am'` are invalidated rather than landing on a dead portal.
- **Close the id-collision hole**: `createCustomer` derives `id = cust-${code.toLowerCase()}`
  (`api.ts:766`), so a customer coded "AM" would previously have inherited the seeded portal
  account's scope. Removing the hardcoded id closes it; note it in the code comment.

## 4. Empty-state hardening (verified live with an empty db — none of these crash; all mislead)

| Symptom | Cause | Fix |
|---|---|---|
| Dashboard "Total collected" shows a **red ↓ 100%** trend | `getCashflowSeries` always returns 12 points, so `d.length < 2` never trips; `prev = 0 \|\| 1` → `-100` (`DashboardPage.tsx:86-92`) — the only unguarded division in the codebase | Suppress the trend when the previous period is 0 (pass `undefined`, which StatCard already hides) |
| Executive shows **green ↑ 0%** growth on both money KPIs | `growth()` returns the number `0` when `prev <= 0`; StatCard renders any non-`undefined` trend and defaults `trendUp` true (`api.ts:481-486`) | Return `undefined` from `growth()` when `prev <= 0` |
| Cashflow chart draws a flat line under a fake **$0–$4** money axis | 12 all-zero points; Recharts expands a zero domain to 0..4 | Render an `Empty` when every point is 0 |
| Aging chart draws axes + phantom $1–$4 ticks, no bars | `getAgingBuckets` always returns 5 zero rows | Same all-zero `Empty` guard |
| **Six chart cards render as blank rectangles** (top customers, product mix ×2, volume by product, value by customer, status distribution, incoterm mix) | `BarChart`/`DonutChart` have no empty-data fallback | Add a shared `Empty` fallback inside both chart components (fixes all six at once) |
| Dashboard "Contracts by status" shows a floating **"0 / Contracts"** with no ring | `centerValue` reduce yields 0 | Covered by the DonutChart guard |
| Warehouse → Inventory tab renders a heading and **nothing else** | stock grid maps warehouses with no zero-length branch (`WarehousePage.tsx:295-327`) | `Empty` when there are no warehouses |
| Dashboard "Recent invoices" says **"Nothing due soon"** | both lists reuse `dashboard.noUpcoming` (`:318` and `:342`) | New `dashboard.noInvoices` key in en/ar/fa |

**Confirmed clean:** every other division is zero-guarded, every `reduce` has an initial value, and
every id generator is max-scanning (first ids come out `inv-po-0001`, `invitem-1`, `idoc-0001`,
`NIZ001`, `GRN-2026-0001`). No NaN or Infinity anywhere.

## 5. Cost Centre (new master entity)

`CostCentre { id, name, code, description?, active }` — mirrors `Warehouse` exactly: `createCostCentre`
(code uppercased, `'duplicate-code'`), `updateCostCentre` (code immutable), `setCostCentreActive`,
`getCostCentres`. New page `src/pages/costCentres/{CostCentresPage,CostCentreFormModal}.tsx` copying
`PartnersPage`/`PartnerFormModal` verbatim. Nav: **Operations** group (with Partners/Warehouse),
Manager + Staff. Inactive centres are excluded from the expense picker but retained on existing
expenses (union idiom).

## 6. Expense module

### 6.1 Types
```ts
export type ExpenseType = 'INVOICE' | 'GENERAL' | 'CLAIM';
export type ClaimType = 'SUPPLIER' | 'CUSTOMER';
export type InvoiceExpenseCategory =
  'FREIGHT' | 'CUSTOMS' | 'SHIPPING' | 'LOADING_UNLOADING' | 'INSURANCE' | 'PACKAGING';
export type GeneralExpenseCategory =
  'SALARY' | 'OFFICE' | 'RENT' | 'ELECTRICITY' | 'INTERNET' | 'FUEL' | 'MAINTENANCE';

export interface Expense {
  id: string;                    // 'exp-0001', max-scanning
  title: string;                 // required
  expenseType: ExpenseType;
  category?: InvoiceExpenseCategory | GeneralExpenseCategory;  // per type; none for CLAIM
  claimType?: ClaimType;         // CLAIM only
  partyId?: string;              // CLAIM only — supplier or customer
  invoiceId?: string;            // INVOICE + CLAIM
  amount: number;                // in `currency`
  currency: Currency;
  fxRate: number;                // AED per USD; 1 for USD
  amountUSD: number;             // computed once in the API (createPayment convention)
  date: string;
  costCentreId?: string;
  description?: string;
  createdAt: string;
}
```

### 6.2 API (`api.ts`) + queries
`getExpenses(type?)`, `createExpense(ExpenseInput)`, `updateExpense`, `deleteExpense`,
`getExpensesForInvoice(invoiceId)`. Guards in order: `'title-required'` → `'invalid-amount'`
(`!Number.isFinite || <= 0`) → `'invoice-required'` (INVOICE/CLAIM types) →
`'invoice-not-found'` → `'party-required'` / `'party-invoice-mismatch'` (CLAIM: the invoice must
belong to the chosen party **and** match the claim side — Supplier→PURCHASE, Customer→SALE) →
`'category-required'` (INVOICE/GENERAL). `amountUSD` computed server-side. `persistDb()` after every
mutation. `qk.expenses(type?)`, `qk.expensesForInvoice(id)`, `qk.costCentres` + hooks and an
invalidation helper.

### 6.3 UI
- **`src/pages/expenses/ExpensesPage.tsx`** — `WarehousePage`'s `TAB_KEYS` + `useTabParam` idiom for
  three tabs (**Invoice / General / Claim**) so the tab is URL-shareable and survives refresh, each
  with its own create button. Columns: date, title, type/category tag, party or invoice number,
  cost centre, amount (`<Money/>`), actions (Edit + delete Popconfirm with try/catch).
- **`ExpenseFormModal.tsx`** — copy `RecordPaymentModal` (not `PartnerFormModal`) because it already
  exercises `Form.useWatch`-driven conditional fields. Fields: Title\*, Expense Type, Amount +
  currency + fx (locked 1 for USD, default `useSettingsStore.fxRate` for AED), Date, Cost Centre,
  Description. **Conditionals:**
  - *Invoice Expense* → Category (built-in list) + invoice Select (all confirmed purchase **and**
    sale documents).
  - *Claim* → Claim Type (Supplier/Customer) → party Select filtered by
    `allowed.includes(c.customerType) && c.active` (`ContractFormModal.tsx:50-59` idiom, including
    its edit-mode escape hatch) → invoice Select filtered to that party **and** the matching side.
    Use `useTradeInvoices('PURCHASE'|'SALE')` — the **only** selector whose rows carry `customerId`
    alongside `invoiceNumber`/`invoiceType`/`status`. Changing party or claim type clears the
    invoice.
  - *General Expense* → Category only.
- **Invoice detail** gains a read-only **Expenses** card (from `getExpensesForInvoice`) listing
  linked expenses and claims with a total — the payoff for linking them.

### 6.4 Routing / RBAC / i18n
`ROUTES.expenses = '/app/expenses'`, `ROUTES.costCentres = '/app/cost-centres'`. Expenses → **finance**
group immediately after payments, **Manager + CEO** (mirroring `payments`, which Staff deliberately
lacks); Cost Centres → **operations**, Manager + Staff. **`ROLE_ACCESS` is a plain array — TypeScript
gives no safety net, and a missing grant is a silently invisible page**; likewise an icon name with no
entry in `SidebarNav`'s `ICONS` map renders blank. Never grant either to Customer.
i18n: an `expenses.*` block modelled on `warehouse.*`, plus top-level `expenseTypes.*`,
`claimTypes.*` and `expenseCategories.*` keyed by the exact TS union members (mirroring
`customerTypes`), `costCentres.*`, and `nav.expenses` / `nav.costCentres` — all in en/ar/fa, reusing
`common.*` for save/cancel/required/saveFailed/actions/noData.

## 7. Out of scope
Journal/accounting posting; expense approval workflow; attachments/receipts; recurring expenses;
allocating one expense across several invoices; editing the sample dataset.

## 8. Phases
- **A — Empty start:** extract `sampleData.ts`, empty seed with explicit types, SCHEMA v5 + stale-key
  purge + `isCompatible` hardening, Load-sample-data/Reset in Settings, unpin `TODAY`, portal
  linking (`portalAccount`, `roles.ts`, `null` summary, auth version bump), smoke.mjs + CLAUDE.md.
- **B — Empty-state hardening:** the eight items in §4.
- **C — Cost centres + expenses:** §5 and §6 (types → api/queries → pages → invoice card → i18n).
- **D — Adversarial review + live verify:** first run is empty and clean; create a customer →
  contract → purchase invoice by hand; all three expense types incl. both claim workflows; the
  invoice expenses card; Load sample data then Reset; portal linked and unlinked; all four roles;
  console clean.
