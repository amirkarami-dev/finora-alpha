# Expense / Revenue / Claim rework + BaseInfo — Design

Date: 2026-07-27 · Branch: `feature/charges-claims-baseinfo` · Status: approved, binding

## 1. Scope & decisions

Finora currently has a single flat `Expense` entity (`src/types/index.ts:303-320`) that lumps
three different things together — invoice expenses, general expenses and claims — with
hard-coded category enums and no line items. This rework replaces it with something closer to how
the desk actually works:

- **Categories become editable data**, not values baked into the code, managed from a new
  **BaseInfo** area.
- **Claims are their own thing**: pick one invoice, see all its goods, and declare a claim amount
  and description **per good**, typed as *quantity* or *quality*.
- **Expenses attach to one invoice and break down across its goods.** You create the expense
  against an invoice, then open it and add category lines (date, amount, FX, description, cost
  centre), each spreading equally across the goods with per-good amounts you can adjust.
- **Revenue works identically**, mirrored.

Outcome: costs and income can be attributed to the specific goods on a specific invoice, category
lists are maintained by the user rather than by a developer, and claims are recorded per good.

### Binding decisions

| Question | Decision |
|---|---|
| Where money lives | **Detail lines only.** The header has no amount; header total = Σ lines. |
| Split basis | **Equal per good** (amount ÷ number of goods). |
| Rounding | **Largest remainder** — leftover cents to the first goods; parts always sum exactly. |
| Removing a good from a line | **Re-split across the rest** — line total unchanged. |
| Claim header amount | **Auto-summed** from the per-item amounts (read-only). |
| Unit price | **Derived, read-only**: line amountUSD ÷ Σ selected goods' MT (cost per MT). |
| Docs per invoice | **Many allowed**; picker hints how many already exist. |
| Existing data | **No migration** — bump schema, discard. |
| BaseInfo | **One page, three tabs**: Expense categories, Revenue categories, Cost centres. Cost Centres moves here. |
| Revenue | **Exact mirror sharing one implementation**, parameterised by direction. |
| Claim sides | expense-claim → **PURCHASE** invoices; revenue-claim → **SALE**. |
| Sidebar | Expenses, Revenues, Claims under **Finance**; BaseInfo under **System**. |
| Staff | Keep BaseInfo access (retains today's cost-centre capability). |
| Naming | **`Charge*`** family (`ChargeDoc`, `ChargeLine`, `ChargeAllocation`, `ChargeCategory`). |
| Reporting | **Invoice-detail cards only** — no dashboard/Reports changes. |

**Evidence base**: this design was scoped against the live codebase — the expense module at
`src/types/index.ts:283-320`, `src/config/constants.ts:32-51`, the API block at
`src/services/api.ts:2299-2577` (cost centres + expenses), `src/services/queries.ts:41-45,549-645`,
the invoice-detail Expenses card at `src/pages/tradeInvoices/InvoiceDetailPage.tsx:697-763`, and
the prior expense/cost-centre design at
`docs/superpowers/specs/2026-07-24-empty-seed-and-expenses-design.md` §5/§6 (the module this spec
supersedes).

---

## 2. Data model (`src/types/index.ts`)

```ts
export type ChargeDirection = 'EXPENSE' | 'REVENUE';
export type ChargeScope = 'INVOICE' | 'GENERAL';

export interface ChargeCategory {          // db.chargeCategories (flat master)
  id: string;                 // 'ccat-0001'
  name: string;
  code: string;               // trimmed+uppercased; immutable; unique WITHIN a direction
  direction: ChargeDirection; // immutable
  scope: ChargeScope;         // immutable
  description?: string;
  active: boolean;
}

export interface ChargeDoc {               // db.chargeDocs (flat)
  id: string;                 // 'chg-0001'
  direction: ChargeDirection; // immutable
  kind: ChargeScope;          // immutable
  title: string;
  invoiceId?: string;         // kind==='INVOICE'; the document it was BOOKED on; IMMUTABLE
  date: string;
  description?: string;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
  lines: ChargeLine[];        // inline
  totalUSD: number;           // SERVER-DERIVED: round(Σ lines[].amountUSD)
}

export interface ChargeLine {              // inline on ChargeDoc
  id: string;                 // 'chgline-<n>' monotonic counter
  docId: string;
  categoryId: string;         // must match doc.direction AND doc.kind === category.scope
  date: string;
  amount: number;             // INVOICE kind: SERVER-DERIVED round(Σ allocations[].amount)
  currency: Currency;
  fxRate: number;             // forced to 1 server-side when currency==='USD'
  amountUSD: number;          // SERVER-DERIVED
  costCentreId?: string;
  description?: string;
  quantityBasisMt?: number;   // SERVER-DERIVED round3(Σ allocations[].quantityMt)
  unitPriceUSD?: number;      // SERVER-DERIVED amountUSD / quantityBasisMt (cost per MT)
  allocations: ChargeAllocation[];   // [] on GENERAL; ≥1 on INVOICE
}

export interface ChargeAllocation {        // inline on ChargeLine
  id: string;                 // 'chgalloc-<n>'
  lineId: string;
  invoiceItemId: string;
  referenceDocumentItemId: string;  // SERVER-DERIVED — chain-stable key
  product: string;                  // SERVER-DERIVED snapshot
  quantityMt: number;               // SERVER-DERIVED snapshot
  amount: number;                   // editable per good
  amountUSD: number;                // SERVER-DERIVED round(amount / line.fxRate)
}

export type ClaimSide = 'EXPENSE' | 'REVENUE';
export type ClaimType = 'QUANTITY' | 'QUALITY';   // name kept, values replaced

export interface Claim {                   // db.claims (flat)
  id: string;                 // 'clm-0001'
  side: ClaimSide;            // immutable
  title: string;
  invoiceId: string;          // required; IMMUTABLE
  partyId: string;            // SERVER-DERIVED from invoice.customerId
  claimType: ClaimType;
  date: string;
  currency: Currency;
  fxRate: number;
  amount: number;             // SERVER-DERIVED round(Σ items[].amount)
  amountUSD: number;          // SERVER-DERIVED
  description?: string;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
  items: ClaimItem[];         // inline
}

export interface ClaimItem {
  id: string; claimId: string;
  invoiceItemId: string;
  referenceDocumentItemId: string;  // SERVER-DERIVED
  product: string; quantityMt: number;   // SERVER-DERIVED snapshots
  amount: number;                        // user-entered
  amountUSD: number;                     // SERVER-DERIVED
  description?: string;
}
```

**Deleted**: `Expense`, `ExpenseType`, `InvoiceExpenseCategory`, `GeneralExpenseCategory`, the old
`ClaimType` values (`types/index.ts:296-320`); `EXPENSE_TYPES`, `CLAIM_TYPES`,
`INVOICE_EXPENSE_CATEGORIES`, `GENERAL_EXPENSE_CATEGORIES` (`config/constants.ts:32-51`).

**Why these shapes.** `ChargeCategory` is one entity with two flags rather than four lists — the
four buckets are a 2×2 of identical shape, and it copies the master-data quintet used by
`CostCentre`/`Warehouse`/`Partner` verbatim. Lines and allocations are **inline** because they have
no independent lifecycle and the parent total is recomputed wholesale from them (the
`recomputeInvoiceTotals` idiom, `api.ts:1047-1062`); every money mutation then stays inside one
`db.chargeDocs[i]` object, so `persistDb()` is a single write and there is no orphan class.
Allocations store **both** `invoiceItemId` and `referenceDocumentItemId`, mirroring
`InventoryDocumentItem` (`types/index.ts:233-237`) — the reference id is what survives a
provisional→final conversion, which the two documents' item ids do not.

**`invoiceId` immutable after create** is the key simplification: the chain-leaf-CONFIRMED check
runs only at create, so `updateChargeDoc` never re-validates the invoice. That removes the need for
today's `validateAndNormalizeExpense(input, currentInvoiceId?)` escape hatch (`api.ts:2465-2515`),
which exists purely to stop edits throwing forever once the booked document converts.

---

## 3. Split algorithm, money roll-up, re-split semantics (`src/utils/calc.ts`)

Pure, exported, imported by **both** `api.ts` (authoritative) and the line modal (live preview) so
the two can never disagree:

```ts
/** Splits `amount` into `n` equal parts in integer cents. Equal split gives every part the same
 *  fractional remainder, so the tie-break is positional — leftover cents go to the FIRST parts.
 *  Σ result === round(amount) exactly. Callers guarantee amount > 0 (`invalid-amount`). */
export function splitEqually(amount: number, n: number): number[] {
  if (n <= 0) return [];
  const totalCents = Math.round(amount * 100);
  const base = Math.trunc(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}
```

Integer cents, not float division: `$100 / 3` → exactly `[33.34, 33.33, 33.33]`.

**Convert at the leaf, roll up** — preserves the additive invariant the UI shows at every level:
```
allocation.amountUSD = round(allocation.amount / line.fxRate)
line.amount / line.amountUSD = round(Σ allocations)      // INVOICE
line.amountUSD               = round(amount / fxRate)    // GENERAL
doc.totalUSD                 = round(Σ lines[].amountUSD)
```

**Re-split rules** — the line amount seeds a split, then becomes an output
(`line.amount = Σ allocations` is a permanent invariant):

| Trigger | Behaviour |
|---|---|
| Amount typed / line created | `splitEqually(amount, n)` |
| Good removed / added | `splitEqually(line.amount, n∓1)` — **line total unchanged** |
| One good edited by hand | that allocation takes the value; `line.amount = round(Σ)` follows |
| "Re-split equally" | discards manual edits |

Guard `last-allocation`: an INVOICE line keeps ≥1 good.

Three private recompute helpers in `api.ts` (`recomputeAllocationUSD`, `recomputeLineTotals`,
`recomputeDocTotals`) called at the end of every line mutation — never from the client.

---

## 4. API surface (`src/services/api.ts`)

Replaces the block at `api.ts:2361-2577`. Ids: zero-padded max-scan for top level
(`nextCostCentreId` idiom, `:2312-2319`); module-level monotonic counters seeded by max-scan for
children (`nextInvoiceItemId` idiom, `:1114-1125`) — **never length-derived**.

**Categories** — `getChargeCategories(direction?, scope?)`, `createChargeCategory`
(`duplicate-code` within direction), `updateChargeCategory` (name+description only),
`setChargeCategoryActive`. Mirrors `createCostCentre`/`updateCostCentre`/`setCostCentreActive`.

**Source invoices** — rename `getExpenseSourceInvoices` → `getChargeSourceInvoices(side)`, **keeping
its doc-comment verbatim** ("Never use `getTradeInvoices` for this: it returns DRAFT, CANCELLED and
unpriced order documents"). Widen the row with `contractId`, `currency`, `totalAmount`,
`totalWeightMt`, `itemCount` so the picker can filter and show useful columns. Add
`getClaimSourceInvoices(side)` mapping EXPENSE→PURCHASE, REVENUE→SALE server-side.

**Docs** — `getChargeDocs(direction, kind?)` returning `ChargeDocRow extends ChargeDoc` with
`invoiceNumber`/`customerName`/`lineCount` joined server-side (the `PaymentRow extends Payment`
idiom, so the list page doesn't rebuild three Maps as `ExpensesPage.tsx:46-62` did); `getChargeDoc(id)`
returning `{ doc, invoice, invoiceItems, customerName }`.

`createChargeDoc` guards **in order**: `title-required` → `date-required` → `invoice-required`
(INVOICE kind) → `invoice-not-found` → `invoice-not-confirmed` (`isPricedType` **and** in
`chainLeafDocs(side)` — reuse `api.ts:2492-2495`); `invoiceId` stripped for GENERAL.
`updateChargeDoc` guards **in order**: `doc-cancelled` → `title-required` → `date-required` →
`invoice-immutable` → `kind-immutable`/`direction-immutable`; **no invoice re-validation**.
`cancelChargeDoc` soft-cancels.

**Lines** — one atomic mutation replaces the whole allocation set (`addChargeLine`,
`updateChargeLine`, `removeChargeLine`), rather than granular per-good calls: it matches the modal
UX, makes two-pass validation trivial, and keeps `persistDb()` (a full-db serialise) off the
keystroke path.

```ts
export interface ChargeGoodInput { invoiceItemId: string; amount?: number; }
export interface ChargeLineInput {
  categoryId: string; date: string; amount: number; currency: Currency; fxRate: number;
  costCentreId?: string; description?: string;
  goods?: ChargeGoodInput[];   // INVOICE only; omitted → ALL of the invoice's items
}
```

Guards **in order**: doc found → `doc-cancelled` → (update) line found → `category-required` →
`category-not-found` → `category-inactive` (only when the id changes — union idiom) →
`category-mismatch` → `date-required` → `invalid-amount` → `invalid-fx` (USD forces fxRate 1) →
`cost-centre-not-found` → GENERAL: `goods-not-allowed` → INVOICE **pass 1** (validate all before
mutating — the `addInvoiceItems` atomicity idiom, `:1656-1675`): `goods-required` →
`good-not-on-invoice` → `duplicate-good` → `invalid-good-amount` → **pass 2**: build allocations
deriving `referenceDocumentItemId`/`product`/`quantityMt` **from the invoice line, never the
client** (the `createInventoryDocument` precedent, `:2019-2034`); `splitEqually` when no explicit
amounts → recompute line → recompute doc → `persistDb()`.

**Claims** — `getClaims(side?)`, `getClaim(id)`, `createClaim`, `updateClaim`, `cancelClaim`.
Guards **in order**: `title-required` → `date-required` → `invoice-required` →
`invoice-not-found` → `invoice-side-mismatch` → `invoice-not-confirmed` → `claim-type-required` →
`invalid-fx` → drop items with `amount <= 0` → `no-claim-items` → per item `item-not-on-invoice` →
`invalid-item-amount` → `duplicate-item`. `partyId` derived from `invoice.customerId` — which
deletes today's `party-required` and `party-invoice-mismatch` codes and the whole `partyOptions`
derivation (`ExpenseFormModal.tsx:121-143`).

**Invoice reporting** — `getInvoiceChargeSummary(invoiceId)` returning expense/revenue/claim rows,
their USD totals, and a `byGood` breakdown keyed on `referenceDocumentItemId` (flagging `orphan`
goods that exist only on a snapshot). **Chain resolution verbatim from `getExpensesForInvoice`
(`:2409-2420`), including the seed** — `invoiceChain` walks via `findSuccessor`, which skips
cancelled documents, so a cancelled document is not in its own chain:
```ts
const chainIds = new Set([invoice.id, ...invoiceChain(invoice).map((c) => c.id)]);
```
Copy the existing comment across; this is the most easily-broken line in the rework.

---

## 5. Queries (`src/services/queries.ts`)

Keys: `chargeCategories(direction?)`, `chargeDocs(direction, kind?)`, `chargeDoc(id)`,
`chargeSourceInvoices(side)`, `claims(side?)`, `claim(id)`, `claimSourceInvoices(side)`,
`invoiceChargeSummary(invoiceId)`. Delete `expenses`, `expensesForInvoice`,
`expenseSourceInvoices`; `costCentres` unchanged.

Invalidation follows the **bare-prefix rule** already documented at `queries.ts:601-613` — never
conditional on an id from a mutation result, since the server may have stripped it.
⚠️ TanStack matches element-by-element, so `['claim']` does **not** cover `['claims', side]`
(`'claim' !== 'claims'`); both prefixes are required, likewise `['chargeDoc']` vs `['chargeDocs']`.
Do not "simplify" either pair away.

Category invalidation must also invalidate `['chargeDocs']`/`['chargeDoc']` — a rename or
deactivate changes the label rendered on every row.

**Pre-existing gap to close**: `useInvalidateInvoices` (`:320-353`) invalidates
`['inventorySourceInvoices']` but not the expense picker, so converting a provisional leaves the
dead predecessor selectable for up to `staleTime`. Add `['chargeSourceInvoices']`,
`['claimSourceInvoices']`, `['invoiceChargeSummary']` beside it.

---

## 6. UI

New: `src/pages/charges/`, `src/pages/claims/`, `src/pages/baseInfo/`.
Deleted: `src/pages/expenses/` (both), `src/pages/costCentres/` (moves into baseInfo).

- **`charges/ChargeListPage.tsx`** — copies `ExpensesPage.tsx` (tab shell + `useTabParam` + stat
  tiles) plus the search box from `PaymentsPage.tsx:26-35,117-124`. `ExpensesPage.tsx` and
  `RevenuesPage.tsx` become three-line wrappers, exactly the `PurchasePage`/`SalePage` precedent.
  Keep the deliberately **non-memoised** total (`ExpensesPage.tsx:65-72`) — the mock API mutates
  rows in place, so a memo lags a render behind after cancel.
- **`charges/InvoicePickerModal.tsx`** — the "button to pick the invoice with filters", shared by
  expenses, revenues **and** claims. Filters: party (options derived **from the invoices**, not from
  `customerType` — keep the comment at `ExpenseFormModal.tsx:121-124` explaining why), document
  type, date range, and free-text search over number + customer. Table with radio selection showing
  number/type/date/customer/items/weight/total. Empty state explains the eligibility rule (only
  confirmed, chain-leaf, priced documents). RTL: invoice numbers use the `ltrTruncateStyle`
  block-box idiom from `InventoryDocFormModal.tsx:34-45` — a bare `dir="ltr"` span clips the wrong
  token inside an RTL ellipsis box.
- **`charges/ChargeDocDetailPage.tsx`** — one component at both `/app/expenses/:id` and
  `/app/revenues/:id`. Copies `InvoiceDetailPage.tsx`: `PageHeader onBack`, `Descriptions` header
  card, single `activeModal` machine with row-scoped modals conditionally mounted, `Result 404`.
  Lines table with expandable per-good allocation rows. A "no lines yet" `Alert` plus auto-opening
  the add-line modal right after creation — a header with no lines is the flow's main confusion
  point.
- **`charges/ChargeLineFormModal.tsx`** — ⚠️ **the riskiest file.** It needs rows derived from
  server data *and* user add/remove, and the codebase's two `Form.List` idioms conflict on exactly
  that: `InventoryDocFormModal` uses a content-derived `key` to force a remount (its comment records
  that the effect-driven `setFieldsValue` approach "proved unreliable"), while `ContainerFormModal`
  uses `{(fields,{add,remove})}`. Combined naively, every add/remove changes the content → changes
  the key → resets `initialValue` → discards the edit that caused it.
  **Resolution: do not use `Form.List` for the goods grid.** Keep an AntD `Form` for the scalar
  fields only (category, date, amount+currency, fx disabled unless AED seeded from
  `useSettingsStore` — copy `ExpenseFormModal.tsx:296-313`, cost centre, description); hold goods in
  plain `useState`, rendered in a `Table` with `InputNumber` cells; `key={line?.id ?? 'new'}` on the
  Modal for a clean remount; add/remove/re-split are pure state updates through the **shared
  `splitEqually`**. Submit sends one `updateChargeLine` with the full goods array. Record this
  rationale in a header comment so nobody "restores consistency" later.
  Affordances: live "Line total" footer, per-row `edited` marker, "Re-split equally" (enabled only
  when edited), "Select all goods", remove disabled at one row with a tooltip.
- **`claims/ClaimsPage.tsx` + `ClaimFormModal.tsx`** — tabs expense/revenue, expandable rows showing
  claim items read-only (no detail page needed yet). The modal reuses `InvoicePickerModal`, then
  lists **all** the invoice's items with per-row amount + description; header amount is a read-only
  live Σ. Same controlled-state approach as the line modal.
- **`baseInfo/BaseInfoPage.tsx`** — `useTabParam(['expenseCategories','revenueCategories','costCentres'])`
  + Card `tabList`. Category tab: table + scope `Segmented` + status `Segmented` (from
  `CostCentresPage.tsx:103-113`). `ChargeCategoryFormModal` copies `CostCentreFormModal.tsx`, adding
  a scope select disabled on edit. Cost-centres tab is `CostCentresPage`'s body minus its
  `PageHeader`.
- **`tradeInvoices/InvoiceChargesCard.tsx`** — replaces the inline block at
  `InvoiceDetailPage.tsx:697-762`. Expenses / Revenues / Claims sections plus the `byGood`
  breakdown. Gate each section on its own `useHasAccess`, and render the **card itself** only when
  at least one passes — preserving the existing CRITICAL rule that an empty card would still tell
  Staff that expenses exist. Hooks stay unconditional; only the render is skipped.

---

## 7. Registration, RBAC, i18n, schema

- **`constants.ts`**: `expenses` (unchanged), `revenues`, `claims`, `baseInfo`; **remove**
  `costCentres`. That narrowing of `RouteKey` (`roles.ts:5`) is the compiler pointing at every
  reference — the intended safety net.
- **`roles.ts`**: Manager gains `revenues`, `claims`, `baseInfo`; Staff's `costCentres` → `baseInfo`;
  CEO and Customer unchanged. `NAV_ITEMS`: `revenues` (`rise`) and `claims` (`exception`) after
  `payments` in **finance**; `baseInfo` (`database`) in **system**.
- **`SidebarNav.tsx`**: add those three to `ICONS`; remove the now-unused `cluster`.
- **`routes/index.tsx`**: list + `/:id` routes for expenses and revenues (both guarded by their own
  key), `claims`, `base-info`, and `cost-centres` → `<Navigate to="/app/base-info?tab=costCentres" replace />`
  so bookmarks survive.
- **i18n** (en/ar/fa, identical key trees): delete `expenseTypes.*`, `expenseCategories.*` (data
  now), most `expenses.errors.*`, `nav.costCentres`; replace `claimTypes.SUPPLIER|CUSTOMER` with
  `QUANTITY|QUALITY`; add `nav.revenues|claims|baseInfo` and namespaces `charges.*` (+
  `charges.errors.<code>`), `expenses.*`/`revenues.*` (labels only), `claims.*`, `baseInfo.*`,
  `chargeCategories.*`. Verify by **key-set comparison**, not by eye — a missing ar/fa key renders
  the raw key with no error.
- **`mock/data.ts`**: `SCHEMA_VERSION` 5 → **6** (mandatory — `Expense` changes shape and
  disappears). Seed keys: `customers`, `contracts`, `containers`, `payments`, `partners`,
  `warehouses`, `invoices`, `inventoryDocs`, `costCentres`, `chargeCategories`, `chargeDocs`,
  `claims`, `fxRate`; remove `expenses`. Because v6 is a fresh key and `purgeStaleSchemaKeys()`
  drops v5, **delete** the Phase-C backfills (`:150-155`) and turn the soft `!== undefined &&`
  probes (`:78-79`) into hard `Array.isArray` requirements. Add one nested probe using `.find()`
  for the first doc that has lines — **never `[0].lines[0]`**, since an empty-lines doc is normal
  and a leading one would false-negative and silently wipe user data.
- **`mock/sampleData.ts`**: return the new arrays, and **seed real categories + cost centres** (the
  old hard-coded lists become data). Without this, "Load sample data" gives invoices but every
  charge flow dead-ends at an empty category picker. Mint ids literally (`ccat-0001`…), never via
  the `next*` helpers (which read `db`), matching that generator's style. (Deferred to Phase 8 —
  Phase 1 only widens the return shape to satisfy `Db` with empty arrays.)

---

## 8. Out of scope

Journal posting; approval workflow; attachments; recurring expenses/revenues; splitting one charge
line across invoices; editing the sample dataset outside "Load sample data"; dashboard/Reports
changes (§1 "Reporting" decision — invoice-detail cards only); a `ChargeDocDetailPage` print route;
migrating pre-v6 `Expense` data (explicitly discarded per the binding-decision table).

---

## 9. Phases

Each phase ends green on `npm run typecheck && npm run lint && npm run build`.

0. **Spec** — this document, in the house numbered-section style; new code comments cite it.
1. **Demolition + schema** — delete the expense module, types, constants, the invoice card; bump to
   v6 with the final array set. One commit (there is a red window mid-phase).
2. **BaseInfo shell + cost-centres move** — route/nav/RBAC, cost-centres tab live, two placeholders,
   redirect.
3. **Category master** — type, CRUD, queries, both category tabs, form modal, i18n.
4. **Charge docs, EXPENSE only** — `splitEqually`; the three types; the full API; queries; list +
   detail + picker + doc modal + line modal; registration. **Biggest phase**; split into 4a
   (types+api+queries) and 4b (UI) if it runs long.
5. **Revenue** — wrapper + registration + i18n only. **Gate: if this needs more than that, Phase 4's
   direction-parameterisation was wrong — fix Phase 4 rather than forking the module.**
6. **Claims** — types, API, queries, page + modal reusing the picker.
7. **Invoice cards + invalidation fixes** — `getInvoiceChargeSummary`, `InvoiceChargesCard`, the
   three added lines in `useInvalidateInvoices`, multi-key `useHasAccess`.
8. **Sample data + polish** — seed categories/cost centres, empty-state sweep, ar/fa key parity, RTL
   pass, `npm run smoke`.

**Riskiest**: the goods grid (rc-field-form bulk-replacement bug — see §6's resolution); the
`invoiceItemId` vs `referenceDocumentItemId` pairing (get it wrong and allocations vanish after
conversion); the `chainIds` seed (§4); the `claimTypes` value swap across three locales; the cent
invariant (§3); keeping `persistDb()` off the keystroke path.

---

## 10. Verification (live, browser)

Log in as Manager, Settings → Load sample data.

1. **BaseInfo** — create an EXPENSE/INVOICE category; duplicate code → `codeTaken`; same code under
   REVENUE → allowed; deactivate → gone from the picker but still shown `(inactive)` on a line that
   already uses it. Cost-centres tab still works; `/app/cost-centres` redirects; `?tab=` survives a
   refresh.
2. **Expense-invoice** — New → picker → filter by party, by type, search by number → pick → detail →
   Add line, **$100 across 3 goods → exactly 33.34 / 33.33 / 33.33, summing to 100.00** → header
   total 100.
3. Remove a good → total still 100, remaining 50/50 → remove to one → Remove disabled → add back →
   re-splits to three.
4. Edit one good to 60 → line total 126.66, header follows → "Re-split equally" → 42.22 ×3.
5. Second line in AED at 3.6725 → amount column AED, USD column converted, header = Σ line USD
   **exactly**. Remove a line; cancel the doc → struck through and excluded everywhere.
6. **Expense-general** — no invoice, no goods UI; picker offers only GENERAL-scope EXPENSE
   categories.
7. **Revenue** — repeat at `/app/revenues`; lists independent; a revenue category never appears in
   an expense picker.
8. **Claims** — expense-claim offers only PURCHASE invoices, revenue-claim only SALE; amounts on 2
   of 4 items → header is the read-only sum; only the 2 persist; QUANTITY/QUALITY tag renders.
9. **Chain robustness (crown-jewel)** — book an expense and a claim on a CONFIRMED *provisional*,
   convert it to a final, open the **final**: both still appear and `byGood` lines up. Edit the
   expense title → **must not throw** (proves immutable `invoiceId`). Reopen the picker → the
   converted predecessor is gone **immediately**, not after 60s (proves the new invalidation).
10. **RBAC** — Staff: no Expenses/Revenues/Claims in the sidebar, direct-navigating those URLs
    redirects, the invoice charges card is **absent** (not empty); BaseInfo still reachable. CEO:
    none of them. Manager: all.
11. **Empty start** — Settings → Reset → every new page shows a helpful `Empty`; the picker explains
    eligibility; the category picker points at BaseInfo.
12. **i18n/RTL** — every new page and modal in ar and fa; invoice numbers stay LTR inside RTL; no
    raw `charges.*`/`claims.*` keys on screen.
13. **Persistence** — refresh mid-flow; totals identical.
14. **Gates** — typecheck, lint, build, then `npm run preview` + `npm run smoke`.
