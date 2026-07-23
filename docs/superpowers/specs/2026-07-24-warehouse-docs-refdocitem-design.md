# Warehouse Receipt/Issue + ReferenceDocumentItemId + Load Date — Design

Date: 2026-07-24 · Branch: `feature/warehouse-docs-refdocitem` · Status: design v2 (adversarial review folded in), pre-approval

## 1. Scope & approved decisions

Requested changes:
1. Container `shipmentDate` → **`loadDate`** ("Load date").
2. Invoice-line container pickers **filter to containers carrying that line's good**, label shows the load date.
3. Fix the **goods Select** in ContainerFormModal (hint text bleeds into the selected value).
4. New **Warehouse tab** to create custom **Receipt (IN)** / **Issue (OUT)** documents.
5. Every invoice line gets a permanent **`referenceDocumentItemId`** (UUID) that **survives provisional→final conversion**.
6. Warehouse doc creation **dedupes on `referenceDocumentItemId`**.

User-approved decisions:
- **Auto-creation of warehouse docs on final-invoice confirm is REMOVED ENTIRELY.** All stock
  movements are created by hand; the stock check moves to Issue creation.
- **Receipt/Issue are invoice-sourced only** (no free-form lines).
- **Rename goes to the data field**, not just the label.
- **Consumption is quantity-tracked** (not presence-only): a line carries a consumed-MT ledger and
  is only exhausted when fully consumed. *(Decision 2026-07-24 after review — see §6.1.)*
- **Container picker filters by default with a "Show all containers" toggle** — never a dead end.
  *(Decision 2026-07-24 after review; a strict filter provably blocks 29/120 seeded goods.)*

All line references verified by a 5-agent code map (`wf_90ebdbba-e44`) and a 3-lens adversarial
review (`wf_26dceb2c-02d`) that read `rc-select` and **executed the seed in node**.

## 2. Data model (`src/types/index.ts`) — SCHEMA_VERSION 3 → 4

- `Container.shipmentDate` → **`loadDate: string`** (L110).
- `InvoiceItem` gains **`referenceDocumentItemId: string`** (required).
- `InventoryDocumentItem` gains **`referenceDocumentItemId: string`** (keep `invoiceItemId?` — they
  differ: `invoiceItemId` points at one concrete row; the ref id is the chain-stable identity).

**SCHEMA_VERSION 3 → 4 is mandatory.** Without it a persisted v3 blob hydrates with
`loadDate === undefined` (blank cells; `dayjs(undefined)` in the edit form silently stamps *today*)
and `referenceDocumentItemId === undefined` on every line — which makes the ledger treat all lines
as one bucket.

`isCompatible()` additions (defensive — `createInvoice` produces empty-items drafts, so **find** the
first entity that has items; never index `[0].items[0]` blindly, or a leading empty draft
false-negatives and silently wipes user data):
```ts
if (o.containers.length && typeof (o.containers[0] as any)?.loadDate !== 'string') return false;
const invWithItems = (o.invoices as any[]).find((i) => Array.isArray(i?.items) && i.items.length);
if (invWithItems && typeof invWithItems.items[0].referenceDocumentItemId !== 'string') return false;
const docWithItems = (o.inventoryDocs as any[]).find((d) => Array.isArray(d?.items) && d.items.length);
if (docWithItems && typeof docWithItems.items[0].referenceDocumentItemId !== 'string') return false;
```

## 3. UUIDs & determinism

**Runtime** — one generation site: `addInvoiceItems`' `newItem` literal (api.ts L1443-1456):
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
(Guarded: `crypto.randomUUID` is undefined on non-secure origins, and this app is served over plain
HTTP on a LAN IP in production.)

