# Empty Data Start + Expense Management — Design (v2, review-hardened)

Date: 2026-07-24 · Branch: `feature/empty-seed-expenses` · Status: design v2, pre-approval

## 1. Scope & decisions

1. **Start empty** — every entity blank so the user enters everything from scratch.
2. **Expense Management** per `docs/expens-task.txt`: Invoice Expense, General Expense, Claim
   (Supplier/Customer), with Title\*, Type, Amount, Date, Cost Center, Description and conditional
   invoice pickers.

**User-approved:** demo generator kept behind a **"Load sample data"** button; portal account
**linked from the customer record**; **Cost Centre is a managed entity**; **categories are built-in**.

**Assumptions:** amounts follow the Payment convention (`currency`+`fxRate`+`amountUSD`);
**no journal posting**; a Claim records type+amount, direction noted for a future ledger.

Anchors verified by a 4-agent map that **ran the app with an empty db** (`wf_f2e618a4-318`) and a
2-lens adversarial review (`wf_1ea90bcc-775`). **v2 folds in 5 critical + 12 important findings.**

---

## 2. Emptying the data

### 2.1 Extraction
`src/mock/data.ts` lines 25-899 are one contiguous generation region with **no runtime exports**
(`api.ts` imports only `db`, `persistDb`, `resetDb`). Move it to `src/mock/sampleData.ts` exporting
**`buildSampleData(anchor?: Dayjs): Db`**.

> **CRITICAL (review):** the sample set's dates are **absolute literals baked from the pinned
> `TODAY`**, not relative constants. Its last invoice is 2026-07-08 and its last payment 2026-07;
> from **2026-08 onward** the 12-month window's last month is zero while the previous is non-zero,
> so `prev > 0` and *neither* §4 fix applies → a **permanent red ↓100%** on Total collected and both
> Executive KPIs, forever. By mid-2027 the whole sample set falls outside the window and every chart
> empties. **Fix: `buildSampleData(anchor = dayjs())` regenerates all dates relative to the anchor**,
> so pressing the button always yields a dataset centred on the real today.

`buildSampleData` must also set **`portalAccount: true` on `cust-am`** (zero `rnd()` draws, so
determinism holds) — otherwise the Customer demo login is dead in *both* modes (§3).

### 2.2 Empty seed — typing is load-bearing
```ts
const seed = {
  customers: [] as Customer[], contracts: [] as Contract[], containers: [] as Container[],
  payments: [] as Payment[], partners: [] as Partner[], warehouses: [] as Warehouse[],
  invoices: [] as Invoice[], inventoryDocs: [] as InventoryDocument[],
  costCentres: [] as CostCentre[], expenses: [] as Expense[],
  fxRate: DEFAULT_FX_AED_PER_USD,
};
```
Bare `[]` infers `never[]` through `typeof seed` → `Db`, and every `db.<x>.push` in `api.ts` then
fails to compile under strict TS.

### 2.3 Persistence
- **`SCHEMA_VERSION` 4 → 5** (one bump covering expenses + cost centres). Without it every browser
  reloads `finora-db-v4` and the old 14-customer seed returns.
- **Stale-key purge** in `loadDb`: remove any `/^finora-db-v\d+$/` key that isn't `STORAGE_KEY`.
- **Harden `isCompatible`**: add the missing `Array.isArray(o.payments)` and
  `typeof o.fxRate === 'number'`, plus `costCentres`/`expenses` probes. Persisted data is now the
  user's **only** data. All probes stay `length &&`-guarded so an empty db is accepted.

### 2.4 Load sample data / Reset
Settings danger zone gains **"Load sample data"** → confirm → `Object.assign(db,
buildSampleData())` + `persistDb()` + **full page reload** (same as `resetDb`). The reload is
required, not cosmetic: `api.ts` holds module-level `customerById`/`contractById`/`itemProduct`
indexes that would otherwise be stale against the swapped arrays. Re-word `settings.resetData*` in
en/ar/fa from "Reset demo data / restore defaults" to a destructive-wipe message; fix the false
comments at `SettingsPage.tsx:63` and the `resetDb` JSDoc.

### 2.5 Unpin `TODAY` — **three constants, not one**
`api.ts:39` **plus** `DashboardPage.tsx:36` **plus** `CustomerPortalPage.tsx:40` all pin
`dayjs('2026-06-13')`. Unpinning only the API makes the OVERDUE badge (live clock) disagree with the
days rendered beside it (pinned clock) — an invoice due 2026-07-01 shows an OVERDUE tag next to
"due in 18 days". **Replace all three with `dayjs()`** — preferably delete the two UI constants and
have the API return the overdue-day count on the row so there is **one clock**.

