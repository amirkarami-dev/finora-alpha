# Trade Documents (Invoices) + Warehouse + Payments — Design

Date: 2026-07-05 · Branch: `feature/invoices-warehouse-payments` · Status: approved design, pre-implementation

## 1. Overview

Replace the read-only, container-derived "Invoices" list with a real **trade document system**:
six document types (purchase/sale × order/provisional/invoice) sharing one `Invoice` +
`InvoiceItem` entity pair (ERP "document type" pattern), a conversion chain
(order → provisional → final invoice) linked by `refInvoiceId`, a **warehouse/inventory**
module fed by confirmed final invoices, and **multiple payments** per provisional/final
invoice. Journal/accounting is explicitly **out of scope**.

User-approved decisions:
- Single `Invoice`/`InvoiceItem` with `invoiceType` discriminator (not 6 entities).
- Old Invoices page/nav **replaced** by Purchase + Sale menu items; the derived view is
  **kept internally** (renamed `ShipmentInvoice`) because Dashboard and Customer Portal use it.
- Download = polished A4 print view (browser print-to-PDF). "Send" = simulated (`sentAt` + toast).
- One "Warehouse" menu item with two tabs (Warehouses CRUD, Inventory documents).
- No unit-price master entity (`unitPriceId` dropped) — prices live on invoice items.

## 2. Data model (`src/types/index.ts`) — SCHEMA_VERSION → 2

```ts
export type InvoiceType =
  | 'PURCHASE_ORDER' | 'PURCHASE_PROVISIONAL' | 'PURCHASE_INVOICE'
  | 'SALE_ORDER' | 'SALE_PROVISIONAL' | 'SALE_INVOICE';
export type InvoiceStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
export type InvoiceSide = 'PURCHASE' | 'SALE'; // derived helper union

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  /** Source goods line on the contract. */
  contractItemId: string;
  product: string;
  quantityMt: number;
  // Copied from the contract item at insertion; read-only in ALL document types:
  lmePercent: number;
  lmeFixed: boolean;
  fixedPrice: number;   // contract Item.fixedLmePrice
  premium: number;
  // Set on provisional/final documents (kept per item even when applied to all):
  lmePrice?: number;    // LME quotation used for floating (lmeFixed=false) lines
  lmeDate?: string;     // ISO date of that quotation
  discountPercent?: number; // 0–100
  /** Line value in invoice currency; 0 when price incomplete (floating line without lmePrice). */
  amount: number;
  blNumber?: string;
  containerNo?: string;
  description?: string;
}

export interface Invoice {
  id: string;               // e.g. 'inv-po-0001' (prefix by type, zero-padded counter)
  invoiceNumber: string;    // e.g. 'PO-2026-0001' — auto-generated, editable while DRAFT
  invoiceType: InvoiceType;
  invoiceDate: string;      // ISO date
  contractId: string;
  customerId: string;       // auto-set from contract; immutable
  status: InvoiceStatus;
  currency: Currency;       // default 'USD'
  exchangeRate: number;     // AED per USD; 1 when currency === 'USD'
  description?: string;
  /** Document this one was converted FROM (order→provisional→invoice chain). */
  refInvoiceId?: string;
  /** Simulated e-mail send timestamp (provisional/final only). */
  sentAt?: string;
  // Persisted totals (recomputed on every item mutation):
  totalAmount: number;      // Σ item.amount
  totalDiscount: number;    // Σ discount value in currency (pre-discount − post-discount)
  totalWeightMt: number;    // Σ item.quantityMt
  createdAt: string;
}

export interface Warehouse {
  id: string;               // 'wh-mw'
  name: string;
  code: string;
  location?: string;
  active: boolean;
}

export type InventoryDocType = 'IN' | 'OUT';

export interface InventoryDocument {
  id: string;
  docNumber: string;        // 'GRN-2026-0001' (IN) / 'GDN-2026-0001' (OUT)
  warehouseId: string;
  /** Final invoice that produced this movement (undefined for future manual docs). */
  invoiceId?: string;
  type: InventoryDocType;
  date: string;
  status: 'CONFIRMED' | 'CANCELLED';
  notes?: string;
  items: InventoryDocumentItem[];
}

export interface InventoryDocumentItem {
  id: string;
  documentId: string;
  invoiceItemId?: string;
  product: string;
  quantityMt: number;
}

export interface Payment {
  // existing fields unchanged, plus:
  invoiceId?: string;       // provisional or final invoice this payment settles
}
```

