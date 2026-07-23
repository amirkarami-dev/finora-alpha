# Warehouse Receipt/Issue + ReferenceDocumentItemId + Load Date — Design

Date: 2026-07-24 · Branch: `feature/warehouse-docs-refdocitem` · Status: draft design, pre-approval

## 1. Scope & approved decisions

Six changes requested by the user:
1. Container `shipmentDate` → **`loadDate`** ("Load date").
2. Invoice-line container pickers **filter to containers carrying that line's good**, label shows the load date.
3. Fix the **goods Select** in ContainerFormModal (hint text bleeds into the selected value).
4. New **Warehouse tab** to create custom **Receipt (IN)** / **Issue (OUT)** documents.
5. Every invoice line gets a permanent **`referenceDocumentItemId`** (UUID) that **survives provisional→final conversion**.
6. Warehouse doc creation **dedupes on `referenceDocumentItemId`** — a line already consumed by a non-cancelled warehouse transaction cannot be added again.

User-approved decisions (AskUserQuestion, 2026-07-24):
- **Auto-creation of warehouse docs on final-invoice confirm is REMOVED ENTIRELY.** All stock movements are created by hand in the new tab. Confirm no longer takes a warehouse, no longer creates IN/OUT docs; the stock check moves to Issue creation.
- **Receipt/Issue are invoice-sourced only** (no free-form lines).
- **Rename goes to the data field**, not just the label.
- **Container filter is strict** — if no container carries the good, show an empty hint.

All line/anchor references below were verified by a 5-agent code map (workflow `wf_90ebdbba-e44`), including reading the installed `rc-select` and executing the seed in node.

## 2. Data model (`src/types/index.ts`) — SCHEMA_VERSION 3 → 4

- `Container.shipmentDate` → **`loadDate: string`** (L110).
- `InvoiceItem` gains **`referenceDocumentItemId: string`** (required).
- `InventoryDocumentItem` gains **`referenceDocumentItemId?: string`** (keep the existing
  `invoiceItemId?` — they are different: `invoiceItemId` points at one concrete row;
  `referenceDocumentItemId` is the chain-stable identity that survives conversion).
- `InventoryDocument.invoiceId` becomes **required** in practice (invoice-sourced only) but stays
  optional in the type for the seeded/legacy doc; new docs always set it.

**SCHEMA_VERSION 3 → 4 is mandatory** (three shape changes). Without it a persisted `finora-db-v3`
blob hydrates with `loadDate === undefined` (every Load date cell blank, `dayjs(undefined)` in the
edit form silently stamps *today*) and `referenceDocumentItemId === undefined` on every line —
which makes the dedupe guard treat *every* line as a duplicate of every other.

`isCompatible()` additions (defensive — `createInvoice` can produce an empty-items draft, so
**find the first doc that has items**, never index `[0].items[0]` blindly):
```ts
if (o.containers.length && typeof (o.containers[0] as any)?.loadDate !== 'string') return false;
const invWithItems = (o.invoices as any[]).find((i) => Array.isArray(i?.items) && i.items.length);
if (invWithItems && typeof invWithItems.items[0].referenceDocumentItemId !== 'string') return false;
const docWithItems = (o.inventoryDocs as any[]).find((d) => Array.isArray(d?.items) && d.items.length);
if (docWithItems && typeof docWithItems.items[0].referenceDocumentItemId !== 'string') return false;
```

## 3. UUIDs & determinism (the critical constraint)

The repo currently has **zero** `crypto.randomUUID` / `Math.random` / `Date.now` in `src/`. This
feature introduces the first non-determinism source and it must be confined to runtime paths.

**Runtime** — exactly ONE generation site: `addInvoiceItems`' `newItem` literal (api.ts L1443-1456).
Add near the other id helpers:
```ts
/** RFC 4122 v4; falls back to getRandomValues on non-secure origins. Runtime only — never in the seed. */
function newGuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16); c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
```
(Guarded because `crypto.randomUUID` is undefined on non-secure origins — the app is served over
plain HTTP on a LAN IP in production.)

