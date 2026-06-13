# Containers (shipments) — create / edit / delete — Design

- **Date:** 2026-06-13
- **Status:** Approved (design); pending spec review
- **Area:** `finora-alpha` (Vite + React 18 + AntD 5 + TanStack Query, mock data)

## Context

The domain model is `Customer 1─* Contract 1─* Item (goods) 1─* Container (shipment)`.
Create/edit forms already exist for **Contracts** and **Goods**. The **Container**
("New container") action on `ContainersPage` is still a `comingSoon` stub, and the
containers table on `ContractDetailPage` is read-only. This adds full create / edit /
delete for containers, following the established Contract/Goods modal pattern, plus a
small set of real-world shipping-document fields.

## Goals

- Create, edit, and delete containers from both the global **Containers page** and a
  **contract's detail page**.
- Add three real-world shipping-document fields: **Bill of Lading no.**, **booking no.**,
  **seal no.** (chosen from the domain research below).
- Keep the financial core unchanged — it already matches real metals-trade practice.
- Maintain the existing data-integrity coupling: a container draws down its parent
  item's remaining MT; its invoice flows into the Invoices view and dashboard.

## Non-goals (explicitly out of scope)

- Vessel/voyage, container type (20GP/40HC), ports (POL/POD), gross/tare weight.
- A richer operational status lifecycle (BOOKED → SHIPPED → ARRIVED → CLEARED). Status
  stays `OPEN / PAID / OVERDUE` (receivables view).
- Quotational-period (M+1 average) pricing — fixed LME price per container is retained.
- Auto-creating a `Payment` when a container is marked `PAID`.
- Quantity tolerance (±%) — quantity is capped at the item's remaining MT.

## Domain research (summary)

Live web research (built-in search; Bright Data unavailable) into how LME metals desks
run container shipments. Key findings and how they map to the existing model:

- A shipment is identified by a **Bill of Lading no.** (transport contract + title) and a
  carrier **booking no.**; the physical box has a **container no.** (ISO 6346: 4 letters +
  7 digits — the mock already uses this, e.g. `MSNU8018095`) and a **seal no.** recorded on
  the B/L. → these are the three fields we add.
- **Net weight** of metal is the invoiced quantity (`quantityMt`). **Pricing**: LME
  reference × payable % + premium (USD/t) × net MT — matches `utils/calc` already.
- **Partial shipments** draw down the contracted quantity (modelled by `remainingMt`).
- **Due date** = arrival/B-L date + net payment days (matches `arrival + customer
  paymentTermsDays`).
- *Gap:* LME primary pages blocked the fetch (403); pricing detail came from the LME search
  abstract + secondary sources. Tolerance % is domain-standard, not a retrieved primary.

Sources: LME "LME prices in physical contracts"; "Quotational pricing basics" (LinkedIn);
Maersk shipping documents; ISO 6346 guide (pier2pier); container seal numbers (IncoDocs);
CIF Incoterms (Trade Finance Global).

## Approach

Chosen: **mirror the Contract/Goods pattern.** One reusable `ContainerFormModal` for
create + edit, opened from both pages; new api mutations recompute the parent item's
remaining MT and invalidate the dependent reads. (Rejected: detail-page-only create;
full logistics/lifecycle model.)

## Design

### 1. Data model — `src/types/index.ts`

`Container` gains three optional fields (everything else unchanged):

```ts
export interface Container {
  // …existing fields…
  /** Bill of Lading number (transport contract / title document). */
  blNumber?: string;
  /** Carrier booking number. */
  bookingNumber?: string;
  /** Container seal number (recorded on the B/L). */
  sealNumber?: string;
}
```

### 2. Data layer — `src/services/api.ts`

New input type and mutations (in-memory, write-through to `db`, then `reindex()` — same
pattern as `createContract`/`createItem`):

```ts
export interface ContainerInput {
  contractId: string;
  itemId: string;
  reference: string;
  quantityMt: number;
  lmePrice: number;
  premium: number;
  shipmentDate: string;      // ISO
  arrivalDate?: string;      // ISO
  dueDate: string;           // ISO
  status: ContainerStatus;
  blNumber?: string;
  bookingNumber?: string;
  sealNumber?: string;
}

createContainer(input): Promise<ContainerRow>
updateContainer(id, input): Promise<ContainerRow>
deleteContainer(id): Promise<void>
```

Behaviour:
- **ID generation:** `cnt-${contractId}-${n}` where `n` = max existing index for that
  contract + 1 (collision-checked against `db.containers`).
- **Invoice (derived, never user-entered):** `invoiceUSD = round((lmePrice + premium) ×
  quantityMt, 2)` via `containerInvoice` in `utils/calc`.
- **Remaining MT recompute:** a helper `recomputeItemRemaining(itemId)` sets the parent
  item's `remainingMt = round(max(item.quantityMt − shippedMt(itemId, db.containers), 0), 3)`.
  Called after every create/update/delete. On **update where `itemId` changed**, recompute
  **both** the old and new items. On **delete**, recompute the freed item.
- **Item status is NOT auto-changed** (the user owns item status via the goods form); only
  `remainingMt` is recomputed. (Decision — avoids surprising overrides.)
