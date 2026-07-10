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
`ContainerStatus`'s only remaining consumers after §2 are `Container.status`,
`ShipmentInvoice.status`, and **`StatusTag.tsx:8,12`** (union + `CONTAINER_STATUS_COLOR`
spread) — all removed/edited here, so deletion is safe. **`StatusTag.tsx` must be edited**
(drop `ContainerStatus` from its prop union and the color-map spread) — it was missing from the
file list. **BUT** the new `getReceivableInvoices.displayStatus` (§6) reuses the OPEN/PAID/
OVERDUE *values* and their colors for the dashboard/portal badge — so keep
`CONTAINER_STATUS_COLOR` + `status.OPEN/PAID/OVERDUE` i18n keys and just repurpose them
(rename conceptually to a shared "settlement status"), rather than deleting them.
**Keep `containers.overdueBy` / `containers.dueIn`** — the Dashboard "upcoming due" widget
(DashboardPage.tsx:368-369) still uses them on the re-based feed.

## 3. Seed (`src/mock/data.ts`) — SCHEMA_VERSION 2 → 3

**Determinism is the #1 risk.** The credit-limit post-pass (`data.ts:414-426`) runs right after
container generation, consumes one `rnd()` per customer, and reads `container.invoiceUSD` /
`container.status` — fields §2 removes. It runs BEFORE partner allocation (429-452), so moving
it would shift the entire PRNG stream and change every seeded value (violating the `cust-am`
creditLimit = 2,750,000 anchor). The container generation loop (`data.ts:234-299`, `344-378`)
also pushes old-shape objects into a `containers: Container[]` array — which won't type-check
the moment §2's new `Container` shape lands.

**Resolution — raw internal seed type, no reordering:**
1. Introduce a file-local `RawContainerSeed` type (the OLD shape: `id, contractId, itemId,
   reference, quantityMt, lmePrice, premium, shipmentDate, arrivalDate?, dueDate, invoiceUSD,
   status, blNumber?, bookingNumber?, sealNumber?`). The generation loop builds into
   `rawContainers: RawContainerSeed[]`, **byte-identical to today** (same order, same `rnd()`
   draws). The credit-limit pass and partner pass stay **exactly where they are**, reading
   `rawContainers` — so their PRNG draws and outputs are unchanged. This preserves 2,750,000.
2. **Final post-pass (after partner allocation, zero new `rnd()` draws)** maps
   `rawContainers → db.containers` (new logistics shape): keep `id, reference, shipmentDate,
   arrivalDate, blNumber, bookingNumber, sealNumber`; set `goods: [{ contractItemId: raw.itemId,
   quantityMt: raw.quantityMt }]`; `netWeightKg = round(raw.quantityMt * 1000)`,
   `grossWeightKg = round(raw.quantityMt * 1000 * 1.02)` (fixed 2% tare). Drop removed fields.
3. **Historical trade invoices from `rawContainers`** (NOT from a not-yet-existing invoice list).
   Group `rawContainers` by contract (raw.contractId). For each contract with shipments, create
   one **CONFIRMED** trade invoice — `SALE_INVOICE` for SELL, `PURCHASE_INVOICE` for PURCHASE —
   dated at latest shipmentDate, one `InvoiceItem` per raw container (snapshot pricing from the
   contract item; `containerId` = that container id; `quantityMt` = raw.quantityMt), totals via
   calc helpers. In addition to the existing PO→PP→PI chain + draft SO.
   - Sale invoices → receivables; seed a deterministic partial IN payment on every other sale
     invoice (60% of total), `NIZ` id scheme, `direction: 'IN'`.
   - Purchase invoices → payables (`direction: 'OUT'`), excluded from receivables (§7).
   - No warehouse docs for these historical invoices (seed-only shortcut — code comment).
   - **Numbering is reimplemented locally in `data.ts`** (it cannot import `api.ts`'s
     `nextInvoiceNumber`/`nextInvoiceId` — the dependency runs the other way). Runtime creation
     is scan-until-unique against `db.invoices` so live numbers won't collide with these; keep
     the `<PFX>-<YYYY>-<NNNN>` / `inv-<pfx>-<NNNN>` schemes identical to avoid format drift.
