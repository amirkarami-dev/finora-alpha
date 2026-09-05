# Invoices over the contract, and contract quantity changes — design

Date: 2026-09-05. Status: approved by the owner in chat (2026-09-05).

## 1. Goal

In this business a document may carry **more** of a goods line than the contract says. Today the
server refuses that (`qty-exceeds-remaining`) and the forms cap every quantity box. From now on:

1. A document line above the contract's remaining quantity is **accepted**, on add, on edit and on
   confirm. The document shows a warning with a link to the contract.
2. The contract page shows, per goods line, how much the confirmed documents are **over the
   contract**. The app works this out; nobody types it.
3. A goods line's quantity can be changed the **formal way**: a "Change quantity" dialog takes
   `+`/`−` MT and a note, updates the quantity and keeps a **history row**. The history is shown
   on the contract page and never edited.

Words: "goods line" = `ContractItem` / `Item`; "document" = any of the six trade document types;
"confirmed" = `Invoice.Status == CONFIRMED`.

## 2. Rules

### 2.1 Over the contract is allowed

- `ContractQuantityGuard.Check` keeps computing `ContractQtyCheck` (contract quantity, already
  invoiced, on this document, remaining, requested, exceeds). Nothing throws on `Exceeds` any
  more: `AddItemsAsync`, `UpdateItemAsync` and `ConfirmAsync` in `InvoiceService` drop the
  `throw ContractQuantityGuard.Exceeded(...)` branches. `ContractQuantityGuard.Exceeded` is
  deleted and the code `qty-exceeds-remaining` is removed from `contracts/error-codes.json`.
- The **remaining** figure never goes below 0 (unchanged).
- The **over-contract** figure of a goods line is derived, never stored:
  `overMt = max(confirmedInvoicedMt − quantityMt, 0)` where `confirmedInvoicedMt` is the sum of
  the goods line's confirmed claims on the contract's own side (`InvoiceMath.ConfirmedClaimsByItem`
  on the server, `confirmedClaimsByItem` in `services/api.ts`), rounded with `Rounding.Quantity`
  / `roundMt`. Drafts never count.
- A **document line's** over figure (for the warning on the document) is, per goods line, this
  document's own lines for that goods minus what the contract has left for it with this
  document excluded (`getContractRemaining(contractId, side, invoice.id)`), when positive.
  The browser computes it in `pages/tradeInvoices/overContract.ts`.
- Shrinking a goods line below what is already invoiced is now allowed. `quantity-below-invoiced`
  is removed from the code list, from `ContractService.UpdateItemAsync` and from
  `ItemFormModal`. The over-contract column shows the effect.

### 2.2 Change quantity (formal)

- New entity `ContractItemChange` under a goods line:

  | Field | Type | Meaning |
  |---|---|---|
  | `Id` | string | `Guid.CreateVersion7().ToString()` |
  | `ContractItemId` | string | parent key, set from the route |
  | `At` | DateTimeOffset | server clock at save |
  | `UserId` | Guid | from the session |
  | `UserName` | string | the session's `Name`, copied so the row reads without a join |
  | `DeltaMt` | decimal (quantity column, 6 dp) | positive or negative, never 0 |
  | `BeforeMt` | decimal | goods quantity before |
  | `AfterMt` | decimal | goods quantity after (= before + delta) |
  | `Note` | string | required, trimmed, ≤ 300 chars |

  Table `erp.contract_item_changes`, one migration `AddContractItemChanges`, no data step.
- Endpoint `POST /api/erp/contracts/{id}/items/{itemId}/changes`, permission `contracts` (the
  same key that guards editing a goods line). Body `{ "deltaMt": decimal, "note": string }`.
  Returns the contract, like the other contract endpoints (`{ entity: Contract }`).
- Server rules in `ContractService.ChangeItemQuantityAsync`:
  - `deltaMt` rounded with `Rounding.Quantity`; 0 after rounding → `change-delta-zero`.
  - `quantityMt + deltaMt` must be > 0, else `change-below-zero` with `extensions.quantityMt`
    (the current quantity) and `extensions.deltaMt`.
  - `note` blank → `change-note-required`.
  - On success: `item.QuantityMt += deltaMt`, `RemainingMt` recomputed the way
    `UpdateItemAsync` recomputes it today, one `ContractItemChange` appended, saved in one
    transaction.
- Editing the goods line through the existing `PUT .../items/{itemId}` still changes
  `quantityMt` directly and writes **no** history row. Only the new endpoint writes history.
- The **original quantity** of a goods line is `quantityMt − Σ deltaMt` of its history rows.
  It is derived, not stored.
- History rows are never edited or deleted. There is no endpoint that deletes a goods line, so
  the cascade on the foreign key only matters for the snapshot replace path.

### 2.3 What is not changed

Warehouse documents, stock, cost of sales, allocations, claims and reports keep reading
`quantityMt` and the confirmed claims exactly as today. Only the ceiling goes away.

## 3. Server (`backend/`)

- `Finora.Erp.Domain`: `ContractItemChange` class; `ContractItem.Changes`
  (`ICollection<ContractItemChange>`, `[]`), like `Partners`.
- `TradeConfiguration`: `ContractItemChangeConfiguration` — table name, key, `DeltaMt`,
  `BeforeMt`, `AfterMt` as quantity columns, `Note` max length 300, index on
  `ContractItemId`, cascade delete from the goods line.
