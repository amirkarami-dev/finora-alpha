# Trade Documents + Warehouse + Payments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Execute task-by-task; each task gates on `npm run typecheck && npm run lint && npm run build`
> and commits its own files (`git add <specific files>` — NEVER `git add -A`; never stage
> `.claude/launch.json` or `docs/brainstorm.excalidraw`). Commit trailer:
> `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

**Goal:** Six-type trade-document system (purchase/sale × order/provisional/invoice) with
conversion chains, warehouse/inventory fed by confirmed final invoices, and multi-payment
settlement — per the binding spec `docs/superpowers/specs/2026-07-05-invoices-warehouse-payments-design.md`.
READ THE SPEC FIRST — every rule referenced below as (§n) is defined there and is binding.

**Architecture:** mock-data app; all state in `src/mock/data.ts` (seeded PRNG + localStorage
persistence), selectors/mutations in `src/services/api.ts`, React Query hooks in
`src/services/queries.ts`, pages under `src/pages/`. TS strict; AntD 5; i18n en/ar/fa mandatory.

**File map (new):** `src/hooks/useTabParam.ts`, `src/pages/tradeInvoices/{PurchasePage,SalePage,
InvoiceListTabs,CreateInvoiceModal,InvoiceDetailPage,AddItemsModal,ConfirmInvoiceModal,
RecordPaymentModal,InvoicePrintPage,statusColors}.tsx|ts`, `src/pages/warehouse/{WarehousePage,
WarehouseFormModal}.tsx`. **Deleted:** `src/pages/invoices/InvoicesPage.tsx` (folder removed).

---

## Task T1 — Types, calc helper, schema v2 seed  (Phase A)

**Files:** Modify `src/types/index.ts`, `src/utils/calc.ts`, `src/mock/data.ts`.

- [ ] **1.1 Types** — in `src/types/index.ts`:
  - Rename `export interface Invoice` (line ~130, the container-derived view) to
    `export interface ShipmentInvoice` (same fields). Fix the doc comment to say
    "flattened shipment-invoice view".
  - Add after the Payment interface the new types EXACTLY as written in spec §2:
    `InvoiceType`, `InvoiceStatus`, `InvoiceSide`, `InvoiceItem`, `Invoice` (new document
    entity — the name is now free), `Warehouse`, `InventoryDocType`, `InventoryDocument`,
    `InventoryDocumentItem`. Add to the existing `Payment` interface:
    `invoiceId?: string;` and `direction?: 'IN' | 'OUT';` with the spec's comments.
  - Fix the two now-broken imports: `src/services/api.ts` (`Invoice` import → `ShipmentInvoice`;
    `buildInvoices(): ShipmentInvoice[]`; `CustomerPortalSummary.openInvoices: ShipmentInvoice[]`)
    and `src/pages/portal/CustomerPortalPage.tsx` (`import type { ShipmentInvoice }`, the
    `ColumnsType<ShipmentInvoice>` and `Table<ShipmentInvoice>` generics).
- [ ] **1.2 Calc helper** — append to `src/utils/calc.ts` (do NOT touch `unitPrice()`):

```ts
import type { InvoiceItem } from '@/types'; // merge into existing type-import line

/** USD/MT unit price of a trade-invoice line; null while a floating line lacks lmePrice. */
export function invoiceItemUnitPrice(item: Pick<InvoiceItem,
  'lmeFixed' | 'fixedPrice' | 'lmePrice' | 'lmePercent' | 'premium'>): number | null {
  const base = item.lmeFixed ? item.fixedPrice : item.lmePrice;
  if (base === undefined || base === null) return null;
  return base * (item.lmePercent / 100) + item.premium;
}

/** USD line value after discount; 0 while the price is incomplete (spec §3). */
export function invoiceItemAmount(item: Pick<InvoiceItem,
  'lmeFixed' | 'fixedPrice' | 'lmePrice' | 'lmePercent' | 'premium' | 'quantityMt' | 'discountPercent'>): number {
  const unit = invoiceItemUnitPrice(item);
  if (unit === null) return 0;
  const gross = unit * item.quantityMt;
  return gross * (1 - (item.discountPercent ?? 0) / 100);
}
```

- [ ] **1.3 Seed** — in `src/mock/data.ts`, insert a new post-pass block AFTER the
  partner-allocation loop (ends line ~448) and BEFORE the Persistence comment block.
  **ZERO `rnd()` calls in this block** (spec §11 — determinism). Shape:

```ts
/* ------------------------------------------------------------------ *
 * Trade documents + warehouse seed (spec §11). ZERO PRNG draws —
 * appended after all rnd()-consuming post-passes; earlier values
 * (e.g. cust-am creditLimit 2,750,000) must stay byte-identical.
 * ------------------------------------------------------------------ */