**Rename**: existing container-derived `Invoice` interface → `ShipmentInvoice`
(same fields). Touchpoints: `types/index.ts`, `api.ts` (`buildInvoices(): ShipmentInvoice[]`,
`getInvoices`, `CustomerPortalSummary.openInvoices`), `pages/portal/CustomerPortalPage.tsx`.
`DashboardPage` uses the hook only — no type import change needed there (verify).
`api.getInvoices`/`queries.useInvoices` are **kept** (they feed Dashboard + Portal).

**mock/data.ts**: bump `SCHEMA_VERSION` to 2. `db` gains `invoices: Invoice[]`,
`invoiceItems` embedded on each invoice as `items: InvoiceItem[]`? — **No**: keep
normalized-lite like contracts: `Invoice` stored WITH `items: InvoiceItem[]` embedded
(mirrors `Contract.items` convention). `db` also gains `warehouses`, `inventoryDocs`.
`isCompatible()` extended: presence checks `Array.isArray(o.invoices) && Array.isArray(o.warehouses) && Array.isArray(o.inventoryDocs)`
plus first-element probes (`invoices[0].invoiceType`, `warehouses[0].active`).

> NOTE: embedding items on Invoice deviates from the user's SQL-ish framing
> (`invoiceItem` entity) only in storage; the type is still a distinct exported
> interface and the future API contract keeps `InvoiceItem[]` as its own DTO.

## 3. Pricing & totals

```
base(item)      = item.lmeFixed ? item.fixedPrice : item.lmePrice   // undefined ⇒ incomplete
unitPrice(item) = base * (item.lmePercent / 100) + item.premium     // USD/MT
gross(item)     = unitPrice * item.quantityMt
amount(item)    = gross * (1 − (item.discountPercent ?? 0) / 100)
```

- Floating line without `lmePrice` ⇒ `amount = 0`, UI renders “—” (matches goods-form behavior).
- Currency: items are priced in USD (LME is USD). If header `currency === 'AED'`,
  display totals converted via `exchangeRate` **at render time**; stored amounts stay USD.
  (Header currency/exchangeRate kept for the future backend; default USD/1.)
- Totals recomputed and persisted on the header after every item change and on confirm.
- Reuse `utils/calc.ts` `unitPrice()` where signature fits; add a small
  `invoiceItemAmount(item)` helper in `utils/calc.ts` (pure, unit-testable).

**Confirm guard**: a provisional/final document cannot be CONFIRMED while any floating
line lacks `lmePrice` (error toast `tradeInvoices.missingLmePrice`). Orders CAN be
confirmed with incomplete prices (they are quantity commitments).

## 4. Numbering

`invoiceNumber = '<PFX>-<YYYY>-<NNNN>'`, PFX ∈ {PO, PP, PI, SO, SP, SI} by type;
YYYY from `TODAY` (pinned dayjs); NNNN = zero-padded (count of existing documents of that
type + 1, incrementing until unused — robust to edited numbers). Editable while DRAFT.
Inventory docs: GRN- (IN) / GDN- (OUT), same scheme. Ids: `inv-<pfx>-<NNNN>` lowercase,
`invitem-<n>` counter, `idoc-<n>`, `wh-<code>`.

## 5. Lifecycle, conversion, remaining quantity

```
DRAFT ──confirm──▶ CONFIRMED ──cancel──▶ CANCELLED
  └─────cancel──▶ CANCELLED
```

- DRAFT: everything editable (header + items). CONFIRMED: read-only (except convert/send/
  download/payments). CANCELLED: read-only, excluded from all aggregations.
- "Approve" in the user's scenario = **confirm**.
- **Convert** (button on detail page, CONFIRMED docs only):
  PO → PP or PI; PP → PI; SO → SP or SI; SP → SI.
  Creates a new DRAFT of the target type copying header (new number/id/date=TODAY,
  status DRAFT, `refInvoiceId = source.id`) and all items (fresh item ids; carry
  lmePrice/lmeDate/discount if already set). A source with a non-cancelled successor
  hides its Convert button (one active successor per document).
- **Chain links**: detail page shows "Reference" link to `refInvoiceId` doc and a
  "Converted to" link to any successor (doc whose refInvoiceId = this id, not cancelled).