- `SnapshotService`: `Include(c => c.Items).ThenInclude(i => i.Changes)` wherever
  `Partners` is included today (both the read and the replace paths); `ErpSnapshot` needs no new
  top-level list because the rows travel inside the goods line.
- `ContractContracts`: `ContractItemChangeInput(decimal DeltaMt, string? Note)`.
- `ContractService.ChangeItemQuantityAsync(string contractId, string itemId, ContractItemChangeInput input, Guid userId, string userName, CancellationToken)`.
- `ContractEndpoints`: the new `MapPost` on the existing group (the group already carries
  `.RequirePermission("contracts")`); user id from `IdentityEndpoints.UserIdClaim` and the
  name from `ClaimTypes.Name`, both set at sign-in.
- `InvoiceService`: remove the three `Exceeds` throws and the `Check` calls that only fed them.
  `ContractQuantityGuard.cs` (with `ContractQtyCheck`) is deleted: nothing else reads it and no
  test references it.
- `ContractService.UpdateItemAsync`: remove the `BelowInvoiced` refusal.
- `contracts/error-codes.json`: remove `qty-exceeds-remaining` and `quantity-below-invoiced`;
  add `change-delta-zero`, `change-below-zero`, `change-note-required`.
- Tests (`ContractTests` / `InvoiceTests`):
  - adding a line above the remaining quantity succeeds and the contract's remaining reads 0;
  - editing a line above the remaining quantity succeeds;
  - confirming a document whose lines exceed the contract succeeds;
  - a change of `+20` on a 100 MT line: quantity 120, one history row with before 100,
    after 120, the caller's name, the note;
  - a change of `−100` on a 100 MT line → `change-below-zero`; `0` → `change-delta-zero`;
    blank note → `change-note-required`;
  - shrinking a goods line below what is invoiced succeeds;
  - snapshot round trip carries the history rows;
  - `ErrorCodeContractTests` parity for the three new codes.

## 4. App (`apps/erp-panel/`)

- `types/index.ts`: `ItemChange { id, contractItemId, at, userId, userName, deltaMt, beforeMt, afterMt, note }`; `Item.changes: ItemChange[]`. `SCHEMA_VERSION` bumps.
- `services/contracts.ts`: `changeItemQuantity(contractId, itemId, { deltaMt, note })`;
  `services/queries.ts`: `useChangeItemQuantity()` invalidating contracts and the snapshot the way
  the goods-line mutations do.
- `services/api.ts`:
  - new selector `getContractItemOverview(contractId)` → per goods line
    `{ itemId, quantityMt, originalMt, changesMt, confirmedInvoicedMt, overMt, remainingMt }`;
    exposed through `useContractItemOverview(contractId)` in `queries.ts`.
- **Add-items form** (`AddItemsModal`) and **edit-line form** (`EditLineModal`): remove the
  `max` on the quantity boxes and the `exceedsUninvoiced` validators. Under the boxes, when the
  net (or quantity) is above the row's remaining figure, show an orange `Text type="warning"`:
  `tradeInvoices.overContractHint` — "{{mt}} MT more than the contract" — followed by a router
  `Link` to the contract page (`ROUTES.contracts + '/' + contractId`) with text
  `tradeInvoices.openContract`. The `qty-exceeds-remaining` branches in the catch blocks go
  away; `qtyExceedsContract.ts` is deleted.
- **Invoice detail** line table: a warning icon with the same hint on every line whose quantity
  is over (computed with `checkContractQty` against the contract, this document excluded), and a
  one-line `Alert type="warning"` above the table with the link when any line is over.
- **Confirm dialog** (`ConfirmInvoiceModal`): when any line is over, an extra line in the summary
  "Lines above the contract: N" with the same link; the button text is unchanged. The
  `qty-exceeds-remaining` branch goes away.
- **Contract detail** (`ContractDetailPage`):
  - goods table gains columns **Original (MT)**, **Changes (MT)** (signed, blank when 0) and
    **Over contract (MT)** (blank when 0), next to the existing Quantity and Remaining;
  - a **Change quantity** button per row (same visibility as the edit button) opening
    `ChangeQuantityModal`: `InputNumber` for `deltaMt` (precision 6, may be negative, not 0),
    a read-only "New quantity" line that follows the box, a required `TextArea` note (max
    300), Save / Cancel; the three server codes map to messages;
  - a **Quantity history** card under the goods table: table of the rows across all goods lines,
    newest first — date, goods, user, +/− MT, before → after, note; hidden when empty.
- **Contract list** (`ContractsPage`): the quantity column shows a small warning tag "over" on a
  contract with any `overMt > 0`.
- i18n keys in `en`, `ar`, `fa`, `ku`: `tradeInvoices.overContractHint`, `openContract`,
  `linesOverContract`; `contracts.changeQuantity`, `deltaMt`, `newQuantity`, `changeNote`,
  `originalMt`, `changesMt`, `overMt`, `quantityHistory`, `changeDeltaZero`,
  `changeBelowZero`, `changeNoteRequired`, `overTag`. Remove the keys that only served
  `qty-exceeds-remaining` and `quantity-below-invoiced`.
- Sample data: one contract in the sample set gets two history rows so the panel is visible
  after "Load sample data".

## 5. Out of scope

Approval of changes, changing price or premium from the dialog, reports on contract changes,
a per-user permission finer than `contracts`, and the user guide / flowcharts under `docs/`
(the owner will ask when wanted).
