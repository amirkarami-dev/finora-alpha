# Warehouse conversion documents and stock cost — design

Date: 2026-09-03. Status: approved by the owner in chat (2026-09-03).

## 1. Goal

The desk buys copper cable, strips it, melts it and sells ingots. Today the app can only
receive what a purchase invoice says and issue what a sale invoice says; nothing can turn
one stock item into another, and no stock item carries a cost. This feature adds:

1. A **Conversion document** in the Warehouse: some stock goes OUT, other stock comes IN,
   workshop costs are added, and the cost follows the metal.
2. A **cost per MT** on every stock movement, so the Inventory tab can show what stock is
   worth and a sale invoice can show its cost of sales and margin.

Owner decisions (2026-09-03): quantities AND cost; workshop costs typed on the conversion
and booked automatically as an expense on the workshop person; Staff creates the draft,
Manager confirms; several outputs allowed, cost split by weight unless shares are given;
cost is **stored at confirm time** (approach A), not recomputed on read.

## 2. Domain

### 2.1 Conversion document (new)

| Field | Type | Notes |
|---|---|---|
| `id` | string | `cnv-0001`, sequential like `cc-0001` |
| `docNumber` | string | `CNV-YYYY-NNNN`, first free number per year, like GRN/GDN |
| `warehouseId` | string | inputs leave and outputs arrive in the same warehouse |
| `date` | date | Gulf time for the year in the number |
| `status` | `DRAFT` / `CONFIRMED` / `CANCELLED` | |
| `notes` | string? | |
| `chargeDocId` | string? | the GENERAL expense document booked on confirm (null when there are no cost lines) |
| `totalInputCostUsd` | decimal | stored on confirm |
| `totalAddedCostUsd` | decimal | stored on confirm |
| `createdAt` | timestamp | |

**Input line** (`conversion_inputs`): `id`, `documentId`, `product` (name, stock key like
inventory items), `quantityMt`, `unitCostUsd` (stored on confirm = average cost at that
moment), `costUsd` (= quantity × unit cost, rounded).

**Output line** (`conversion_outputs`): `id`, `documentId`, `product`, `quantityMt`,
`sharePercent` (nullable; when null the weight share is used), `unitCostUsd`, `costUsd`
(both stored on confirm).

**Cost line** (`conversion_costs`): `id`, `documentId`, `categoryId` (an EXPENSE category
with scope GENERAL), `personId` (who is paid — the workshop, the gas supplier…), `amount`,
`currency`, `fxRate`, `amountUsd` (server-derived like charge lines), `description?`.

Rules:
- At least one input and one output to confirm. Products are free text picked from Goods,
  keyed for stock exactly like inventory items (trimmed, lower-cased).
- An output product may equal an input product (re-melt): stock math still works.
- Yield = Σ output MT ÷ Σ input MT, shown on the document; no rule forces it ≤ 100 %.
- Shares, when given, must sum to 100 (± 0.01); a mix of given and null shares is refused
  (`invalid-shares`).

### 2.2 Cost on every movement

`InventoryDocumentItem` gains `unitCostUsd` (decimal, default 0) and `costUsd`:

- **Receipt from a purchase invoice** (GRN, created on invoice confirm or by hand): unit cost
  = the invoice line's `amount ÷ exchangeRate ÷ quantityMt` in USD, i.e. the price per MT
  paid; `costUsd` = line quantity × unit cost.
- **Issue for a sale invoice** (GDN): unit cost = the average cost of that product in that
  warehouse at confirm time (§2.3); `costUsd` = quantity × unit cost. This is the cost of
  sales of that invoice line.
- Documents confirmed before this feature keep `unitCostUsd = 0`; the Inventory tab marks
  such stock "cost unknown" rather than pretending it is free.

### 2.3 Average cost — the one formula

For a warehouse and product, over every CONFIRMED movement dated up to now, in
chronological order (date, then creation order):

```
value  = Σ costUsd of receipts and conversion outputs − Σ costUsd of issues and conversion inputs
qty    = Σ MT of receipts and conversion outputs      − Σ MT of issues and conversion inputs
average unit cost = value ÷ qty          (0 when qty is 0)
```

Because every outgoing movement stored the average at its own confirm time, this is a
moving average without a separate table. It lives in one server class,
`Finora.Erp.Infrastructure.Trade.StockLedger` (`StockAsync` moves there from
`WarehouseDocumentService`, now returning quantity **and** value per key), and is
mirrored in `api.ts` only for display — the browser never decides a cost.

Money rounding goes through `Rounding.Money`; quantities through the existing 3-decimal
rounding.

### 2.4 Confirm and cancel

**Confirm** (`POST /api/erp/conversions/{id}/confirm`, permission `conversions.confirm`):
1. Status must be DRAFT; at least one input and one output; shares valid.
2. For each input: available stock (§2.3 qty) ≥ quantity, else `insufficient-stock` with the
   same `{ product, available }` payload the sale confirm uses. Inputs of the same product
   are summed before the check.
3. Each input gets `unitCostUsd` = current average, `costUsd` = qty × unit cost.
4. Cost lines: `amountUsd` per line; `totalAddedCostUsd` = Σ. If there is at least one cost
   line, create one `ChargeDoc` (direction EXPENSE, kind GENERAL, title
   `"Conversion CNV-YYYY-NNNN"`, one line per cost line with the same category, person,
   amount, currency, fx, description) through `ChargeService`, and store its id.
5. Total to distribute = `totalInputCostUsd + totalAddedCostUsd`. Each output's share =
   its `sharePercent`, or `quantityMt ÷ Σ output MT` when shares are null. `costUsd` =
   round(total × share); the last output absorbs the rounding remainder so the outputs sum
   exactly to the total. `unitCostUsd` = `costUsd ÷ quantityMt`.