**Seed** — deterministic, UUID-shaped, **zero PRNG draws**, placed in the existing zero-`rnd()`
region (data.ts L485+). Version nibble forced to `'0'` so a seed id can **never** collide with a
runtime v4 GUID:
```ts
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
/** Deterministic UUID-shaped id. Version+variant nibbles forced to '0' → can never equal a v4 GUID. */
function seedUuid(key: string): string {
  const h = hex8(fnv1a(`finora-ref|${key}`)) + hex8(fnv1a(`finora-ref|${key}|1`))
          + hex8(fnv1a(`finora-ref|${key}|2`)) + hex8(fnv1a(`finora-ref|${key}|3`));
  return [h.slice(0,8), h.slice(8,12), '0'+h.slice(13,16), '0'+h.slice(17,20), h.slice(20,32)].join('-');
}
```
Verified: 176/176 seed lines unique, 0 malformed, 0 with version nibble `4`.

**Seed keys (chain-aware — this is requirement 5 in the seed):**
| Lines | Key |
|---|---|
| PO/PP/PI chain (data.ts L560, L582-584, L607-609) | `` `inv-po-0001|${contractItem.id}` `` for **all three** so the converted lines share one ref id |
| SO draft (L676) | `` `inv-so-0001|${firstItem.id}` `` |
| Historical invoices (`makeHistoricalInvoiceItem`, L754-783, call L795) | `raw.id` (`cnt-<contractId>-<n>`) |
| Seeded GRN items (L640-646) | **copy `piItems[idx].referenceDocumentItemId`** — never mint |

Give `makeInvoiceItem` a new `refKey: string` parameter rather than deriving inside it.

> The seeded GRN copy is load-bearing: if `idoc-0001`'s item does not carry the PI line's ref id,
> the dedupe guard cannot see it and `inv-pi-0001` can be received again, double-counting stock.

**`convertInvoice` needs NO functional change** — its item copy (api.ts L1717-1724) uses `{...it,
id, invoiceId, ...}`, so the spread already carries `referenceDocumentItemId`. This satisfies
requirement 5 for free but is **fragile by accident**: replacing the spread with an explicit field
list would silently drop it with no type error. Add a load-bearing comment there and verify it live.

**Do NOT change `InvoiceItem.id` to a UUID** — `invoiceItemSeq` regex-scans `/^invitem-(\d+)$/`
(api.ts L1053-1060, currently 176); UUID ids would reset it to 0 and collide with seeded ids.

**Regression anchor:** `cust-am` creditLimit === **2,750,000** (empirically confirmed at HEAD). All
new seed code goes at/after data.ts L485 and calls no `rnd()`/`pick()`/`between()`/`intBetween()`.

## 4. Remove the confirm/cancel warehouse coupling

`src/services/api.ts`:
- **`confirmInvoice`** — delete the entire final-invoice warehouse block (L1613-1650): the
  `warehouse-required` guard, the SALE stock check (`insufficient-stock` + its `err.product` /
  `err.available`), and the GRN/GDN document creation. Delete `ConfirmInvoiceOptions` (L1559-1561)
  and the `options` param → **`confirmInvoice(id: string): Promise<Invoice>`**. Keep the tail
  (status CONFIRMED, `recomputeAllRemaining()`, `persistDb()`). Update the JSDoc (L1563-1570).
  Guard order becomes: `not-draft → no-items → missing-lme-price → missing-container →
  qty-exceeds-remaining`.
- **`cancelInvoice`** — delete the doc lookup (L1672), the `cancel-blocked-stock` purchase guard
  (L1673-1684) and the `if (doc) doc.status = 'CANCELLED'` cascade (L1687). Keep
  `cancel-blocked-successor`. **Cancelling an invoice no longer touches warehouse documents** —
  they are independent documents now and are cancelled from the Warehouse tab. Update the JSDoc.
- `isFinalType` (L1555-1557) becomes dead → remove. `stockOf` (L1318-1322),
  `nextInventoryDocId` (L1066-1073), `nextInventoryDocNumber` (L1075-1084) and the
  `InventoryDocument`/`InventoryDocType` type imports are **kept and repurposed** by §6 (they would
  otherwise fail lint as unused).

`ConfirmInvoiceModal.tsx` — strip `useWarehouses`, `activeWarehouses`, `warehouseId` state, the
default-selection memo, `noActiveWarehouse`, `okDisabled`/`okButtonProps`, the whole `{isFinal && …}`
warehouse block (L97-111), the `Alert`/`Select` imports, and the `insufficient-stock` +
`warehouse-required` error branches. Keep `no-items` / `missing-lme-price` / `missing-container` /
`qty-exceeds-remaining` and the Descriptions summary. `formatMt` stays (used by totalWeight).
`isFinal` stays — it gates `onConfirmed?.()` (the uninvoiced alert), not warehouse logic.