**Seed** — deterministic, UUID-shaped, **zero PRNG draws**, in the existing zero-`rnd()` region
(data.ts L485+). **The salt must be PREFIXED, not appended** — review proved that appending makes
FNV-1a suffix-extend, so all four passes collide together and effective strength is 32 bits, with a
demonstrated real collision (`seedUuid('k72vu') === seedUuid('keuea')`):
```ts
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
/** Deterministic UUID-shaped id (~120-bit). Version+variant nibbles forced to '0' → can never
 *  equal a runtime v4 GUID. Salt is PREFIXED so the four passes are independent. */
function seedUuid(key: string): string {
  const h = hex8(fnv1a(`0|finora-ref|${key}`)) + hex8(fnv1a(`1|finora-ref|${key}`))
          + hex8(fnv1a(`2|finora-ref|${key}`)) + hex8(fnv1a(`3|finora-ref|${key}`));
  return [h.slice(0,8), h.slice(8,12), '0'+h.slice(13,16), '0'+h.slice(17,20), h.slice(20,32)].join('-');
}
```
**Regression assertion (exact expected numbers):** the 176 seed lines produce **174 distinct ids**;
the two duplications are the intended PO/PP/PI chain share. 0 malformed, 0 with version nibble `4`.
Re-verify uniqueness after the prefix change.

**Seed keys:**
| Lines | Key |
|---|---|
| PO/PP/PI chain (L560, L582-584, L607-609) | `` `inv-po-0001|${contractItem.id}` `` for **all three** |
| SO draft (L676) | `` `inv-so-0001|${firstItem.id}` `` |
| Historical invoices (`makeHistoricalInvoiceItem` L754-783, call L795) | `raw.id` |
| Seeded GRN items (L640-646) | **copy `piItems[idx].referenceDocumentItemId`** — never mint |

Give `makeInvoiceItem` a `refKey: string` parameter rather than deriving inside it.

**`convertInvoice` needs no functional change** — its copy (api.ts L1717-1724) spreads `...it`, so
the ref id carries through. Add a **load-bearing comment**: replacing the spread with an explicit
field list would silently break requirement 5 with no type error.

**Closing the convert bypass (review finding):** on a converted DRAFT final the user can delete a
line and re-add the same contract item, minting a *fresh* ref id — the same goods could then be
received twice (once the provisional drops out of `chainLeafDocs`, `itemUninvoicedMt` reports the
quantity as uninvoiced again). **Fix:** in `addInvoiceItems`, when the target invoice has a
`refInvoiceId`, walk the chain for a line with the same `contractItemId` and **reuse its
`referenceDocumentItemId`**; mint a new GUID only when none exists.

**Do NOT change `InvoiceItem.id` to a UUID** — `invoiceItemSeq` regex-scans `/^invitem-(\d+)$/`
(api.ts L1053-1060); UUID ids reset it to 0 and collide with seeded ids.

**Anchor:** `cust-am` creditLimit === **2,750,000**. All new seed code sits at/after data.ts L485 and
calls no `rnd()`/`pick()`/`between()`/`intBetween()`.

## 4. Remove the confirm/cancel warehouse coupling

> **Sequencing (review finding):** `tsconfig.app.json` sets `noUnusedLocals`/`noUnusedParameters`,
> so deleting the only callers of `stockOf`, `nextInventoryDocId`, `nextInventoryDocNumber` and the
> `InventoryDocument`/`InventoryDocType` imports produces **TS6133 build errors** until §6.1 re-uses
> them. (Lint would *not* have caught it — `no-unused-vars` is a warning and `eslint .` has no
> `--max-warnings`.) Therefore **§4's deletions and §6.1's `createInventoryDocument` /
> `cancelInventoryDocument` must land in the SAME commit** — see §9.

`src/services/api.ts`:
- **`confirmInvoice`** — delete the final-invoice warehouse block (L1613-1650): `warehouse-required`,
  the SALE stock check, and GRN/GDN creation. Delete `ConfirmInvoiceOptions` (L1559-1561) and the
  `options` param → **`confirmInvoice(id: string)`**. Delete now-dead `isFinalType` (L1555-1557).
  Keep the tail; update the JSDoc (L1563-1570). Guard order becomes
  `not-draft → no-items → missing-lme-price → missing-container → qty-exceeds-remaining`.
