# Containers → Logistics + Invoice-Item Container Linkage + Contract Shipped-from-Invoices

Date: 2026-07-10 · Branch: `feature/containers-logistics-invoice-linkage` (to be created) · Status: draft design, pre-approval

## 1. Overview & approved decisions

Convert **Container** from a per-item financial record into a pure **logistics** entity that
carries multiple goods lines, and make the new trade **Invoice** the sole financial source of
truth. Wire invoice lines to containers (replacing free-text BL/Container No), and compute
contract "shipped" from invoices.

User-approved decisions (AskUserQuestion, 2026-07-10):
1. **Re-base financials onto trade invoices.** Dashboard, customer portal, and receivables
   (invoiced/outstanding/overdue) read from confirmed trade invoices, not containers.
   Containers hold no money.
2. **Container goods line = a contract goods line + quantity; gross/net weight per container.**
3. **Invoice line → any container; required at approve (confirm).** Per-row assign action +
   editable in edit-line; not required while drafting.
4. **Contract shipped = chain-once (leaf), draft+confirmed, exclude cancelled.**

## 2. Data model (`src/types/index.ts`) — SCHEMA_VERSION → 3

### Container (reshaped)
```ts
export interface ContainerGood {
  /** Contract goods line this container carries. */
  contractItemId: string;
  quantityMt: number;
}
export interface Container {
  id: string;
  reference: string;              // physical container number, e.g. "MSNU8018095"
  goods: ContainerGood[];         // NEW — one or more goods lines
  shipmentDate: string;
  arrivalDate?: string;
  grossWeightKg?: number;         // NEW — container-level
  netWeightKg?: number;           // NEW — container-level
  blNumber?: string;              // Bill of Lading (kept)
  bookingNumber?: string;         // kept
  sealNumber?: string;            // kept
}
```
**Removed from Container:** `contractId`, `itemId`, `quantityMt`, `lmePrice`, `premium`,
`dueDate`, `invoiceUSD`, `status`. (A container is no longer tied to one contract/item and
carries no money or payment status.)

### InvoiceItem (link to container instead of free text)
- **Remove** `blNumber?`, `containerNo?` (free text).
- **Add** `containerId?: string`. BL No and Container No shown on the invoice/print are
  **derived**: Container No = `container.reference`, BL No = `container.blNumber`.

### ShipmentInvoice
Delete the interface and `buildInvoices`/`getInvoices`/`useShipmentInvoices` entirely — its
only consumers (Dashboard overdue widget, Customer Portal open-invoices) move to trade
invoices (§6). This removes the last container-derived financial view.

### Types cleanup
`ContainerStatus` type + `CONTAINER_STATUSES` const become unused (containers have no status).
Remove them and their i18n `status.OPEN/PAID/OVERDUE` only if no other consumer remains
(grep first; `StatusTag` may map them for other entities — verify before deleting).

## 3. Seed (`src/mock/data.ts`) — SCHEMA_VERSION 2 → 3

The existing seed builds rich per-item containers (contractId/itemId/quantity/lmePrice/…) and
one PO→PP→PI trade chain + a draft SO. Rework the container seed and, to keep the re-based
dashboard populated (§6), derive **historical trade invoices** from the old container data —
all with **zero new PRNG draws** (fixed transforms of existing values; determinism anchor:
`cust-am` creditLimit must stay 2,750,000).

Transform, in a post-pass placed after the existing trade-doc seed block:
1. **Reshape containers → logistics.** For each existing seeded container, keep
   `id, reference, shipmentDate, arrivalDate, blNumber, bookingNumber, sealNumber`; set
   `goods: [{ contractItemId: <old itemId>, quantityMt: <old quantityMt> }]`; derive
   `netWeightKg = round(quantityMt * 1000)`, `grossWeightKg = round(quantityMt * 1000 * 1.02)`
   (2% tare — fixed factor, no PRNG). Drop the removed fields.