4. **Recompute `item.remainingMt` at seed end** via the new formula (`quantityMt −
   shippedMtForItem`) rather than leaving the old container-derived value, so the seed matches
   runtime semantics exactly (the 1:1 repackaging should make them coincide — assert, don't assume).
5. Persistence: bump `SCHEMA_VERSION` to 3 (`STORAGE_KEY` → `finora-db-v3`, so old v2 blobs are
   never read — the real guard). Tighten `isCompatible` with an `if (!Array.isArray(
   o.containers[0]?.goods) && o.containers.length) return false;` guard, matching the file's
   existing probe style.

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
  idiom, never array index). Each row: a goods `Select` + `quantityMt` InputNumber. Add/remove
  row buttons. At least one good required to save. The Select uses real `OptGroup`s by contract
  (the flat list is 100+ items) with each option labelled `"<product>"` and a secondary
  remaining-MT hint (`t('containers.goodRemainingHint', { mt })` from `getContractRemaining`),
  matching the AddItemsModal hint idiom.
- **No quantity guardrail (accepted gap):** container goods quantity is NOT validated against
  the contract item quantity — containers are logistics-only and `shippedMtForItem` (§5) sums
  invoice lines, never container goods. A user may over-declare on a container with no hard cap.
  This is an intentional, documented gap (not a silent omission).
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
- **`updateItem` (api.ts:525)** also calls `shippedMt(itemId, db.containers)` directly on a
  contract-item edit — a compile break once container loses `itemId`/`quantityMt`. Repoint it
  to `shippedMtForItem(id)` and then **delete `calc.ts`'s `shippedMt`** once both call sites
  (this + the removed container recompute) are migrated.
- `buildContractRows` shippedPct keeps using `Item.remainingMt` — now invoice-sourced.
- **Add-items cap reconciliation (corrected from review):** do NOT simply switch
  `getContractRemaining` to include drafts — it has no `excludeInvoiceId` param, so the invoice
  currently being edited (itself a chain-leaf DRAFT) would be counted in the claimed total AND
  subtracted again by the UI's client-side `alreadyOnDoc` (AddItemsModal.tsx:43-55,
  EditLineModal.tsx:29-38) → double subtraction, shrinking the cap on every added line and
  breaking the T8 sale flow. **Fix:** add an optional `excludeInvoiceId` to `getContractRemaining`
  and `chainLeafDocs`, thread it via `useContractRemaining(contractId, side, invoiceId)`, pass
  the current invoice id from add-items/edit-line, and drop the now-redundant client-side
  `alreadyOnDoc` subtraction. Contract "shipped" (§5) uses the same `chainLeafDocs(side,
  {includeDraft:true})` WITHOUT an exclude id. Confirm-time 'qty-exceeds-remaining' still guards
  concurrent drafts. Re-verify the T8 sale E2E.

## 6. Financial re-base (`src/services/api.ts`, dashboard, portal)

Containers no longer carry money, so every container-derived financial read moves to trade
invoices. **Receivables = SALE side; payables = PURCHASE side** (already encoded via payment
`direction`). A confirmed/relevant document's amount is its `totalAmount` (USD).

**Complete list of container-derived reads to re-base** (from review — the spec originally
missed the last four; all read fields §2 deletes):
1. `computeAccounts` (api.ts:66-97) — totalInvoiced/outstanding/overdue/openContainers.
2. `getKpis` (api.ts:~237) — `openContainers`, `totalVolumeMt` on `DashboardKpis`.
3. `getExecutiveSummary` — via the above.
4. `getCashflowSeries` (api.ts:254-271) — monthly invoiced/collected.
5. `getCustomerPortalSummary` (api.ts:818-840) — a **separate hand-rolled** monthly series +
   aging over `db.containers`, NOT a call into getCashflowSeries — its own rewrite.
6. `getProductVolumes` (api.ts:273-286) — used by Dashboard, Executive, **Reports** pages via
   `useProductVolumes`. Re-aggregate over chain-leaf non-cancelled SALE `InvoiceItem`s (product
   from contract item, qty, value from `invoiceItemAmount`).
7. `getAgingBuckets` (api.ts:300-325) — dashboard aging; rebuild from `getReceivableInvoices`
   derived due dates.
8. `buildInvoices`/`getInvoices`/`ShipmentInvoice` — deleted (§2).

Implementation:
- `saleReceivables()` → per customer: `invoiced` = Σ chain-leaf non-cancelled **SALE**
  provisional/invoice totals; `paid` = Σ IN payments; `outstanding = invoiced − paid`;
  `overdue` = Σ outstanding of sale docs whose derived due date `< TODAY`
  (dueDate = `invoiceDate + customer.paymentTermsDays`). `computeAccounts` uses it.
- **`CustomerAccount.openContainers` AND `DashboardKpis.openContainers`** — both lose meaning
  (containers have no status). **Drop both fields** and their UI (Customers "Open containers"
  column + `dashboard.kpiContainers` tile + i18n keys). `DashboardKpis.totalVolumeMt` →
  redefine as Σ shipped invoice qty (chain-leaf non-cancelled sale), or drop with its tile —
  prefer **drop** (simplest; the Reports page already shows volume via product mix). Decide in
  the plan; either way remove the container read.