const warehouses: Warehouse[] = [
  { id: 'wh-mw', name: 'Main Warehouse', code: 'MW', location: 'Jebel Ali, Dubai', active: true },
];
const invoices: Invoice[] = [];
const inventoryDocs: InventoryDocument[] = [];
// ... build PO-2026-0001 → PP-2026-0001 → PI-2026-0001 (all CONFIRMED) from the FIRST
// PURCHASE contract in `contracts` array order; SO-2026-0001 DRAFT from the FIRST SELL
// contract (first item, 50% qty, round 2dp); GRN-2026-0001 IN doc (wh-mw) from the PI;
// one payment: 50% of PI totalAmount, method 'TT', date 2026-06-01, direction 'OUT',
// invoiceId = PI id, id = `NIZ${String(payments.length + 1).padStart(3, '0')}`.
```

  Rules the builder code must satisfy (all from spec §2/§3/§11):
  - Item snapshot fields copied from each contract item: `product, quantityMt (full),
    lmePercent, lmeFixed, fixedPrice: item.fixedLmePrice, premium`. `contractItemId = item.id`.
  - PO items: no lmePrice/lmeDate/discount; `amount` computed via `invoiceItemAmount`
    (0 for floating lines) — orders may carry incomplete prices.
  - PP/PI items: `lmeDate: dayjs('2026-05-20').toISOString()` on ALL items; `lmePrice: 2450`
    on floating (`!lmeFixed`) items ONLY; `discountPercent: 0` on all.
  - Headers: `invoiceDate` fixed literals (PO 2026-05-10, PP 2026-05-21, PI 2026-05-25,
    SO 2026-06-05 — ISO via dayjs), `currency: 'USD'`, `exchangeRate: 1`, `status:
    'CONFIRMED'` (SO: 'DRAFT'), `refInvoiceId` chain PP→PO, PI→PP, `createdAt` = invoiceDate.
    Totals = Σ `invoiceItemAmount` / Σ discount value / Σ qty (compute, never hardcode).
    Ids: `inv-po-0001`, `inv-pp-0001`, `inv-pi-0001`, `inv-so-0001`; item ids
    `invitem-<n>` from a module counter.
  - GRN doc: `{ id: 'idoc-0001', docNumber: 'GRN-2026-0001', warehouseId: 'wh-mw',
    invoiceId: <PI id>, type: 'IN', date: <PI date>, status: 'CONFIRMED', items: one per
    PI item with invoiceItemId + product + quantityMt }`.
- [ ] **1.4 Persistence** — same file: `SCHEMA_VERSION` 1 → 2. Add `warehouses, invoices,
  inventoryDocs` to the `seed` object. Extend `isCompatible`: require
  `Array.isArray(o.invoices) && Array.isArray(o.warehouses) && Array.isArray(o.inventoryDocs)`,
  probe `invoices[0].invoiceType`, `warehouses[0].active`. Extend the SCHEMA_VERSION doc
  comment's entity list with Invoice/Warehouse/InventoryDocument.
- [ ] **1.5 Gate:** `npm run typecheck && npm run lint && npm run build` — all green.
  (queries/pages untouched; the rename in 1.1 must leave `api.getInvoices`/`useInvoices`
  compiling — only the TYPE was renamed.)
- [ ] **1.6 Commit:** `git add src/types/index.ts src/utils/calc.ts src/mock/data.ts src/services/api.ts src/pages/portal/CustomerPortalPage.tsx`
  → `feat(invoicing): trade-document types, calc helper, schema-v2 deterministic seed`

## Task T2 — API surface + query hooks  (Phase A)

**Files:** Modify `src/services/api.ts`, `src/services/queries.ts`.

Implement spec §7/§8 exactly. Follow existing api.ts idioms: sleep() latency, deep-clone
returns, throw string codes, `persistDb()` after EVERY mutation. Key contracts:

- [ ] **2.1 Selectors:** `getTradeInvoices(side)` (side via `invoiceType.startsWith('PURCHASE')`);
  `getTradeInvoice(id)` → `{ invoice, items, contract, customerName, refInvoice?,
  successor?, payments (chain-aggregated §7), paidUSD, remainingUSD, chain: Invoice[] }`;
  `getContractRemaining(contractId, side)` → per contract item `{ itemId, product,
  quantityMt, uninvoicedMt }` where uninvoicedMt subtracts chain-LEAF CONFIRMED docs of
  that side (leaf = CONFIRMED with no non-cancelled successor, §5); `getWarehouses()`,
  `getInventoryDocuments()`, `getStockLevels()` (normalized product key §6).
- [ ] **2.2 Mutations:** `createInvoice`, `updateInvoiceHeader` ('duplicate-number' guard),
  `addInvoiceItems` (snapshot copy + remaining validation), `updateInvoiceItem`,
  `removeInvoiceItem`, `applyLmePrice` (§3 semantics exactly), `confirmInvoice(id,{warehouseId?})`
  (guards in order: ≥1 item → 'no-items'; prices complete for provisional/final →
  'missing-lme-price'; remaining re-check → 'qty-exceeds-remaining'; sale-final stock →
  'insufficient-stock' with `{product, available}` payload — throw an Error whose message
  is the code and attach data via a custom field; purchase/sale-final requires warehouseId
  → creates CONFIRMED IN/OUT inventory doc GRN-/GDN- numbering), `cancelInvoice`
  ('cancel-blocked-successor', purchase-final negative-stock block 'cancel-blocked-stock',
  cascades its inventory doc to CANCELLED), `convertInvoice(id, targetType)`
  ('has-successor' invariant; PP→PI carries prices, PO→* does not §5), `markInvoiceSent`,
  warehouse CRUD (`createWarehouse`/`updateWarehouse`/`setWarehouseActive`),
  `createPayment` (direction from linked invoice side §7; NIZ scan-based next id;
  reference = invoiceNumber; fxRate/amountUSD math copied from existing payment shape).
- [ ] **2.3 Aggregation exclusion (§7, CRITICAL):** in `computeAccounts`, `getKpis`,
  `getExecutiveSummary`, `getCustomerPortalSummary` — every place `db.payments` rolls into
  totalPaid/collected figures — filter `(p.direction ?? 'IN') === 'IN'`.
- [ ] **2.4 Numbering helper:** `nextInvoiceNumber(type)` per spec §4 (prefix map, YYYY from
  the pinned TODAY, scan-until-unused).
- [ ] **2.5 queries.ts:** rename `qk.invoices`→`qk.shipmentInvoices`, `useInvoices`→
  `useShipmentInvoices` (update DashboardPage import + `useInvalidateTrade`). Add qk keys +
  hooks: `useTradeInvoices(side)`, `useTradeInvoice(id)`, `useContractRemaining(contractId, side)`,
  `useWarehouses`, `useInventoryDocuments`, `useStockLevels`, mutation hooks for every 2.2
  function, `useInvalidateInvoices(side)` helper (invalidates tradeInvoices/tradeInvoice/
  contractRemaining + inventory/stock + payments/accounts/kpis/executiveSummary/customerPortal).
- [ ] **2.6 Gate + commit:** `git add src/services/api.ts src/services/queries.ts src/pages/dashboard/DashboardPage.tsx`
  → `feat(invoicing): trade-document api + query hooks (chain, stock, payments direction)`

## Task T3 — Routes, nav, RBAC, stubs, i18n skeleton  (Phase A)

**Files:** Modify `src/config/constants.ts`, `src/config/roles.ts`, `src/routes/index.tsx`,
`src/components/layout/SidebarNav.tsx`, `src/pages/dashboard/DashboardPage.tsx`, 3 locale
files. Create stub pages + `src/hooks/useTabParam.ts`. Delete `src/pages/invoices/`.

- [ ] **3.1 ROUTES:** remove `invoices`; add `purchase: '/app/invoices/purchase'`,
  `sale: '/app/invoices/sale'`, `warehouse: '/app/warehouse'`.
- [ ] **3.2 roles.ts:** Manager/Staff swap `invoices` → `purchase, sale, warehouse`.
  **CEO and Customer arrays byte-identical** (spec §9). NAV_ITEMS: replace invoices entry
  with `purchase` (finance, 'shoppingcart'), `sale` (finance, 'tags'), `warehouse`
  (operations, 'gold'). SidebarNav ICONS: add ShoppingCartOutlined/TagsOutlined/GoldOutlined.
- [ ] **3.3 RoleRoute:** widen prop to `routeKey: RouteKey | RouteKey[]`, any-of check.
- [ ] **3.4 routes/index.tsx:** flat sibling paths `invoices/purchase`, `invoices/sale`,
  `warehouse` (RoleRoute single keys), `invoices/:id` + guard `['purchase','sale']`;
  `invoices/:id/print` INSIDE RequireAuth, OUTSIDE AppLayout (spec §9). Remove old invoices
  route + lazy import; delete `src/pages/invoices/InvoicesPage.tsx`.
- [ ] **3.5 useTabParam** (`src/hooks/useTabParam.ts`) — exact code:

```ts
import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** URL-synced tab state: validates ?tab=, writes the default in on mount (replace). */
export function useTabParam<T extends string>(validKeys: readonly T[], defaultKey: T) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: T = validKeys.includes(raw as T) ? (raw as T) : defaultKey;
  useEffect(() => {
    if (raw !== tab) {
      const next = new URLSearchParams(params);
      next.set('tab', tab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, tab]);
  const setTab = useCallback((value: T) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    setParams(next, { replace: true });
  }, [params, setParams]);
  return [tab, setTab] as const;
}
```

- [ ] **3.6 Stubs:** PurchasePage/SalePage/WarehousePage/InvoiceDetailPage/InvoicePrintPage
  render `<PageHeader title={t(...)}/>` only — enough to compile + route.
- [ ] **3.7 DashboardPage:** `navigate(ROUTES.invoices)` → `navigate(ROUTES.sale)`.
- [ ] **3.8 i18n:** add `nav.purchase/sale/warehouse` + page titles/subtitles
  (`tradeInvoices.purchaseTitle/saleTitle/...`, `warehouse.title/...`) in en/ar/fa.
  Prune `invoices.*` EXCEPT `totalPaid, amount, status, totalInvoiced` (spec §12);
  delete `nav.invoices`. Re-grep `t('invoices.` first.
- [ ] **3.9 Gate + commit** (add each touched/created file; use `git rm -r src/pages/invoices`)
  → `feat(invoicing): routes, role-gated nav, tab-param hook, page stubs`
  **Manual check in review:** roles.ts diff shows NO change to CEO/Customer lines.

## Task T4 — Purchase/Sale list tabs + create modal  (Phase B)

**Files:** Create `InvoiceListTabs.tsx`, `CreateInvoiceModal.tsx`, `statusColors.ts`;
fill `PurchasePage.tsx`/`SalePage.tsx`; locale files.

- [ ] `statusColors.ts`: `INVOICE_STATUS_COLOR: Record<InvoiceStatus, string>` —
  DRAFT 'default', CONFIRMED 'success', CANCELLED 'default' rendered dim; helper Tag
  component `InvoiceStatusTag` using `tradeInvoices.status.*` keys. (Do NOT touch shared StatusTag, spec §10.)
- [ ] `InvoiceListTabs` (prop `side`): `useTabParam(['order','provisional','invoice'],'order')`;
  Tabs items with per-type counts; table per spec §10 row (number mono, date, contract id,
  customer name, items count, totalAmount `<Money/>`, `InvoiceStatusTag`, sent Tag when
  sentAt); row click `navigate('/app/invoices/'+id)` (push); "New order/provisional/invoice"
  button per active tab → CreateInvoiceModal with the mapped InvoiceType.
- [ ] `CreateInvoiceModal` (props open/onClose/invoiceType): contract Select filtered to
  side-matching contracts (ACTIVE first, label `id — customerName`), customer shown
  read-only from selection, date (default TODAY), number (prefilled `nextInvoiceNumber`
  via a small api getter or computed client-side from the list — prefer api function
  `previewInvoiceNumber(type)` added in T2 if missing add it now), currency USD/AED +
  exchangeRate (locked 1 for USD), description. Submit → `useCreateInvoice` →
  navigate to detail. Modal idioms: `key`, `initialValues`, `destroyOnHidden`,
  `preserve={false}`, `App.useApp()`.
- [ ] i18n for all new strings (en/ar/fa, interpolated). Follow CustomersPage/ContractsPage
  idioms for tables/tabs. Gate + commit → `feat(invoicing): purchase/sale list tabs + create dialog`

## Task T5 — Invoice detail page + add-items  (Phase B)

**Files:** Fill `InvoiceDetailPage.tsx`; create `AddItemsModal.tsx`; locale files.

- [ ] Detail layout: PageHeader (number + type Tag + `InvoiceStatusTag` + sent Tag), chain
  links (Reference → refInvoice, Converted-to → successor; Button type link, icon), header
  Descriptions (date/contract link/customer/currency/fx/description/totals). Items Table:
  product, qty MT, LME % , fixed Tag, price basis (fixedPrice or lmePrice+lmeDate or "—"),
  unit price (`invoiceItemUnitPrice` render "—" when null), discount %, amount Money,
  BL No, container No (BL/container/description editable inline ONLY while DRAFT —
  use a row-edit modal, not inline inputs, to stay simple: "Edit line" action opening a
  small form modal with qty/blNumber/containerNo/description/discountPercent).
- [ ] DRAFT actions: Edit header (reuse CreateInvoiceModal in edit mode — contract locked),
  Add items, Confirm, Cancel. CONFIRMED: Convert (Dropdown menu of legal targets §5),
  Send (provisional/final; `markInvoiceSent`), Print/Download (navigate print route),
  Record payment (provisional/final — T9 wires the modal; render the button disabled with
  tooltip until then is NOT acceptable — instead omit until T9), Cancel. Enforce ONE open
  modal via single `activeModal: 'edit'|'items'|'confirm'|null` state (spec §10).
- [ ] `AddItemsModal`: ONE Form + Form.List keyed by contract-item id (spec §10 — never
  index keys). Source rows = `useContractRemaining(contractId, side)` minus items already
  on the doc; checkbox select + qty InputNumber (max = uninvoicedMt, precision 2) per row;
  "Insert all from contract" button selects every remaining row at full uninvoicedMt.
  Submit → `useAddInvoiceItems`. Show "{{added}} of {{total}} MT uninvoiced" hints.
- [ ] Pricing panel (DRAFT provisional/final only): Card with lmeDate DatePicker, lmePrice
  InputNumber, discount InputNumber (optional) + "Apply to all" → `useApplyLmePrice`;
  per-item discount editable via row-edit modal. Sale-final DRAFT: available-stock column
  with warning color when qty > stock (uses `useStockLevels`).
- [ ] Confirm flow → `ConfirmInvoiceModal` (T6 file, create here if simpler): totals summary;
  warehouse Select (final invoices only; active warehouses; default first;
  `tradeInvoices.noActiveWarehouse` alert + disabled OK when none); error toasts map api
  codes → i18n (`missingLmePrice`, `qtyExceedsRemaining`, `insufficientStock` with
  {{product}}/{{available}}, `noItems`). Cancel flow: Popconfirm + code map
  (`cancelBlockedSuccessor`, `cancelBlockedStock`). After confirming a final invoice show
  the remaining-qty Alert (spec §5, `tradeInvoices.uninvoicedMt` lines).
- [ ] i18n en/ar/fa. Gate + commit → `feat(invoicing): invoice detail, item management, lifecycle actions`

## Task T6 — Print view  (Phase B)

**Files:** Fill `InvoicePrintPage.tsx`; locale files (print labels).

- [ ] Own root: `<ConfigProvider theme={getLightTheme()} direction={i18n.dir()}>` nested
  (import the light token builder used in `src/theme/tokens.ts` / App.tsx — reuse, don't
  duplicate) wrapping `<div dir={i18n.dir()} className="invoice-print-root">`. NO
  Layout/Sider reuse (spec §10). A4 editorial design: brand letterhead (BRAND palette,
  copper rules), doc-type title (localized), header grid, items table (plain HTML table
  or borderless AntD Table), totals block (subtotal, discount, total; AED equivalent when
  exchangeRate ≠ 1), BL/container per line, signature strip, `font-variant-numeric:
  tabular-nums`. `@media print { .no-print { display:none } }` + `@page { size: A4; margin: 14mm }`
  (style tag local to the page). Print + Back buttons (`no-print`).
- [ ] Gate + commit → `feat(invoicing): A4 print document view (light-forced, RTL-safe)`

## Task T7 — Warehouse module  (Phase C)

**Files:** Fill `WarehousePage.tsx`; create `WarehouseFormModal.tsx`; locale files.

- [ ] Tabs via `useTabParam(['warehouses','inventory'],'warehouses')`.
  *Warehouses tab*: table name/code(mono Tag)/location/status Tag/actions (Edit +
  activate-toggle Popconfirm with try/catch — PartnersPage idiom exactly); New button →
  WarehouseFormModal (name required, code required+immutable-on-edit, location optional).
  *Inventory tab*: stock summary Cards per warehouse (Σ MT per product, from
  `useStockLevels`), documents table (docNumber mono, IN blue/OUT gold Tag, warehouse
  name, date, invoiceNumber link → `/app/invoices/:invoiceId`, status) with expandable
  rows listing items (product, qty MT).
- [ ] i18n en/ar/fa (`warehouse.*`). Gate + commit → `feat(invoicing): warehouse + inventory module`

## Task T8 — Sale flow verification pass  (Phase C)

No new files expected — B components are side-generic. Walk the sale flow in code review
terms: SalePage tabs, SELL-contract filtering in CreateInvoiceModal, SO→SP→SI convert
targets, OUT doc on SI confirm, stock guard + live stock column, print view for sale types
(title/labels). Fix anything side-hardcoded. Gate + commit (only if changes) →
`fix(invoicing): sale-side wiring gaps`

## Task T9 — Payments on invoices  (Phase D)

**Files:** Create `RecordPaymentModal.tsx`; modify `InvoiceDetailPage.tsx`,
`src/pages/payments/PaymentsPage.tsx`; locale files.

- [ ] `RecordPaymentModal`: date (default TODAY), currency USD/AED, fxRate (locked 1 USD;
  AED default `useSettingsStore.fxRate`), amount, method Select (existing PaymentMethod
  values), notes. Submit → `useCreatePayment` (invoiceId bound).
- [ ] Detail Payments card (CONFIRMED provisional/final): chain payments table (number
  recorded-on, date, method, amountUSD), paidUSD/remainingUSD Statistics + Progress
  (cap 100%, show over-payment delta text). "Record payment" button (joins the single-
  modal state machine).
- [ ] PaymentsPage: direction Tag column (IN green / OUT gold; undefined → IN), invoice
  number column when invoiceId present (link to detail).
- [ ] i18n en/ar/fa. Gate + commit → `feat(invoicing): multi-payment settlement on invoices`

## Task T10 — Final review + live verify  (Phase D)

- [ ] Full-diff adversarial review (subagents, lenses: spec-compliance / bugs / antd-rtl-i18n /
  regressions incl. determinism + RBAC). Fix findings.
- [ ] Live verify on the preview server (see CLAUDE.md smoke): per-role menu correctness
  (CEO no purchase/sale/warehouse; Customer portal-only; Staff no payments/reports);
  purchase chain create→items→price→confirm(GRN)→convert; sale SI stock guard (over-sell
  → blocked); cancel guards; payment on PP counted on PI; tab refresh persistence;
  print view light+RTL; `finora-db-v2` persistence survives reload;
  cust-am creditLimit === 2,750,000; console clean.
- [ ] Commit fixes → final report to user (commit/push/deploy only on request).

## Self-review notes (writing-plans checklist)

- Spec coverage: §2→T1, §3→T1/T5, §4→T2, §5→T2/T5, §6→T2/T7, §7→T2/T9, §8→T2, §9→T3,
  §10→T4–T7, §11→T1, §12→T3–T9 (per-task keys), §14 phases→task grouping. No gaps found.
- Type-name consistency: `invoiceItemUnitPrice`/`invoiceItemAmount` (calc), `useTabParam`,
  `INVOICE_STATUS_COLOR`, hook names in T2.5 reused verbatim in T4–T9.
- No placeholders: every task names files, behavior contracts, error codes, i18n keys.
  Full code given where determinism/subtlety demands it (calc, useTabParam, seed rules);
  UI tasks bind to named existing idiom files.