- **`cancelInvoice`** — delete the doc lookup (L1672), the `cancel-blocked-stock` guard (L1673-1684)
  and the cascade (L1687). Keep `cancel-blocked-successor`. **Cancelling an invoice no longer
  touches warehouse documents.** Update the JSDoc.
- `stockOf`, `nextInventoryDocId`, `nextInventoryDocNumber` and the two type imports are **retained
  and re-used** by §6.1 in the same commit.

`ConfirmInvoiceModal.tsx` — strip `useWarehouses`, `activeWarehouses`, `warehouseId` state, the
default-selection memo, `noActiveWarehouse`, `okDisabled`/`okButtonProps`, the `{isFinal && …}`
warehouse block (L97-111), the `Alert`/`Select` imports, **and the now-unused
`import { useMemo, useState } from 'react'` (L1)**, plus the `insufficient-stock` +
`warehouse-required` error branches. Keep `formatMt` (totalWeight) and `isFinal` (it gates
`onConfirmed?.()`, the uninvoiced alert).

`InvoiceDetailPage.tsx` — delete the `cancel-blocked-stock` branch (L189). **Remove the draft-sale
"Available stock" column** (L224-242) with `useStockLevels` (L50, L94) and `stockByProduct`
(L143-148): it previewed a check that no longer exists at confirm and summed across *all*
warehouses. **Also remove what that orphans:** `isSaleFinal` (L133), the `theme` import (L20) and
the `const { token } = theme.useToken()` destructure (L88) — `token` is referenced only inside the
deleted column, so leaving them breaks the build under `noUnusedLocals`.

`queries.ts` — `useConfirmInvoice` variable becomes `id: string`. In `useInvalidateInvoices`
(L286-314): remove `qk.inventory`/`qk.stock` (L300-301) **and add
`qc.invalidateQueries({ queryKey: qk.invoiceOptions })`** — the new invoice picker and the documents
table's number map are status-dependent and nothing else refreshes them (`staleTime: 60_000`,
`refetchOnWindowFocus: false`, so a just-confirmed invoice would be missing for up to a minute).
Fix the helper's doc comment.

## 5. Load date, container pickers, goods Select

### 5.1 `shipmentDate` → `loadDate`
- `types/index.ts` L110.
- `mock/data.ts`: `RawContainerSeed` (L40); generator local const (L274, feeding L275 arrival /
  L276 due) and literal (L296); the two verbatim Alco containers (L378, L395); the reshape (L711).
  **Two semantic readers must be renamed too:** `lmeDate: raw.shipmentDate` (L778) and the
  historical `invoiceDate = MAX(raw.shipmentDate)` (L797-802, reused as `createdAt` L817 and the
  seeded payment date L831). **Pure identifier rename — no value or ordering change** (these dates
  drive aging/KPIs).
- `api.ts`: `getContainers` sort (L269), `ContainerInput` (L650), `createContainer` (L678),
  `updateContainer` (L718).
- `ContainersPage.tsx`: column title/dataIndex/sorter (L59-64).
- `ContainerFormModal.tsx`: **all five sites atomically** — `ContainerFormValues` (L22), both
  `initialValues` branches (L86, L95), submit (L138), and the `Form.Item name="shipmentDate"` string
  (L206). A missed `name` does not fail typecheck; it fails at runtime as a required-field error.