- **Remaining contract quantity** (per contract item, per side):
  `remaining = contractItem.quantityMt − Σ quantityMt of *chain-leaf* CONFIRMED docs of that side`
  where chain-leaf = CONFIRMED doc with no non-cancelled successor (so a PO fully
  converted to a PI is not double-counted; the PI counts instead).
  Enforced when editing item quantity in any DRAFT doc (max = remaining + this doc's own
  current claim on that line) and surfaced in the add-items modal (“x of y MT remaining”).
  After confirming a final invoice, the detail page shows an alert listing each contract
  item's remaining MT so the user knows whether another document is possible.

## 6. Warehouse & inventory

- Seed: one warehouse `wh-mw` “Main Warehouse” code `MW`, location “Jebel Ali, Dubai”, active.
- **Purchase-invoice confirm**: modal asks for target warehouse (Select, default first
  active) → on confirm creates CONFIRMED `IN` InventoryDocument (invoiceId set, one line
  per invoice item with `invoiceItemId`).
- **Sale-invoice confirm**: same modal (source warehouse). Validates per product:
  `qty ≤ stock(warehouseId, product)`; on shortfall, error toast with product + available
  (`tradeInvoices.insufficientStock`, interpolated) and NO state change. Success creates
  CONFIRMED `OUT` document.
- `stock(warehouseId, product) = Σ IN − Σ OUT` over CONFIRMED inventory docs.
- **Cancelling a confirmed final invoice** also sets its inventory document to CANCELLED
  (stock restored implicitly). Cancelling a sale invoice's OUT doc is always safe;
  cancelling a purchase invoice's IN doc is allowed even if it would drive computed stock
  negative for already-shipped sales — mock-data simplicity, noted in UI copy? **No**:
  block cancel of a purchase invoice when resulting stock of any of its products would go
  negative (`tradeInvoices.cancelBlockedStock` toast). Deterministic and safe.
- **Warehouse page** (`/app/warehouse?tab=warehouses|inventory`):
  - Tab *Warehouses*: table (name, code, location, status, actions Edit / activate-toggle
    with Popconfirm+try/catch — same idiom as Partners), New button → WarehouseFormModal
    (name, code immutable-on-edit, location). Deactivate hidden while stock > 0? Keep
    simple: allow deactivate; inactive warehouses excluded from confirm-modal picker.
  - Tab *Inventory*: stock-level summary cards (per warehouse: Σ product MT) above a
    table of inventory documents (docNumber, type Tag IN/OUT, warehouse, date, linked
    invoiceNumber → navigates to invoice detail, status) with expandable rows showing items.

## 7. Payments

- `PaymentInput` gains optional `invoiceId`. New api `createPayment(input)` used by a
  **RecordPaymentModal** on CONFIRMED provisional/final detail pages (date default TODAY,
  currency, fxRate (locked 1 for USD, default settings fx for AED), amount, method, notes).
  Multiple payments allowed; no overpay block (real desks over/under-settle) but the
  progress bar caps at 100% and shows the delta.
- Invoice detail “Payments” card: table of payments for this invoice + `paidUSD`,
  `remainingUSD = max(totalAmountUSD − paidUSD, 0)` and a Progress bar.
- Payments recorded this way also appear on the global Payments page (they're the same
  `db.payments` rows; `customerId` from invoice). `reference` auto-set to invoiceNumber.

## 8. API surface (`src/services/api.ts`)

DTOs (future backend contract): `InvoiceInput { invoiceType, contractId, invoiceDate,
invoiceNumber?, currency?, exchangeRate?, description? }`, `InvoiceItemInput
{ contractItemId, quantityMt, blNumber?, containerNo?, description? }`,
`WarehouseInput { name, code, location? }`, `PaymentInput { … existing …, invoiceId? }`.

Functions (all persist via `persistDb()`; throw string codes on rule violations):
- `getTradeInvoices(side: InvoiceSide)` — headers + counts; `getTradeInvoice(id)` —
  header, items, contract/customer names, chain (ref + successor), payments.
- `createInvoice(input)` (DRAFT, auto number/id/customer), `updateInvoiceHeader(id, patch)`
  (DRAFT only), `deleteDraftInvoice`? — **No** (cancel covers it; YAGNI).
- `addInvoiceItems(invoiceId, items: InvoiceItemInput[])` (copies pricing snapshot from
  contract item, validates remaining qty), `updateInvoiceItem(invoiceId, itemId, patch)`
  (qty/BL/container/desc/discount), `removeInvoiceItem(invoiceId, itemId)`.