Left pinned, nothing a user enters is ever overdue, records fall outside every 12-month chart, and
convert-to-invoice backdates documents to Jun 2026.

### 2.6 Other seed dependencies
`scripts/smoke.mjs:73` navigates to contract `AM-P-251101156` (will 404) **and** `:39` seeds
`finora-auth` with `version: 0` (see §3). `CLAUDE.md`'s "reference contract … canonical correctness
check" now describes the *sample* dataset. `calc.ts`'s `containerInvoice` loses its only caller —
move it into `sampleData.ts`.

---

## 3. Customer portal linking

- **`Customer` gains `portalAccount?: boolean`** — at most one. Enforced in `createCustomer` /
  `updateCustomer` **and `setCustomerActive`**: deactivating the flagged customer must clear the
  flag (`if (!active) customer.portalAccount = undefined`), else the portal points at an inactive
  record with no way to notice. The resolver requires `portalAccount && active`.
  Surfaced as a switch in `CustomerFormModal` (with helper text) and a badge in the customers table.
- **Remove `customerId: 'cust-am'`** from `roles.ts:50`. This also closes the id-collision hole
  where a customer coded "AM" would inherit the portal scope (`api.ts:766` derives
  `id = cust-${code.toLowerCase()}`).
- **Resolution is a query, not a sync read.** `CustomerPortalPage` currently returns 403
  **synchronously** from `user?.customerId` before any query runs; an async lookup would flash 403
  on every load. Add **`usePortalCustomer()`** and gate the 403 on `!isLoading && !resolvedId`.
  Add its key to `useInvalidateCustomers`' **unconditional** list — today it only invalidates
  `qk.customerPortal(id)` for the edited customer, so moving the flag from A to B leaves both caches
  stale.
- **`getCustomerPortalSummary` returns `undefined`** for an unknown id → TanStack rejects it (dev
  console error) and the page renders a misleading **404**. Return **`null`** (widen to
  `CustomerPortalSummary | null`) and render the existing translated **403 "Account unavailable /
  No customer account is linked to this login"** whenever there's no link *or* the link is dangling.
- **Auth store version bump — needs a `migrate`.** *(CRITICAL, review)* zustand defaults
  `version: 0`; on a numeric mismatch **with no `migrate` it logs `console.error` and discards
  state**. That breaks `npm run smoke` two ways: screenshots 03-09 redirect to /login, and the
  console.error trips the smoke failure check. **Add
  `migrate: () => ({ user: null, token: null, isAuthenticated: false })` alongside `version: 1`,
  and update `scripts/smoke.mjs:39` to seed `version: 1`.**

---

## 4. Empty-state hardening (all verified live; none crash, all mislead)

| Symptom | Fix |
|---|---|
| Dashboard "Total collected" shows **red ↓100%** (`prev = 0 \|\| 1` → −100; the only unguarded division) | Suppress the trend when the previous period is 0 (`undefined`; StatCard already hides it) |
| Executive shows **green ↑0%** on both money KPIs | `growth()` must return `undefined` for **both** early returns (`series.length < 2` and `prev <= 0`). **Widen `ExecutiveSummary.invoicedGrowthPct`/`collectedGrowthPct` to `number \| undefined`** or it won't compile |
| Cashflow chart: flat line under a fake **$0–$4** axis | All-zero guard (below) |
| Aging chart: axes + phantom $1–$4 ticks | All-zero guard (below) |
| **Six chart cards render as blank rectangles**; "Contracts by status" shows a floating "0 / Contracts" | Shared fallback inside `BarChart`/`DonutChart` — **guard on `data.length === 0 \|\| data.every(d => d.value === 0)`**, not just empty: the portal's charts are always fixed-length (5 aging rows, 2 donut rows), so a length-only guard misses them entirely |
| **Portal shows a green "100%" on-time and "Good standing"** for a customer with zero history | `onTimeSharePct` returns `undefined` (not 100) when `totalInvoiced === 0`; render a dash |
| Warehouse → Inventory tab renders a heading and nothing | `Empty` when there are no warehouses |
| Dashboard "Recent invoices" says "Nothing due soon" | New `dashboard.noInvoices` key in en/ar/fa |