`InvoiceDetailPage.tsx` — delete the `cancel-blocked-stock` branch (L189, now unthrowable).
**Decision: also remove the draft-sale "Available stock" column** (L224-242) with its
`useStockLevels` import/call (L50, L94) and `stockByProduct` map (L143-148). It previewed a
confirm-time check that no longer exists, and it summed stock across *all* warehouses so it was
already only an approximation. Keeping it would advertise a guard the app no longer performs.

`queries.ts` — `useConfirmInvoice` mutation variable becomes `id: string` (drop `options`).
`useInvalidateInvoices` (L286-314) should **stop** invalidating `qk.inventory`/`qk.stock`
(L300-301): invoice mutations can no longer change stock. Fix its doc comment (L281-285).

## 5. Load date rename + container pickers + goods Select fix

### 5.1 `shipmentDate` → `loadDate` (22 code lines, 3 i18n keys)
- `types/index.ts` L110.
- `mock/data.ts`: `RawContainerSeed.shipmentDate` (L40) — rename for consistency; generator local
  const (L274, feeding L275 arrival / L276 due) and object literal (L296); the two verbatim Alco
  containers (L378, L395); the raw→logistics reshape (L711). **Two semantic readers must be renamed
  too, not just the display sites:** `makeHistoricalInvoiceItem` sets `lmeDate: raw.shipmentDate`
  (L778) and the historical `invoiceDate` = MAX(raw.shipmentDate) (L797-802, reused as `createdAt`
  L817 and the seeded payment date L831). This is a **pure identifier rename — no value or ordering
  change** (those dates drive aging/KPIs).
- `api.ts`: `getContainers` sort key (L269), `ContainerInput.shipmentDate` (L650),
  `createContainer` (L678), `updateContainer` (L718).
- `ContainersPage.tsx`: column title/dataIndex/sorter (L59-64).
- `ContainerFormModal.tsx`: **all five sites must move atomically** — `ContainerFormValues` key
  (L22), both `initialValues` branches (L86, L95), submit mapping (L138), and the `Form.Item
  name="shipmentDate"` string (L206). A missed `name` string does not fail typecheck; it fails at
  runtime as a required-field error.
- i18n: `containers.shipmentDate` ("Shipped") → **`containers.loadDate` ("Load date")** in
  en/ar/fa at L281 (suggest ar `تاريخ التحميل`, fa `تاریخ بارگیری`).
- **Do NOT rename `contracts.progress`** (value "Shipped", L236) — it labels `ContractRow.shippedPct`.
  Landing copy and `shippedMtForItem`/`recomputeAllRemaining` are also out of scope.
- While here: `containers.subtitle` still reads "Shipments and their invoice status" — containers
  carry no invoice status since the logistics reshape. Reword in all three locales.

### 5.2 Filter container pickers by good
`ContainerOptionRow` (api.ts L292-296) is too thin — it returns `{id, reference, blNumber?}` only.
Widen to `{ id, reference, blNumber?, loadDate, contractItemIds: string[] }` (all straight off
`db.containers`; keep `getContainerOptions` a one-line map, sorted by `loadDate` desc to mirror
`getContainers`). This is additive for the two read-only consumers (InvoiceDetailPage L95,
InvoicePrintPage L27).

The three pickers each build the identical flat memo today
(`` `${c.reference} · ${c.blNumber || '—'}` ``). Replace with a **shared helper** that filters by a
`contractItemId` and labels `` `${reference} · ${formatDate(loadDate)}` ``:
- **AddItemsModal** (L41, L44-51, Select L221-234): per-row options via a memoized
  `Map<contractItemId, Option[]>`; the row's `contractItemId` is already in scope (`rows[field.name]`).
- **EditLineModal** (L30, L33-40, Select L105-113): filter by `item.contractItemId`. **Regression
  risk:** a line may already reference a container that does not carry that good (seeded data, or a
  container later edited). AntD renders an unmatched value as the raw id string. **Always union the
  currently-selected container into the filtered list**, flagged with
  `tradeInvoices.containerNotCarryingGood`.
- **ConvertContainerModal** (L26, L31-38, Select L73-82): **stays unfiltered** — `applyContainerToAll`
  assigns one container to *every* line, so a strict (superset) filter is empty for any
  multi-product invoice and the step becomes dead UI, while a "matches at least one line" filter
  would silently mis-assign the rest. Keep it optional, relabel with the load date, and add a hint
  that individual lines can be corrected afterwards (the per-line filter + the `missing-container`
  confirm guard remain the real safeguards).