- `applyLmePrice(invoiceId, { lmeDate, lmePrice, discountPercent? })` — sets on all
  floating items (and discount on ALL items when provided), recomputes totals.
- `confirmInvoice(id, { warehouseId? })` — guards: ≥1 item, prices complete
  (provisional/final), stock (sale-invoice); creates inventory doc (final invoices;
  warehouseId required there). `cancelInvoice(id)` — cancels + cascades inventory doc,
  guarded per §6. `convertInvoice(id, targetType)` per §5. `markInvoiceSent(id)`.
- `getContractRemaining(contractId, side)` — per contract item: quantityMt, remainingMt.
- `getWarehouses()`, `createWarehouse`, `updateWarehouse`, `setWarehouseActive`,
  `getInventoryDocuments()`, `getStockLevels()` — `[{ warehouseId, product, mt }]`.
- `createPayment(input)`; `getInvoicePayments(invoiceId)` folded into `getTradeInvoice`.

**Query hooks** (`queries.ts`): `qk.tradeInvoices(side)`, `qk.tradeInvoice(id)`,
`qk.contractRemaining(contractId, side)`, `qk.warehouses`, `qk.inventory`, `qk.stock`.
Mutations invalidate: trade lists + detail + contractRemaining + (on confirm/cancel of
finals) inventory/stock + (payments) payments/accounts/kpis/customerPortal(customerId).
A shared `useInvalidateInvoices(side, customerId?)` helper mirrors `useInvalidateTrade`.

## 9. Routing, nav, RBAC

`config/constants.ts` ROUTES: replace `invoices: '/app/invoices'` with
`purchase: '/app/invoices/purchase'`, `sale: '/app/invoices/sale'`,
`warehouse: '/app/warehouse'`. (Detail/print built by template:
`/app/invoices/:id`, `/app/invoices/:id/print` — static segments win over `:id` in RR6.)

`config/roles.ts`: RouteKey picks the new keys up automatically. ROLE_ACCESS: Manager and
Staff swap `invoices` → `purchase, sale, warehouse`; CEO/Customer unchanged. NAV_ITEMS:
`purchase` (finance, icon 'shoppingcart'), `sale` (finance, icon 'tags'), `warehouse`
(operations, icon 'gold' — AntD `GoldOutlined`, warehouse-ish). Remove `invoices` entry.
SidebarNav ICONS map gains the three icons. i18n `nav.purchase`, `nav.sale`,
`nav.warehouse`; old `nav.invoices` key deleted from all three locales.

`routes/index.tsx`: guarded routes — purchase/sale/warehouse pages (Manager+Staff via
existing RoleRoute mechanism), `invoices/:id` detail + `invoices/:id/print` (print route
rendered INSIDE RequireAuth but OUTSIDE AppLayout so it has no chrome). Old
`/app/invoices` list route removed; `src/pages/invoices/InvoicesPage.tsx` deleted.
Detail/print routes use access key `purchase` OR `sale`? — RoleRoute takes one key; use a
shared guard allowing any of `purchase|sale` (both roles have both; simplest: guard on
`purchase`).

## 10. Pages & components (new folder `src/pages/tradeInvoices/`)

| File | Responsibility |
|---|---|
| `PurchasePage.tsx` / `SalePage.tsx` | thin wrappers → `<InvoiceListTabs side="PURCHASE|SALE" />` |
| `InvoiceListTabs.tsx` | Tabs order/provisional/invoice with counts; **tab in `?tab=` via useSearchParams (replace:true)** so refresh keeps the tab; per-tab table: number, date, contract id, customer, items count, total (Money), status StatusTag-style Tag, sent Tag; row click → detail; “New …” button per tab → CreateInvoiceModal |
| `CreateInvoiceModal.tsx` | contract Select (side-matching contracts, ACTIVE first, shows id+customer; sets customer read-only field), date (default TODAY), auto number (editable), currency+fx (USD/1 defaults), description → create → navigate to detail |
| `InvoiceDetailPage.tsx` | header Descriptions + status/type/sent Tags + chain links (ref/successor buttons); actions by state: DRAFT → Edit header, Add items (magic “Insert all from contract” + multi-select modal), edit/remove item rows, Confirm, Cancel; CONFIRMED → Convert menu, Send, Download/Print, Record payment (provisional/final), Cancel; pricing panel (provisional/final, DRAFT): LME date+price + discount% “apply to all” + per-item discount editing; payments card (§7); remaining-qty alert after final-invoice confirm |
| `AddItemsModal.tsx` | contract goods multi-select table (product, contract qty, remaining MT, already-added disabled), qty editable per row before insert, validation vs remaining |
| `ConfirmInvoiceModal.tsx` | warehouse Select (final invoices), summary of totals, stock warnings (sale) |
| `RecordPaymentModal.tsx` | §7 fields, App.useApp messages |
| `InvoicePrintPage.tsx` | A4 document: brand letterhead (BRAND palette), doc-type title, header grid (number/date/contract/customer/currency/terms), items table (product, qty MT, LME %, price basis, unit price, discount, amount, BL No, container No), totals block (subtotal/discount/total, AED equivalent when fx≠1), signature strip; print CSS `@media print` + a Print button hidden on print; **RTL-safe & theme-independent (always light)** |
| `src/pages/warehouse/WarehousePage.tsx` | §6 tabs, `?tab=` persisted |
| `src/pages/warehouse/WarehouseFormModal.tsx` | name/code/location, Partners-modal idiom |