- The modal is passed the existing `ContainerRow` for edit (it already carries all
  `Container` fields), so no separate `getContainer` query is needed.

### 3. Query hooks — `src/services/queries.ts`

`useCreateContainer` / `useUpdateContainer` / `useDeleteContainer`. On success invalidate:
`containers` (prefix-matches `containersByContract`), `contract(contractId)`, `contracts`,
`accounts`, `kpis`, `invoices`, `productVolumes`, `aging`. (Reuse the existing
`useInvalidateTrade` helper, extended with `invoices` + `aging`.)

### 4. Form — `src/pages/contracts/ContainerFormModal.tsx`

Props: `{ open, onClose, contract?, container? }`. `contract` fixes the contract (detail
page); its absence shows a contract picker (global page). `container` => edit mode.
Uses the established **`initialValues` + `key` + `destroyOnHidden`** lifecycle and the
try/catch submit with `message.error(t('common.saveFailed'))`.

Data sources: `useContracts()` (each `ContractRow` carries its `items`), `useCustomers()`
(for the customer's `paymentTermsDays`).

Fields:
- **Contract** — `Select` (search), locked when `contract` is provided; changing it resets the item.
- **Goods (item)** — `Select` from the selected contract's items; label shows product +
  remaining MT. Required.
- **Container ref no.** (`reference`) — required.
- **Seal no.** / **B/L no.** / **Booking no.** — optional text.
- **Quantity (MT)** — required, `> 0`, **≤ the item's remaining MT** (counting back the
  container's own qty when editing the same item). Helper text shows the available remaining.
- **LME price (USD/MT)** — required; defaults to `unitPrice(item)` when an item is chosen.
- **Premium (USD/MT)** — required, default `0`.
- **Shipment date (ETD)** — required. **Arrival date (ETA)** — optional.
- **Due date** — required; auto-filled to `(arrivalDate || shipmentDate) +
  customer.paymentTermsDays`, editable.
- **Status** — `OPEN / PAID / OVERDUE`, default `OPEN`.
- **Live preview:** `Invoice = (LME + premium) × qty` rendered via `Money` (like the goods form).

### 5. Wiring

- **`ContainersPage`** — "New container" opens the modal (no fixed contract → contract +
  item pickers). Add an **Actions** column (Edit · Delete with `Popconfirm`) and an
  **expandable row** showing B/L · Booking · Seal.
- **`ContractDetailPage`** — "Add container" button on the Containers card `extra` (contract
  fixed) + per-row Edit/Delete + the same expandable row. Bump the container table `scroll.x`
  for the new actions column.
- Empty doc values render as `—` (reuse `common.none`).

### 6. i18n — `src/i18n/locales/{en,ar,fa}.json`

Add under `containers`: `editContainer`, `addContainer`, `created`, `updated`, `deleted`,
`deleteConfirm`, `blNumber`, `bookingNumber`, `sealNumber`, `selectContract`, `goods`
(item label), `remainingHint` (e.g. "{{mt}} remaining"), `qtyExceedsRemaining`. Reuse
existing `common.*` (`required`, `saveFailed`, `actions`, `edit`, `delete`, `none`, `save`,
`cancel`) and `status.*`. All three locales kept in sync; layout RTL-safe.

### 7. Mock data — `src/mock/data.ts`

Seed the three new fields on generated containers (and the two Alco anchor containers) with
plausible values: B/L = carrier prefix (`MAEU`/`MSCU`/`COSU`/`HLCU`/`ONEY`) + 9 digits;
booking = `BK` + 8 digits; seal = (`SL`/`CN`/`ML`) + 7 digits — using the existing seeded
PRNG so the dataset stays deterministic.

## Edge cases & decisions

- Editing a container's **item** recomputes remaining for both old and new items.
- **Delete** restores the item's remaining MT (and is the only way to undo an over-ship).
- `invoiceUSD` is always derived; the field is never user-editable.
- A new/edited container automatically appears on the **Invoices** page and **dashboard**
  (both derive from `db.containers`); the cache invalidations cover this.
- Item `status` is left to the user; only `remainingMt` is recomputed.
- Mock edits are **in-memory only** (reset on reload), consistent with the rest of the app.

## Testing & verification

- `npm run typecheck`, `npm run lint`, `npm run build` clean.
- Live drive (preview): create a container on a contract → item remaining decreases, the
  invoice appears on the Invoices page, dashboard KPIs update; edit qty → remaining
  recomputes; delete → remaining restored; expandable row shows the docs. Check the modal in
  light/dark and `fa` (RTL).
- Optional: adversarial multi-agent review of the diff (data-layer correctness, form
  lifecycle, i18n/RTL), as done for the Contract/Goods forms.

## Affected files

- `src/types/index.ts` (3 fields)
- `src/services/api.ts` (`ContainerInput`, 3 mutations, remaining-recompute helper)
- `src/services/queries.ts` (3 hooks; extend invalidation)
- `src/pages/contracts/ContainerFormModal.tsx` (new)
- `src/pages/containers/ContainersPage.tsx` (new-button, actions, expandable rows)
- `src/pages/contracts/ContractDetailPage.tsx` (add-container, actions, expandable rows)
- `src/i18n/locales/{en,ar,fa}.json` (keys)
- `src/mock/data.ts` (seed doc fields)