2. **Historical trade invoices from shipments.** Group reshaped containers by their contract
   (via the goods' contractItemId → contract). For each contract with containers, create one
   **CONFIRMED** trade invoice — `SALE_INVOICE` for SELL contracts, `PURCHASE_INVOICE` for
   PURCHASE — dated at the latest container shipmentDate + customer terms, `invoiceNumber` via
   the standard scheme, one `InvoiceItem` per container-good (snapshot pricing from the
   contract item; `containerId` set to that container; `quantityMt` from the good), totals
   computed via the calc helpers. These are **in addition to** the existing PO→PP→PI chain and
   draft SO. Numbering counters must continue from these so live-created numbers don't collide.
   - Sale invoices → receivables; seed a partial IN payment on ~half of them (deterministic:
     e.g. every other sale invoice, 60% paid) so outstanding/overdue/paid look realistic.
     Payment ids continue the `NIZ` scheme; `direction: 'IN'`.
   - Purchase invoices → payables (direction OUT), excluded from receivables per existing §7.
   - Do **not** auto-create warehouse docs for these historical invoices (seed-only shortcut;
     warehouse stays as the current single seed). Note this explicitly in a code comment.
3. Persistence: bump `SCHEMA_VERSION` to 3; `seed` object unchanged in shape (same keys).
   Extend `isCompatible`: probe `containers[0].goods` is an array and that
   `containers[0].quantityMt === undefined` is NOT required — instead probe the NEW shape
   (`Array.isArray(o.containers) && (o.containers[0]?.goods !== undefined || o.containers.length === 0)`).
   The version bump is the real guard; the probe is the safety net.

## 4. Containers UI (`src/pages/containers/*`, `ContainerFormModal`)

### ContainersPage
- Columns: reference (mono), **goods summary** (e.g. "3 goods · 512 MT" or first product +
  "+2"), gross/net weight, shipmentDate, arrivalDate, BL/booking/seal (expandable row keeps
  the detail). **Remove** contract, quantity, LME price, due date, invoice, status columns and
  the status Segmented filter. Keep search (reference / product-in-goods).
- Row action: Edit. No status anything.

### ContainerFormModal (rebuilt)
- Fields: `reference` (required), `shipmentDate` (required), `arrivalDate`, `grossWeightKg`,
  `netWeightKg`, `blNumber`, `bookingNumber`, `sealNumber`.
- **Goods** — one `Form` + `Form.List` keyed by a stable row id (ItemFormModal partners
  idiom, never array index). Each row: a goods `Select` (searchable across **all contracts'**
  goods lines, grouped/labelled `"<contract id> · <product>"`) + `quantityMt` InputNumber.
  Add/remove row buttons. At least one good required to save.
- **Removal block (approved rule 2):** when editing, removing a goods row whose
  `(containerId=this, contractItemId=row)` pair is referenced by any InvoiceItem is blocked.
  On remove attempt, show an AntD `Modal.warning` (or `App.modal.warning`) titled
  `containers.goodInUseTitle` listing the invoice numbers that reference it
  (`containers.goodInUseBody`, interpolated with `{{invoices}}` and `{{product}}`). The row is
  not removed. Provide `api.getGoodContainerUsage(containerId, contractItemId)` →
  `string[]` (invoice numbers) for this check. Newly-added rows (not yet linked) remove freely.
- No contract picker, no quantity-vs-remaining validation (that concept moves to §5),
  no LME/premium/status/due/invoice preview.
- Contract-detail page: the container section was already removed on contract detail earlier;
  containers are only managed from the Containers page now. (Verify no dangling
  `ContainerFormModal` usage passes the old `contract`/`container` shape.)

## 5. Contract shipped-from-invoices (`src/utils/calc.ts`, `src/services/api.ts`)

- Replace container-based `shippedMt(itemId, containers)` with invoice-based shipping.
  New helper in api.ts (needs invoice access): `shippedMtForItem(contractItemId): number` =
  Σ `InvoiceItem.quantityMt` over **chain-leaf, non-cancelled** provisional/invoice documents
  (PURCHASE_PROVISIONAL/PURCHASE_INVOICE/SALE_PROVISIONAL/SALE_INVOICE) whose item's
  `contractItemId` matches. "chain-leaf" reuses the existing `chainLeafConfirmed…` logic but
  broadened to include DRAFT (exclude only CANCELLED) — extract a shared
  `chainLeafDocs(side, { includeDraft })` so both this and the trade-module remain consistent.
- `Item.remainingMt` recompute (currently after container mutations) moves to: recompute for
  all items after any **invoice** mutation that changes item quantities/status/conversion
  (create/add/update/remove item, confirm, cancel, convert). `remainingMt = max(quantityMt −
  shippedMtForItem(id), 0)`. Remove container-mutation-driven remaining recompute.
- `buildContractRows` shippedPct keeps using `Item.remainingMt` — now invoice-sourced.
- **Reconciliation note (flag for review):** the trade module's `getContractRemaining`
  (add-items cap) currently subtracts chain-leaf **CONFIRMED** only. Contract "shipped" now
  counts draft too. Decision: **align** `getContractRemaining` to the same
  `chainLeafDocs(side, { includeDraft: true })` base so the add-items cap and the shipped
  figure are complementary (uninvoiced = quantity − shipped). Confirm-time re-validation
  (existing 'qty-exceeds-remaining') still guards concurrent drafts. Verify trade-module live
  flows still behave (the earlier T8 sale E2E must still pass).

## 6. Financial re-base (`src/services/api.ts`, dashboard, portal)

Containers no longer carry money, so every container-derived financial read moves to trade
invoices. **Receivables = SALE side; payables = PURCHASE side** (already encoded via payment
`direction`). A confirmed/relevant document's amount is its `totalAmount` (USD).

- New selector `saleReceivables()` → per customer: `invoiced` = Σ chain-leaf non-cancelled
  **SALE** provisional/invoice totals; `paid` = Σ IN payments; `outstanding = invoiced − paid`;
  `overdue` = Σ outstanding of sale docs whose derived due date `< TODAY`
  (dueDate = `invoiceDate + customer.paymentTermsDays`, since invoices have no stored due date).
  Rewrite `computeAccounts` to use this (drop container reads). `openContainers` field on
  `CustomerAccount` → repurpose as **open sale invoices count** or drop the column; prefer
  dropping the column from Customers table + type to avoid a misleading name (verify consumers).
- `getKpis`, `getExecutiveSummary`, cashflow series, `getCustomerPortalSummary` → same
  invoice-sourced figures. Cashflow "invoiced" per month = Σ sale invoice totals by invoiceDate
  month; "collected" already from IN payments.
- **Dashboard** overdue/recent-invoices widget + **Customer Portal** open-invoices list:
  replace the deleted `ShipmentInvoice` with a lightweight `getReceivableInvoices()` returning
  sale provisional/invoice rows `{ id, invoiceNumber, customerId, customerName, product|summary,
  totalAmount, invoiceDate, dueDate(derived), paidUSD, status }`. Portal scopes by customerId.
- **Magnitude note for the review gate:** this is the largest part. If the seed §3 step 2 is
  skipped, these views render only the seeded PP/PI chain and look sparse. The historical-
  invoice seed keeps them rich. Both are in scope here; flag if it should be phased.

## 7. Invoice-item ↔ container (trade module: detail, add-items, edit-line, convert, confirm)

- **Add-items / edit-line:** replace the BL No + Container No text inputs with a single
  **container `Select`** (any container; label `"<reference> · <BL or —>"`; searchable). Not
  required to add/save a draft line.
- **Per-row assign (approved rule 3):** in the invoice detail items table, a line with no
  `containerId` shows an "Assign container" button in the actions column (opens a small
  container-select modal, or the existing edit-line modal focused on the container field).
- **Convert modal:** when converting an order → provisional/invoice (and provisional →
  invoice), show a step where the user may pick **one** container to apply to **all** copied
  lines (optional). If chosen, set `containerId` on every line; if skipped, lines start
  unassigned and rely on per-row assign. Implement by extending `convertInvoice` to accept an
  optional `containerId`, or by a follow-up `applyContainerToAll(invoiceId, containerId)` the
  modal calls after convert. Prefer the latter (keeps `convertInvoice` signature stable).
- **Confirm guard (approved rule 3):** `confirmInvoice` for provisional/final types adds, in
  the guard order (after 'missing-lme-price', before stock), a **'missing-container'** check:
  every item must have `containerId`. Toast `tradeInvoices.missingContainer` listing the
  offending product(s). Orders exempt.
- **Detail / print:** BL No & Container No columns/cells resolve from the line's container
  (`container.reference`, `container.blNumber`) instead of the removed free-text fields. When a
  line has no container yet: render "—".
- Container list for the pickers via existing `useWarehouses`-style hook `useContainers`
  (already exists) or a trimmed `useContainerOptions`.

## 8. API surface additions

- `getContainers`/`ContainerRow` reshaped (goods summary, weights; drop money/status/contract).
  `ContainerInput` reshaped: `{ reference, shipmentDate, arrivalDate?, grossWeightKg?,
  netWeightKg?, blNumber?, bookingNumber?, sealNumber?, goods: {contractItemId, quantityMt}[] }`.
  `createContainer`/`updateContainer` updated; `updateContainer` enforces the goods-removal
  block server-side too (throw `'good-in-use'` with the invoice numbers attached).
- `getGoodContainerUsage(containerId, contractItemId): string[]`.
- `getContainerOptions()` → `{ id, reference, blNumber }[]` for pickers.
- `shippedMtForItem`, `chainLeafDocs(side,{includeDraft})`, `saleReceivables`,
  `getReceivableInvoices`, derived-due-date helper.
- `confirmInvoice` 'missing-container' guard; `applyContainerToAll(invoiceId, containerId)`.
- `updateInvoiceItem` accepts `containerId`; drop `blNumber`/`containerNo`.
- Every mutation still calls `persistDb()`; item-quantity-affecting invoice mutations now also
  recompute `Item.remainingMt` (§5).
- queries.ts: reshape `useContainers`; add `useContainerOptions`, `useReceivableInvoices`,
  usage hook; drop `useShipmentInvoices`; invalidations: invoice mutations invalidate contracts
  (shipped changed) + accounts/kpis/executive/customerPortal; container mutations invalidate
  containers + (if a good link changes) invoices/contracts.

## 9. i18n / RBAC / determinism

- i18n en/ar/fa: new `containers.*` (goods, grossWeight, netWeight, goodInUseTitle/Body,
  addGood, weight units), `tradeInvoices.container`, `assignContainer`, `missingContainer`,
  convert-container step; remove dead container status keys if unused. Identical key sets.
- RBAC unchanged; no nav/route changes. Containers page still Operations group, Manager+Staff.
- Determinism: all seed transforms use fixed factors, zero new PRNG draws; verify `cust-am`
  creditLimit 2,750,000 and that credit-limit + partner post-passes (which currently read
  containers!) still work — **`creditLimit` post-pass reads `containers` and `container.invoiceUSD`**
  (`data.ts:414-418`). Since containers lose `invoiceUSD`, that post-pass MUST be re-sourced
  from the historical sale invoices (§3 step 2) or from item unit price × shipped — **critical
  determinism dependency**: re-derive credit base from the new invoices computed in the SAME
  pass, keeping the exact same numeric result for `cust-am` if possible, or accept a documented
  new deterministic value. This is the riskiest determinism point — call it out in the plan.

## 10. Phases

- **A — Data & seed:** Container/InvoiceItem type reshape, ContainerGood, SCHEMA v3, seed
  transform (logistics containers + historical trade invoices + credit-limit re-source),
  calc/`shippedMtForItem`/`chainLeafDocs`. Gate green with the app still compiling (temporary
  shims where UI not yet updated).
- **B — Containers UI:** page + form (goods Form.List, weights, removal block) + api container
  surface + usage check.
- **C — Invoice↔container:** add-items/edit-line container select, per-row assign, convert
  container step, confirm 'missing-container' guard, detail/print derivation.
- **D — Financial re-base:** computeAccounts/KPIs/executive/portal/cashflow + dashboard &
  portal invoice lists on trade invoices; delete ShipmentInvoice; contract shipped wiring.
- **E — Final adversarial review + live verify** (all roles, determinism, dashboards populated,
  container removal-block, confirm guard, shipped math).

Each phase: `npm run typecheck && npm run lint && npm run build` green; own commit.

## 11. Out of scope

Journal/accounting; warehouse changes; per-good weights; multi-container per invoice line;
editing historical seeded invoices' warehouse docs; real email/PDF backend.