6. Status → CONFIRMED. The whole step is one transaction.

**Cancel** (`POST …/cancel`, permission `warehouse`): DRAFT → CANCELLED freely.
CONFIRMED → CANCELLED only if, for every output product, current stock − that output's
quantity ≥ 0 (nothing downstream has consumed it) — otherwise `cancel-blocked-stock`, the
existing code. Cancelling also cancels the linked charge document.

**Edit** (`PUT /api/erp/conversions/{id}`, permission `warehouse`): DRAFT only, whole
document replaced (header + all three line lists). CONFIRMED documents are read-only.

### 2.5 Permissions

A new permission code **`conversions.confirm`** in `AccessCatalogue`, granted to
**Manager** only. It is not a route key: the sidebar ignores it, the `me` endpoint returns
it like any other, and the Confirm button shows only when the session has it. Create,
edit, cancel-draft and list use the existing `warehouse` key (Staff and Manager). The
front-end mirror (`roles.ts`) and the parity test gain the same entry.

### 2.6 Numbering

`CNV-YYYY-NNNN`: year from the date in Gulf time, first free number per year, following
`WarehouseDocumentService.NextNumberAsync`'s pattern (extended to a third prefix). Ids
`cnv-0001` via the existing `NextSequentialId`.

## 3. Server changes (`backend/`)

- Domain (`Trade.cs`): `ConversionDocument`, `ConversionInput`, `ConversionOutput`,
  `ConversionCost`; `InventoryDocumentItem.UnitCostUsd`, `.CostUsd`. Enum
  `DocumentStatus` already has DRAFT/CONFIRMED/CANCELLED (verify; add DRAFT if missing).
- Pure maths in the Domain project: `ConversionMath.Distribute(total, outputs)` (weight or
  share split with last-line remainder) and `ConversionMath.Yield`. Unit-tested.
- Infrastructure: `StockLedger` (quantity + value per key, average), `ConversionService`
  (create, update, confirm, cancel, list), EF configuration + one migration
  (`AddConversions`: three tables, two columns, indexes on `doc_number` unique,
  `warehouse_id`, `document_id`), endpoints under `/api/erp/conversions`, snapshot
  (`ErpSnapshot.Conversions`), `AccessCatalogue` permission.
- `WarehouseDocumentService`: receipts store unit cost from the invoice line; issues store
  the average; both use `StockLedger`.
- Error codes added to `contracts/error-codes.json`: `conversion-not-found`,
  `conversion-not-draft`, `conversion-empty` (no input or no output), `invalid-shares`,
  `cost-category-invalid` (category not EXPENSE/GENERAL or inactive). Reused:
  `insufficient-stock`, `cancel-blocked-stock`, `warehouse-not-found`, `person-not-found`.
- Tests: unit (`ConversionMathTests`: weight split, share split, remainder on the last
  line, yield); integration (`ConversionTests`: draft → confirm stores costs and stock
  moves; the expense document is created on the person and cancelled with the document;
  insufficient stock is refused with the payload; Staff cannot confirm, Manager can;
  confirmed cannot be edited; cancel blocked when an output was consumed; and the
  end-to-end copper case: PI 1.000 MT at 10,000 → CNV strip 0.650 → CNV melt 0.600 with 800
  USD gas → SI 0.600 MT shows cost of sales 10,800 ≈ 18,000/MT).

## 4. App changes (`apps/erp-panel/`)

- Types: `ConversionDocument` and its lines; `InventoryDocumentItem.unitCostUsd`,
  `costUsd`; `StockLevelRow` gains `unitCostUsd`, `valueUsd`, `costKnown`.
- `mock/data.ts`: `conversions` collection, `SCHEMA_VERSION` 8.
- `services/conversions.ts` (endpoints) + `api.ts` reads: `getConversions`,
  `getConversion`, stock levels include conversions and value (mirror of §2.3 for display),
  `getInvoiceCostOfSales(invoiceId)` summing the GDN lines' `costUsd`. Writes go to the
  server only (no offline path — a conversion needs the server's stock and cost).
- `queries.ts` hooks; permission check `usePermissions().has('conversions.confirm')` (or
  whatever the existing helper is — the plan reads it).
- UI: Warehouse page gets a **Conversions** tab (table: number, date, warehouse, inputs →
  outputs summary, yield, total cost, status; New conversion). `ConversionFormModal`
  (header + three editable line tables; product pickers from Goods; category picker
  limited to EXPENSE/GENERAL; person picker) used for create and DRAFT edit. Row actions:
  Confirm (Manager), Cancel. A small read-only detail drawer/page shows the stored costs
  after confirm.
- Inventory tab: columns **Cost / MT** and **Value (USD)**, "cost unknown" tag when the
  quantity is > 0 and value is 0 with old documents behind it.
- Sale invoice detail: after confirm, a "Cost of sales" line and margin (total − cost)
  in the totals card.
- i18n: new `conversions` block plus the inventory/invoice labels in `en`, `ar`, `fa`, `ku`.
- Sample data: one confirmed conversion (cable → ingot + scrap) on the demo dataset so the
  screens have something to show; numbers regenerated through the same helpers.
- Docs: user guide gets a "Convert stock" section; the copper-processing doc's "not in the
  app yet" cells become "how to do it"; CLAUDE.md mentions conversions and stock cost.

## 5. Out of scope

- FIFO / lot costing; landed-cost allocation from purchase-side expenses (freight) into
  stock value — expenses booked on an invoice stay on the person's ledger as today.
- Costing documents confirmed before this feature.
- Reports beyond the Inventory value columns and the sale invoice cost/margin line.
- Multi-warehouse conversions (inputs from one warehouse, outputs to another).
