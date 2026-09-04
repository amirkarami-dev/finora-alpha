# Invoice line weights (gross, tare, net) — design

Date: 2026-09-04. Status: approved by the owner in chat (2026-09-04).

## 1. Goal

On a trade **invoice** line the user enters what the scale shows: the **gross** weight and the
**tare** (packing and pallet). The app works out the **net** weight and uses it for everything:
the line total, the contract's remaining quantity, the warehouse receipt or issue, stock and
cost. The user never types the net.

All three weights are in **MT** with six decimals, like every other quantity in the app
(one gram). Prices stay USD per MT; the line total is net × unit price, minus any discount,
exactly as today.

**Orders keep one quantity field.** A purchase order or sale order is made before the goods are
weighed, so its lines carry a quantity only, as today.

## 2. Rules

| Document type | Line quantity fields | Net |
|---|---|---|
| PURCHASE_ORDER, SALE_ORDER | Quantity (MT), typed by the user | = quantity |
| PURCHASE_INVOICE, SALE_INVOICE, and their PROVISIONAL forms | Gross (MT) and Tare (MT), typed by the user | = gross − tare, computed by the server |

Binding details:

- The existing line field `quantityMt` **is** the net weight. Nothing downstream changes:
  contract remaining, warehouse documents, the stock ledger, cost of sales, allocations,
  claims and reports keep reading `quantityMt`.
- Two new fields on the line: `grossMt` and `tareMt`, both optional (null on order lines,
  required on invoice lines). Six decimals, `Rounding.Quantity` / `roundMt`, quantity
  columns `numeric(18,6)`.
- **Validation on an invoice line**: gross > 0, tare ≥ 0, tare < gross. So net is always
  > 0. A failure is `weights-invalid` with `extensions.rule` one of `gross`, `tare`,
  `tare-exceeds-gross`. On an order line the rule is quantity > 0, refused with the same
  code and `rule` = `quantity` (today nothing on the server refuses a zero quantity on an
  invoice line; this closes that gap for every type).
- **The server sets net.** On an invoice line, `quantityMt = Rounding.Quantity(gross − tare)`
  on every add and every edit; a `quantityMt` sent by a client for an invoice line is
  ignored. On an order line `quantityMt` is taken from the client as today and the weights
  are stored as null.
- **Convert.** Order → provisional invoice: each copied line gets `grossMt = quantityMt`,
  `tareMt = 0`, so the invoice is valid at once; the user then edits the real figures.
  Provisional → final: gross and tare are copied unchanged, like every other line field.
- **Existing rows.** The migration adds the two nullable columns. A data step sets
  `gross_mt = quantity_mt, tare_mt = 0` on lines whose invoice is one of the four invoice
  types, and leaves order lines null. Nothing is renamed.
- The contract-quantity guard (`checkContractQty` / the server's remaining check) tests the
  **net**, as it tests `quantityMt` today.

## 3. Server changes (`backend/`)

- `Finora.Erp.Domain.InvoiceItem`: `decimal? GrossMt`, `decimal? TareMt`.
- `TradeConfiguration`: both as quantity columns (nullable).
- Migration `AddInvoiceLineWeights`: two columns plus the data step in §2.
- `InvoiceItemInput` gains `decimal? GrossMt`, `decimal? TareMt`; `QuantityMt` becomes
  optional. `InvoiceItemPatch` gains the same two optional fields. Which fields are required
  depends on the invoice's type, checked in `InvoiceService`:
  - invoice types: gross and tare required (missing → `weights-invalid`, rule `gross` or
    `tare`), quantity ignored;
  - order types: quantity required and > 0 (`weights-invalid`, rule `quantity`), weights
    ignored and stored null.
- `InvoiceService.AddItemsAsync`, `UpdateItemAsync`, `ConvertAsync` per §2.
- `ErpSnapshot` round-trips the two fields (they are on the entity, so the existing
  snapshot code carries them; the round-trip test asserts it).
- `contracts/error-codes.json`: add `weights-invalid`.
- Tests: unit tests are not needed for arithmetic this small; integration tests cover
  add (net and amount), edit, each of the three rule failures, an order line without weights,
  convert order → provisional (gross = quantity, tare = 0), provisional → final (copied), a
  receipt against the line consuming the net, and the snapshot round-trip.

## 4. App changes (`apps/erp-panel/`)

- `types/index.ts`: `InvoiceItem.grossMt?`, `tareMt?`; `services/api.ts` inputs mirror the
  server. Invoice writes have no offline path (they go to the server only), so nothing is
  mirrored client-side. `SCHEMA_VERSION` bumps.
- **Add-items form** (`AddItemsModal`) and **edit-line form** (`EditLineModal`): on an
  invoice type, two inputs **Gross (MT)** and **Tare (MT)** and a read-only **Net (MT)** that
  updates as they type; the existing read-only unit price and line total sit beside them and
  the total follows the net. The contract-remaining hint and `max` apply to the net. On an
  order type the forms are unchanged (one Quantity input).
- **Invoice detail** line table: on an invoice type, columns Gross, Tare, Net replace
  Quantity; on an order type, Quantity as today. (There is no per-line Excel export on the
  invoice page; the reports' trade export stays on the net quantity it already shows.)
- **Warehouse receipt and issue forms**: the line quantity they show is the net; its column
  header becomes "Net (MT)" on invoice types (it is the only quantity those forms can ever
  see, since orders cannot be received against).
- Error handling: `weights-invalid` is shown by the form as a message chosen by `rule` (a
  toast, like every other server refusal on these forms); client-side rules catch the same
  cases before the request is sent.
- i18n: new keys in `en`, `ar`, `fa`, `ku` — `tradeInvoices.grossMt`, `tareMt`, `netMt`,
  `netHint`, `weightsInvalidGross`, `weightsInvalidTare`, `weightsInvalidTareExceedsGross`,
  `weightsInvalidQuantity`, and `warehouse.netMt` for the receipt/issue form.
- Sample data: every invoice-type line gets a gross and a tare whose difference is its
  quantity; order lines stay as they are.
- Docs: the user guide's invoice section says how the three weights work (simple English);
  CLAUDE.md's domain-model note gains one line.

## 5. Out of scope

- Container weights (`grossWeightKg` / `netWeightKg` on containers) stay as they are, in kg.
- Any price per kg, or any unit other than MT.
- Changing the sale-side "quantity" wording anywhere the net is not shown next to gross and
  tare.