- i18n: `containers.shipmentDate` ("Shipped") → **`containers.loadDate` ("Load date")** in en/ar/fa
  (ar `تاريخ التحميل`, fa `تاریخ بارگیری`). **Do NOT rename `contracts.progress`** (also "Shipped",
  L236) — it labels `shippedPct`. Also reword `containers.subtitle` ("Shipments and their invoice
  status" — containers carry no invoice status since the logistics reshape).

### 5.2 Container pickers
Widen `ContainerOptionRow` (api.ts L292-296) to
`{ id, reference, blNumber?, loadDate, contractItemIds: string[] }`, sorted by `loadDate` desc.
Additive for the two read-only consumers (InvoiceDetailPage L95, InvoicePrintPage L27).

Replace the three duplicated flat memos with a **shared helper**: options filtered by a
`contractItemId`, labelled `` `${reference} · ${formatDate(loadDate)}` `` (**plain strings** — all
three pass `optionFilterProp="label"`; a ReactNode label would reproduce §5.3 *and* break search).

- **AddItemsModal** (L41, L44-51, Select L221-234) — per-row options; the row's `contractItemId` is
  in scope via `rows[field.name]`. **Show-all toggle** (approved): a small `Switch`/link in the
  modal flips every row's picker to the unfiltered list. Default = filtered.
- **EditLineModal** (L30, L33-40, Select L105-113) — filter by `item.contractItemId`, same toggle.
  **Always union the currently-selected container** into the list (flagged with
  `tradeInvoices.containerNotCarryingGood`) so an existing non-carrying value never renders as a raw
  id. *(Corrected rationale: the seed contains 0 non-carrying lines and `assertNoRemovedGoodInUse`
  already blocks removal/swap of an in-use good, so the union is a display safety net — the actual
  producer is `applyContainerToAll`, fixed below.)*
- **`applyContainerToAll` (api.ts L1762-1768) — fix the root cause.** Today it assigns one container
  to *every* line with no carriage check; since every seeded container carries exactly one good and
  29 of 46 invoices span multiple goods, apply-to-all **mis-assigns by construction**, and
  `confirmInvoice` never re-checks carriage. Change it to assign **only to lines the container
  actually carries**, and return the skipped count so ConvertContainerModal can report
  "applied to N of M lines". ConvertContainerModal's picker then safely stays **unfiltered**
  (a strict superset filter would be empty for any multi-product invoice = dead UI).
- Empty state: `notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
  description={t('tradeInvoices.noContainerForGood')} />}` plus the show-all toggle as the escape.

### 5.3 Goods Select bleed — one-line fix
**Root cause (verified in `node_modules/rc-select`):** options are supplied as JSX children, so
`childrenAsData = true` (Select.js:119) and `fillFieldNames` resolves label to `'children'`
(valueUtil.js:39); the selected value is `option[optionLabelProp || fieldNames.label]`
(Select.js:169) — the whole two-line `<div>`. The `label={i.product}` prop only feeds search.

**Fix — one prop** at ContainerFormModal L261: `optionLabelProp="label"`. Selector then shows the
product alone; the dropdown keeps its rich rendering; search still works. **Do not "modernise" to
the `options` prop** — with `options`, `fieldNames.label === 'label'`, so a ReactNode label bleeds
identically.

## 6. Warehouse Receipt / Issue

### 6.1 API
```ts
export interface InventoryDocItemInput { referenceDocumentItemId: string; quantityMt: number; }
export interface InventoryDocInput {
  type: InventoryDocType; warehouseId: string; invoiceId: string; date: string;
  notes?: string; items: InventoryDocItemInput[];
}
```
**`product` and the maximum quantity are derived SERVER-SIDE** from the invoice line looked up by
`referenceDocumentItemId` within `input.invoiceId` — never taken from the client (otherwise a caller
can mint phantom stock, or send a negative qty on an IN doc to bypass the OUT-only guard).

**Quantity ledger (approved decision).**
```ts
usedQtyByReferenceDocumentItemId(): Map<string, number>   // Σ over docs where status !== 'CANCELLED'
```
Written as `!== 'CANCELLED'` (not `=== 'CONFIRMED'`) so a future DRAFT status still blocks.
`getInvoiceLinesForInventory(invoiceId)` returns per line:
`{ invoiceItemId, referenceDocumentItemId, product, quantityMt, usedMt, remainingMt, containerId?,
usedInDocNumbers: string[] }` where `remainingMt = quantityMt − usedMt`. A line is offered while
`remainingMt > 1e-9` and disabled (with the consuming document names) when exhausted.

`createInventoryDocument` guards **in order**:
1. `'no-items'`
2. `'warehouse-required'` — id exists **and** is `active`
3. `'invoice-not-confirmed'` / `'invoice-side-mismatch'` — the invoice must be a **chain-leaf
   CONFIRMED** priced document (`chainLeafDocs(side)`), and IN⇔PURCHASE / OUT⇔SALE. Enforced in the
   API, not only the modal (otherwise an OUT doc against a purchase invoice permanently consumes
   that line's ledger and blocks its legitimate receipt).
4. `'line-not-on-invoice'` — every `referenceDocumentItemId` must belong to that invoice
5. `'invalid-quantity'` — `qty <= 0`
6. `'exceeds-remaining'` (attach `err.product`, `err.remaining`) — `qty > remainingMt`, re-checked
   server-side because two modals can stage the same line
7. **OUT only** `'insufficient-stock'` (attach `err.product`, `err.available`) — with a **running
   deduction**: build a mutable `Map<productKey, number>` from `getStockLevels()` and subtract each
   line as it validates, so two lines of the same product that are jointly over stock are caught
   (today's confirm-block logic re-reads one snapshot per line and would pass them).

Private helpers: **`nextInventoryDocItemId()`** — monotonic max-scanning counter copying the
`nextInvoiceItemId` idiom (L1053-1064). **Do not** copy the deleted block's
`` `idocitem-${db.inventoryDocs.length + 1}-${idx + 1}` `` scheme: it is length-derived and repeats
after a cancel/create interleave.

`cancelInventoryDocument(id)` sets `status = 'CANCELLED'` + `persistDb()`; guard
`'cancel-blocked-stock'` when reversing an **IN** doc would drive any product negative — with the
same running accumulation (the lifted `cancelInvoice` loop re-reads one snapshot and misses joint
cases).

`nextInventoryDocNumber` currently pins the year to `TODAY`; **derive it from `input.date`** now
that the user picks the date.

**Two distinct invoice reads** (they serve incompatible needs — do not collapse them):
- `getInventorySourceInvoices(type)` → chain-leaf CONFIRMED, side-matched: feeds the **picker**.
- `getInvoiceOptions()` → **ALL** invoices `{ id, invoiceNumber, invoiceType, status }`: feeds the
  documents table's id→number **label map**, which must resolve even for cancelled/superseded
  invoices (§4 removed the cascade, so a CONFIRMED doc can outlive a CANCELLED invoice).

### 6.2 Queries
```ts
qk.inventoryDocLines = (invoiceId: string) => ['inventoryDocLines', invoiceId] as const
qk.invoiceOptions = ['invoiceOptions'] as const
qk.inventorySourceInvoices = (type: InventoryDocType) => ['inventorySourceInvoices', type] as const
useInventoryDocLines(invoiceId)   // enabled: !!invoiceId
useInvoiceOptions() · useInventorySourceInvoices(type)
useCreateInventoryDocument() · useCancelInventoryDocument()   // → useInvalidateWarehouses()
```
`useInvalidateWarehouses` (L429-436) must also invalidate the bare prefixes `['inventoryDocLines']`
and `['inventorySourceInvoices']`. `useInvalidateInvoices` gains `qk.invoiceOptions` (§4).

### 6.3 UI
- `WarehousePage.tsx`: add a third `TAB_KEYS` entry **`documents`**; the documents table moves there
  with **New receipt** / **New issue** buttons in `PageHeader.extra` and a **Cancel** Popconfirm
  actions column (nothing can cancel a doc today). Stock summary stays on `inventory`. Existing
  `?tab=inventory` URLs keep resolving. Use `useInvoiceOptions` for the label map.
- **`InventoryDocFormModal.tsx` (new)** — pattern: `AddItemsModal` (single `Form` + `Form.List`
  keyed by a stable id, insert-all, selected-count, `Empty`). Warehouse Select (**active only**;
  handle zero-active — the string `noActiveWarehouse` moves here from `tradeInvoices.*`), invoice
  Select (from `useInventorySourceInvoices`), date, notes; then the lines with per-row checkbox and
  **qty capped at `remainingMt`** (shown as `warehouse.remainingHint`). Exhausted rows are disabled
  with `warehouse.lineAlreadyUsed` naming the consuming document(s). Issue-only: a live available
  hint from `useStockLevels` keyed on `product.trim().toLowerCase()`. Every api code → a toast.

## 7. i18n

New `warehouse.*`: `tabDocuments, newReceipt, newIssue, receiptTitle, issueTitle, docDate,
selectInvoice, invoicePlaceholder, noInvoiceLines, lineAlreadyUsed ({{docNumbers}}), remainingHint
({{mt}}), exceedsRemaining ({{product}},{{remaining}}), invalidQuantity, lineNotOnInvoice,
invoiceNotConfirmed, invoiceSideMismatch, selectAtLeastOne, insertAllLines, selectedCount, docNotes,
docCreated, docCancelled, cancelDocConfirm, cancelDoc`.

**Moves** `tradeInvoices.* → warehouse.*`: `selectWarehouse`, `noActiveWarehouse`,
`insufficientStock` ({{product}},{{available}}), `cancelBlockedStock`. Delete
`tradeInvoices.cancelBlockedStock` after the move.

**Keep `warehouse.availableMt`** — retargeted to the Issue-line available hint (§6.3). *(It is
deleted from InvoiceDetailPage but still needed; the earlier draft deleted the key outright and left
§6.3 with no key — an implementer would have hard-coded a string.)*

New `tradeInvoices.*`: `noContainerForGood`, `containerNotCarryingGood`, `showAllContainers`,
`containerAppliedToSome` ({{applied}},{{total}}). Rename `containers.shipmentDate` →
`containers.loadDate`; reword `containers.subtitle`.

All three locales key-identical, real ar/fa translations.

## 8. Out of scope

Free-form (non-invoice) warehouse lines; product-id keyed stock (stock stays keyed on normalized
product name, so renaming a product orphans historical stock); container capacity checks (carriage
≠ capacity); journal/accounting; multi-container per invoice line.

## 9. Phases

- **A — Data & determinism:** types, `seedUuid` (prefixed salt) / `newGuid`, seed ref ids
  (chain-shared + GRN copy), the ref-id reuse on re-add, `loadDate` rename end-to-end, SCHEMA 4 +
  `isCompatible`. Gate green. *(No api warehouse deletions yet.)*
- **B — Warehouse documents + decoupling (ONE commit):** §4's confirm/cancel deletions **together
  with** §6.1's `createInventoryDocument`/`cancelInventoryDocument`/reads, queries, the third tab,
  `InventoryDocFormModal`, cancel action, i18n. They must land together or `noUnusedLocals` breaks
  the build.
- **C — Pickers & style:** `ContainerOptionRow` widening, shared filtered picker + show-all toggle,
  EditLineModal union, `applyContainerToAll` carriage fix, `optionLabelProp` fix, i18n.
- **D — Adversarial review + live verify.**

**Phase D acceptance test — the seeded chain CANNOT be used** (review-verified): `inv-pp-0001`
already has a successor so convert throws `has-successor`, and its only line is already consumed by
the seeded GRN. The test must **build its own chain live**: create a `PURCHASE_PROVISIONAL` on a
contract with uninvoiced qty → add items → assign containers → confirm → **receive part of a line**
(verify the remainder is still offered) → **receive the rest** (verify the line goes exhausted) →
**convert to final** → **assert every line is refused**. Plus: determinism (`cust-am` 2,750,000),
the convert ref-id survival assertion, the Issue stock guard, cancel-then-re-receive, and all roles.