- **Labels must stay plain strings** — all three pass `options` + `optionFilterProp="label"`; a
  ReactNode label would reproduce the §5.3 bleed *and* break search.
- Empty state: `notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
  description={t('tradeInvoices.noContainerForGood')} />}`. No file in src sets `notFoundContent`
  today — introduce it consistently across the pickers.

### 5.3 Goods Select bleed — one-line fix
**Root cause (verified in `node_modules/rc-select`, not inferred):** the goods Select supplies
options as JSX children, so `childrenAsData = true` (Select.js:119) and `fillFieldNames` resolves
label to `'children'` (valueUtil.js:39). The selected value is then
`rawLabel = option[optionLabelProp || mergedFieldNames.label]` (Select.js:169) — i.e. the whole
two-line `<div>`, hint included. The `label={i.product}` prop on `Option` only feeds search.

**Fix — add one prop** at ContainerFormModal L261:
```tsx
<Select showSearch optionFilterProp="label" optionLabelProp="label" …>
```
Now the selector shows `i.product` alone, the dropdown keeps its rich two-line rendering, and search
still filters on label. **Do not "modernise" to the `options` prop** — with `options`,
`fieldNames.label === 'label'`, so a ReactNode label bleeds exactly the same way.

## 6. Warehouse Receipt / Issue (new tab)

### 6.1 API (`src/services/api.ts`)
```ts
export interface InventoryDocItemInput {
  referenceDocumentItemId: string; invoiceItemId?: string; product: string; quantityMt: number;
}
export interface InventoryDocInput {
  type: InventoryDocType; warehouseId: string; invoiceId: string; date: string;
  notes?: string; items: InventoryDocItemInput[];
}
createInventoryDocument(input): Promise<InventoryDocument>
cancelInventoryDocument(id): Promise<InventoryDocument>
getInvoiceLinesForInventory(invoiceId): Promise<InventoryInvoiceLineRow[]>
getInvoiceOptions(): Promise<InvoiceOptionRow[]>
```
`createInventoryDocument` guards **in order**:
1. `'no-items'`
2. `'warehouse-required'` — id must exist **and** be `active` (mirrors the deleted L1615 check)
3. `'duplicate-reference-item'` (attach `err.products: string[]`) — server-side re-check, because two
   modals can stage the same line
4. **OUT only** `'insufficient-stock'` (attach `err.product`, `err.available`) — reuses `stockOf` +
   `getStockLevels`, the logic lifted from the deleted confirm block

Private helpers: **`nextInventoryDocItemId()`** — a monotonic max-scanning counter copying the
`nextInvoiceItemId` idiom (L1053-1064). **Do not** copy the deleted block's
`` `idocitem-${db.inventoryDocs.length + 1}-${idx + 1}` `` scheme (L1642): it is length-derived, so
after a cancel/create interleave it repeats and produces duplicate item ids.

**`usedReferenceDocumentItemIds(): Map<string, {docId, docNumber}>`** — scans
`db.inventoryDocs.filter(d => d.status !== 'CANCELLED').flatMap(d => d.items)`. Write it as
`!== 'CANCELLED'` (not `=== 'CONFIRMED'`) per requirement 6, so a future DRAFT status still blocks.

`getInvoiceLinesForInventory` returns per line:
`{ invoiceItemId, referenceDocumentItemId, product, quantityMt, containerId?, alreadyUsed,
usedInDocNumber?, usedInDocId? }`.

`cancelInventoryDocument` sets `status = 'CANCELLED'` + `persistDb()`, guarded by
`'cancel-blocked-stock'` when reversing an **IN** doc would drive any of its products negative —
lift the logic verbatim from the deleted `cancelInvoice` block (L1673-1684).

**Invoice picker policy (decision):** Receipt (IN) lists **CONFIRMED PURCHASE** provisional/invoice
documents; Issue (OUT) lists **CONFIRMED SALE** provisional/invoice documents. Orders and drafts are
excluded (nothing is received/issued against an unconfirmed document). This is a deliberate choice —
flag it at the review gate if receipts against drafts are wanted.

`nextInventoryDocNumber` pins the year to `TODAY`, not the document's own date, so a Receipt dated
2025 still gets `GRN-2026-####`. Harmless today but now user-visible since the user picks the date —
**derive the year from `input.date`** instead.