**Confirmed clean:** every other division is zero-guarded, every `reduce` has an initial value, every
id generator is max-scanning. No NaN/Infinity anywhere.

---

## 5. Cost Centre

`CostCentre { id, name, code, description?, active }` — mirrors `Warehouse`: `createCostCentre`
(code uppercased, `'duplicate-code'`), `updateCostCentre` (code immutable), `setCostCentreActive`,
`getCostCentres`. Page `src/pages/costCentres/{CostCentresPage,CostCentreFormModal}.tsx` copying
`PartnersPage`/`PartnerFormModal`. Nav: **operations**, Manager + Staff. Inactive centres excluded
from the picker but retained on existing expenses (union idiom).

---

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
  id: string;                 // 'exp-0001', max-scanning
  title: string;
  expenseType: ExpenseType;
  category?: InvoiceExpenseCategory | GeneralExpenseCategory;  // none for CLAIM
  claimType?: ClaimType;      // CLAIM only
  partyId?: string;           // CLAIM only
  invoiceId?: string;         // INVOICE + CLAIM — the document it was BOOKED on, not the chain leaf
  amount: number;             // in `currency`
  currency: Currency;
  fxRate: number;             // AED per USD; 1 for USD
  amountUSD: number;          // computed server-side
  date: string;
  costCentreId?: string;
  description?: string;
  status: 'ACTIVE' | 'CANCELLED';   // see §6.2 — no hard delete
  createdAt: string;
}
```

### 6.2 API
- **`getExpenseSourceInvoices(side)`** *(new, review-mandated)* = `chainLeafDocs(side).filter(inv =>
  isPricedType(inv.invoiceType))` → `{id, invoiceNumber, invoiceType, invoiceDate, customerId,
  customerName}`. **Do not use `useTradeInvoices`** for the pickers — it returns DRAFT, CANCELLED and
  order documents unfiltered. **Expenses and claims attach only to CONFIRMED, chain-leaf, priced
  documents.**
- **`getExpensesForInvoice(invoiceId)` resolves over the CHAIN** *(CRITICAL)*: an expense booked on
  a provisional would otherwise vanish when it converts to a final — orphaned, with no UI path back.
  Mirror payments: `const chainIds = new Set(invoiceChain(findInvoiceOrThrow(invoiceId)).map(c => c.id));`
  then filter `e.invoiceId && chainIds.has(e.invoiceId)`, excluding `status === 'CANCELLED'`.
- `getExpenses(type?)`, `createExpense`, `updateExpense`, **`cancelExpense`**.
- **Guards in order:** `'title-required'` → `'invalid-amount'` (`!Number.isFinite || <= 0`) →
  **`'invalid-fx'`** (`!Number.isFinite(fxRate) || fxRate <= 0` — `createPayment` has this same
  unguarded division and yields `Infinity`; fix it in the same pass) → `'category-required'`
  (INVOICE/GENERAL) → `'invoice-required'` (INVOICE/CLAIM) → `'invoice-not-found'` →
  **`'invoice-not-confirmed'`** → `'party-required'` → `'party-invoice-mismatch'` (the invoice must
  belong to the chosen party **and** match the side: Supplier→PURCHASE, Customer→SALE).
- **The API normalizes rather than trusting the client**: strip `category` for CLAIM, strip
  `claimType`/`partyId` for INVOICE/GENERAL, strip `invoiceId` for GENERAL — matching how
  `createInventoryDocument` refuses client-supplied product/ceilings.
- `amountUSD` computed once server-side with **`round` (2dp — `round3` is for quantities)**.
- **No hard delete.** This would be the app's first: every master deactivates, every document
  cancels, payments have no delete at all. `cancelExpense` sets `status = 'CANCELLED'`; cancelled
  rows are excluded from totals.
- Queries: `qk.expenses(type?)`, `qk.expensesForInvoice(id)`, `qk.expenseSourceInvoices(side)`,
  `qk.costCentres` + hooks + an invalidation helper.

### 6.3 UI
- **`ExpensesPage.tsx`** — `WarehousePage`'s `TAB_KEYS` + `useTabParam` idiom, three tabs
  (Invoice / General / Claim), per-tab create button. Columns: date, title, type/category tag, party
  or invoice number, cost centre, **`amount` with `currency={r.currency}` AND a separate `amountUSD`
  column** (exactly as `PaymentsPage` does — `<Money>` defaults to USD, so an AED expense would
  otherwise render as `$4,000`, and a total over mixed currencies is meaningless). **All aggregates
  sum `amountUSD` only. Never pass `colored`** (it maps `> 0` to red for receivable semantics).
  Actions: Edit + **Cancel** Popconfirm (try/catch, specific message per error code).
- **`ExpenseFormModal.tsx`** — **there is no precedent in this codebase for conditionally *mounting*
  a `Form.Item`**; every existing "conditional" is a permanently-mounted field with `disabled=` +
  dynamic `rules=`. Two hazards must be handled explicitly: a value entered before a type switch can
  still reach submit, and `required` rules on an unmounted item never run. **On `expenseType` change
  call `form.setFieldsValue({ category: undefined, claimType: undefined, partyId: undefined,
  invoiceId: undefined })`; on `claimType`/`partyId` change clear `invoiceId`.** The API
  normalization above is the real safety net.
  Fields: Title\*, Type, Amount + currency + fx (locked 1 for USD, `min={0.0001}`, default
  `useSettingsStore.fxRate` for AED), Date, Cost Centre, Description. Conditionals: *Invoice* →
  Category + invoice Select; *Claim* → Claim Type → party → invoice; *General* → Category.
- **Claim party list is derived from the invoices, not from `customerType`** *(review)*: distinct
  `customerId` over `getExpenseSourceInvoices(side)`. Nothing in the app validates `customerType`
  against contract direction, and `updateCustomer`/`setCustomerActive` can change type or
  deactivate a party that still has open invoices — a `customerType`-based filter would hide parties
  whose invoices genuinely exist, making them unclaimable. Keep `customerType` for the label only;
  retain the edit-mode escape hatch for an already-saved `partyId`.
- **Invoice detail Expenses card — must be role-gated** *(CRITICAL)*: Staff can reach invoice detail
  (`routes/index.tsx:80` requires `['purchase','sale']`, both of which Staff holds) but must **not**
  see expenses. This is the app's **first in-page RBAC gate** — add a one-line
  **`useHasAccess(key: RouteKey): boolean`** helper to `roles.ts` and render **nothing** (not an
  empty card — an empty card still reveals that expenses exist). Same rule if expenses ever reach
  the print route.

### 6.4 Routing / RBAC / i18n
`ROUTES.expenses`, `ROUTES.costCentres`. **Expenses → finance group, Manager only** — `payments` is
**Manager-only, not Manager+CEO** (v1 got this wrong); CEO holds only
`['executive','reports','settings']`, cannot reach invoice detail at all, and a create/edit page
contradicts an otherwise read-only role. If the CEO must see spend, surface **aggregate totals** on
Executive/Reports instead. Cost Centres → operations, Manager + Staff. Never Customer.
`ROLE_ACCESS` is a plain array — **TypeScript gives no safety net; a missing grant is a silently
invisible page**, and an icon name absent from `SidebarNav`'s `ICONS` map renders blank.
i18n: `expenses.*` (modelled on `warehouse.*`), `expenseTypes.*`, `claimTypes.*`,
`expenseCategories.*`, `costCentres.*`, `nav.expenses`, `nav.costCentres` — all three locales,
reusing `common.*`.

---

## 7. Out of scope
Journal posting; approval workflow; attachments; recurring expenses; splitting one expense across
invoices; editing the sample dataset.

## 8. Phases
- **A — Empty start:** extract `sampleData.ts` with the `anchor` parameter + `portalAccount` on
  cust-am; empty typed seed; SCHEMA v5 + stale-key purge + `isCompatible` hardening; Settings
  Load/Reset with reload; unpin all **three** `TODAY` constants; portal linking (flag,
  `setCustomerActive` clearing, `usePortalCustomer`, `null` summary, auth `version` + **`migrate`**);
  `smoke.mjs` (contract path **and** `version: 1`); `CLAUDE.md`.
- **B — Empty-state hardening:** the eight rows in §4, including the all-zero chart guard and the
  `ExecutiveSummary` type widening.
- **C — Cost centres + expenses:** §5 and §6, including `getExpenseSourceInvoices`, chain-aware
  `getExpensesForInvoice`, API normalization, `useHasAccess` gating, two money columns.
- **D — Adversarial review + live verify:** empty first run is clean; hand-create customer →
  contract → purchase invoice; all three expense types incl. both claim workflows; invoice card
  visible to Manager and **absent for Staff**; Load sample data → charts populate and show **no
  ↓100%** → Reset back to empty; portal linked and unlinked; all four roles; `npm run smoke` passes;
  console clean.