Shared idioms (mandatory): `App.useApp()` messages, modal `key`+`initialValues`+
`destroyOnHidden`+`preserve={false}`, `onCell` stopPropagation for action columns,
`Money`/`formatDate`/`formatMt`, logical CSS only, i18n keys in en+ar+fa (interpolated,
never JSX-concatenated), colors via `theme.useToken()`/BRAND.

**UI direction** (frontend-design + ui-ux-pro-max): stays inside Finora's existing AntD
copper-accent system — no new aesthetic universe for list pages. The **print view** is
the showcase surface: editorial document design, generous whitespace, tabular numerals,
copper rule lines, clear totals hierarchy. Tabs use counts badges; status flow rendered
with step-like Tag colors: DRAFT default, CONFIRMED success, CANCELLED default-dim,
IN blue / OUT gold tags for inventory.

## 11. Seed data — determinism rules

Appended in `mock/data.ts` AFTER the partner-allocation post-pass, **using zero PRNG
draws** (fixed indices/dates only — existing seeded values must not shift):
1. `warehouses = [wh-mw]`.
2. First PURCHASE contract (by array order): full chain — CONFIRMED `PO-2026-0001`
   (all contract items, full qty), CONFIRMED `PP-2026-0001` (ref PO; lmeDate
   2026-05-20, lmePrice = each item's fixedPrice or a fixed constant 2450 for floating
   lines, discount 0), CONFIRMED `PI-2026-0001` (ref PP; same prices) + CONFIRMED
   `GRN-2026-0001` IN doc to wh-mw. One payment of 50% of PI total (method 'TT',
   date 2026-06-01, invoiceId set).
3. First SELL contract: DRAFT `SO-2026-0001` with its first item at 50% qty (rounded 2dp).
4. Dates fixed literals; all totals computed via the same calc helpers (single source).

## 12. i18n

New namespaces `tradeInvoices.*` (~60 keys: tabs, columns, actions, statuses, types,
confirm/cancel/convert/send flows, validation messages with `{{product}}`/`{{available}}`/
`{{remaining}}` interpolation, print labels), `warehouse.*` (~25 keys), `nav.purchase`,
`nav.sale`, `nav.warehouse`. All in en/ar/fa, ar/fa translated (not transliterated).
Existing `invoices.*` keys kept ONLY where still used by Portal open-invoice table; unused
keys removed. No table-header key reused as a form label.

## 13. Out of scope

Journal/accounting entries; real e-mail; manual inventory documents (schema supports
them via optional `invoiceId` but no UI); multi-currency item pricing; customer-portal
visibility of sale documents; CSV export.

## 14. Phases

- **A** Types + schema v2 + seed + calc helper + full api/query surface + routes/nav/RBAC
  skeleton + i18n batch 1 (build stays green with pages stubbed).
- **B** Purchase UX: list tabs, create modal, detail page, add-items, pricing panel,
  confirm/cancel/convert, print view.
- **C** Sale UX (mirror via shared components — mostly wiring) + warehouse page + stock
  guards.
- **D** Payments on invoices + Dashboard/Portal regression pass + final adversarial
  review + live smoke (login as Manager & Staff & CEO & Customer: menu correctness per
  role) + determinism check (cust-am creditLimit 2,750,000).

Each phase: `npm run typecheck && npm run lint && npm run build` green, separate commit.