- `getReceivableInvoices()` → sale provisional/invoice rows
  `{ id, invoiceNumber, customerId, customerName, summary (first product + "+N"), totalAmount,
  invoiceDate, dueDate (derived), paidUSD, displayStatus }`. **No `containerReference`** (a sale
  invoice can span 0..N containers) — Dashboard/Portal show `invoiceNumber` instead of the old
  container reference. **`displayStatus` is an explicitly derived open/paid/overdue tri-state**
  (paid ≥ total → PAID; unpaid & dueDate<TODAY → OVERDUE; else OPEN) so `StatusTag` +
  `CONTAINER_STATUS_COLOR` still render correctly — do NOT pass the document DRAFT/CONFIRMED
  status through. Portal scopes by customerId.
- Dashboard uses `invoiceNumber` + `summary` where it used `containerReference · product`
  (DashboardPage.tsx:342); Portal column `containers.reference`→ new
  `tradeInvoices.number`, dataIndex `invoiceNumber` (CustomerPortalPage.tsx:98-100).
- **Magnitude note for the review gate:** this (Phase D) is by far the largest, most
  cross-cutting part — 8 selectors + Dashboard + Executive + Reports + Portal. If deferred, the
  container/invoice-linkage/shipped work (Phases A–C) can land first, but the app will NOT
  compile until Phase D lands too (container fields are gone). So Phase D is not optional within
  this branch — flag if you'd rather split it into its own branch/spec landed first.

## 7. Invoice-item ↔ container (trade module: detail, add-items, edit-line, convert, confirm)

- **Edit-line** (`EditLineModal.tsx:100-105`): replace its BL No + Container No text inputs with
  a single **container `Select`** (any container; label `"<reference> · <BL or —>"`; searchable;
  optional).
- **Add-items** (`AddItemsModal.tsx`): today each row is only checkbox + `quantityMt` (there are
  NO BL/container inputs to "replace" — this is a **net-new** control). Add a per-row container
  `Select` after the qty field; rework the fixed-width flex row to fit it. Optional at add time.
- **Per-row assign (approved rule 3):** a detail-table line with no `containerId` shows an
  "Assign container" button in the actions column. **Reuse the existing `EditLineModal`**
  (already wired via `editLineItem` + `ActiveModal='editLine'`, InvoiceDetailPage.tsx:701-717) —
  do NOT add a new modal member for this. The button opens EditLineModal (its new container
  Select is the relevant field).
- **Convert container step (corrected from review):** convert is currently a **`Dropdown`**
  whose item calls `convertInvoiceHandler` → `convertMut` → `navigate` directly, with NO modal
  and no `ActiveModal` slot (InvoiceDetailPage.tsx:436-446, 199-209). So a container step must be
  BUILT: add an `ActiveModal='convertContainer'` member + `pendingConvertTarget: InvoiceType`
  state; the Dropdown item now opens that modal instead of converting immediately. The modal
  offers an optional single container `Select` ("apply to all lines"), then on OK: `convertInvoice`
  → if a container was chosen, `applyContainerToAll(createdId, containerId)` → `navigate` to the
  new draft. Add `applyContainerToAll(invoiceId, containerId)` to the api (keeps `convertInvoice`
  signature stable). If skipped, the new draft's lines are unassigned → per-row assign / confirm
  guard handle it.
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
- `shippedMtForItem(contractItemId)`, `chainLeafDocs(side, { includeDraft, excludeInvoiceId })`
  (shared by shipped + add-items cap), `saleReceivables`, `getReceivableInvoices`,
  derived-due-date helper. Re-based: `getProductVolumes`, `getAgingBuckets`, `getCashflowSeries`,
  `getCustomerPortalSummary` monthly series + aging, `computeAccounts`, `getKpis`.
- `getContractRemaining` gains optional `excludeInvoiceId`; `useContractRemaining(contractId,
  side, invoiceId?)` threads it; add-items/edit-line pass the current invoice id and drop their
  client-side `alreadyOnDoc` subtraction.
- `confirmInvoice` 'missing-container' guard (after 'missing-lme-price', before stock);
  `applyContainerToAll(invoiceId, containerId)`.
- `updateInvoiceItem` accepts `containerId`; drop `blNumber`/`containerNo`.
- `StatusTag.tsx` edited (drop `ContainerStatus` union member; keep `CONTAINER_STATUS_COLOR`
  for the re-based settlement badge).
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