### 6.2 Queries (`src/services/queries.ts`)
```ts
qk.inventoryDocLines = (invoiceId: string) => ['inventoryDocLines', invoiceId] as const
qk.invoiceOptions = ['invoiceOptions'] as const
useInventoryDocLines(invoiceId)   // enabled: !!invoiceId
useInvoiceOptions()
useCreateInventoryDocument()      // → useInvalidateWarehouses()
useCancelInventoryDocument()      // → useInvalidateWarehouses()
```
`useInvalidateWarehouses` (L429-436) must additionally invalidate the bare prefix
`['inventoryDocLines']` (same trick as `['receivableInvoices']` at L308) or a just-consumed line is
re-offered when the modal reopens.

### 6.3 UI
- `WarehousePage.tsx`: extend `TAB_KEYS` (L23) with a third key **`documents`**
  (`warehouse.tabDocuments`) — the stock summary stays on `inventory`, and the documents table moves
  to the new tab together with the create/cancel actions. `PageHeader.extra` (L204-214) gains
  **New receipt** / **New issue** buttons when `tab === 'documents'`. Add an **actions column** with
  a Cancel Popconfirm (matching the warehouses-tab idiom at L103-119) — today nothing can cancel a
  doc from the UI. Replace the two full `useTradeInvoices` fetches (L40-41, L49-54) with the new
  lightweight `useInvoiceOptions`.
- **`InventoryDocFormModal.tsx` (new)** — closest pattern to copy is `AddItemsModal` (single `Form`
  + `Form.List` keyed by a stable id, insert-all button, selected-count hint, `Empty` state):
  warehouse Select (**active only**; handle the zero-active case that ConfirmInvoiceModal used to
  own), invoice Select (filtered per §6.1), date, notes; then the invoice's lines with per-row
  checkbox + qty. **Rows whose `alreadyUsed` is true are disabled** with a hint naming the document
  (`warehouse.lineAlreadyUsed` with `{{docNumber}}`). Issue-only: a live "available" hint per line
  from `useStockLevels` keyed on `product.trim().toLowerCase()` (same normalization as `stockOf`).
  Map every api error code to a toast.

## 7. i18n

New `warehouse.*` keys (following the block's existing grammar — nouns bare, `xPlaceholder`,
past-participle toasts, `tabX`, `noX`): `tabDocuments, newReceipt, newIssue, receiptTitle,
issueTitle, docDate, selectInvoice, invoicePlaceholder, noInvoiceLines, lineAlreadyUsed
({{docNumber}}), duplicateLines ({{products}}), selectAtLeastOne, insertAllLines, selectedCount,
docNotes, docCreated, docCancelled, cancelDocConfirm, cancelDoc`.

**Moves** from `tradeInvoices.*` → `warehouse.*` (they describe warehouse rules now):
`selectWarehouse`, `noActiveWarehouse`, `insufficientStock` ({{product}}, {{available}}),
`cancelBlockedStock`. **Delete** `tradeInvoices.cancelBlockedStock` after the move; delete
`warehouse.availableMt` only if the InvoiceDetailPage column is removed per §4 (it is).

New `tradeInvoices.*`: `noContainerForGood`, `containerNotCarryingGood`,
`containerApplyAllHint` (convert-modal hint). Rename `containers.shipmentDate` → `containers.loadDate`.

All three locales stay key-identical with real ar/fa translations.

## 8. Out of scope

Free-form (non-invoice) warehouse lines; product-id keyed stock (stock remains keyed on normalized
product name — a renamed product still orphans historical stock into a second bucket); container
quantity vs invoiced quantity capacity checks (the good filter proves carriage, not capacity);
journal/accounting; multi-container per invoice line.

## 9. Phases

- **A — Data & determinism:** types, `seedUuid`/`newGuid`, seed ref-ids (chain-shared + GRN copy),
  `loadDate` rename end-to-end, SCHEMA 4 + isCompatible, remove confirm/cancel warehouse coupling
  (api + ConfirmInvoiceModal + InvoiceDetailPage + queries). Gate green.
- **B — Pickers & style:** `ContainerOptionRow` widening, shared filtered picker helper across the
  three modals (+ EditLineModal union), `optionLabelProp` fix, i18n.
- **C — Warehouse documents:** api (create/cancel/lines/options + guards + helpers), queries, third
  tab, `InventoryDocFormModal`, cancel action, i18n.
- **D — Adversarial review + live verify:** the decisive test is **receive from a provisional, convert
  it to final, and confirm the same lines are refused** (requirement 6), plus determinism
  (`cust-am` 2,750,000), the convert ref-id survival assertion, stock guard on Issue, and all roles.

Each phase: `npm run typecheck && npm run lint && npm run build` green; own commit.
