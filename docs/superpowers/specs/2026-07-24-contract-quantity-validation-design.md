# Contract Quantity Validation — Design

Date: 2026-07-24 · Branch: `feature/contract-qty-validation` · Status: design, pre-implementation

## 1. Requirement

For invoices and provisional invoices linked to a contract, validate invoiced quantity against the
contract **before saving an invoice item**:
- compute the quantity already invoiced for that contract item,
- reject when the new quantity would push the total past the contracted quantity,
- on rejection show **contract quantity · already invoiced · remaining · requested**.

**User-approved decisions (2026-07-24):**
- **"Already invoiced" counts CONFIRMED documents only** (chain-leaf, non-cancelled). Drafts do not
  reserve contract quantity — a draft is checked when saved and re-checked at confirm.
- **The four-number breakdown shows on a blocked save**, and each row keeps a **live remaining hint**
  while typing.

## 2. What already exists (and what is broken)

Three guards exist today. **Two of them are wrong** — proven by executing the real API against the
real seed (workflow `wf_bf6906f5-df7`), not by reading:

| Guard | Site | Verdict |
|---|---|---|
| `addInvoiceItems` | api.ts ~L1507 | **CORRECT** — `input.quantityMt > uninvoicedMt − alreadyOnDoc`; `alreadyOnDoc` accumulates inside the loop, so multi-entry calls are safe. |
| `updateInvoiceItem` | api.ts ~L1565-1576 | **BROKEN (Hole A)** |
| `confirmInvoice` | api.ts ~L1666-1678 | **BROKEN (Hole B)** |

**Key fact both bugs stem from:** `chainLeafDocs(side, opts)` (api.ts:1194-1206) defaults to
CONFIRMED-only, so `itemUninvoicedMt` returns *contract quantity − confirmed claims*. **A DRAFT is
never counted**, with or without `excludeInvoiceId`. Runtime proof: with a 101.2 MT draft line on a
253 MT item, `getContractRemaining` still returned `uninvoicedMt = 253`.

### Hole A — `updateInvoiceItem` ceiling is inflated by the line's own quantity
`max = uninvoicedExcludingSelf + item.quantityMt` adds the line's quantity back although it was
never subtracted. **Proven:** contract item 253 MT, draft line 101.2 MT → ceiling computed as
354.2 MT (1.4×); `updateInvoiceItem(…, 328.9)` **succeeded** — 130% of the contract item.
(`EditLineModal.tsx:56-58` mirrors the same formula client-side.)

### Hole B — `confirmInvoice` never sums lines sharing a contract item
The loop tests each line independently against the same `uninvoicedExcludingSelf`. **Proven:** three
lines of 227.7 MT each (each individually ≤ 253) on a 253 MT item **confirmed clean at 683.1 MT —
270% of contract**, USD 1,404,285.90. A single inflated line *is* caught, which is why this survived:
the defect only shows with multiple lines for one contract item.

The two compose: A creates the state, B fails to catch it at the last line of defence.
`recomputeAllRemaining` clamps with `Math.max(…, 0)`, so the overshoot is invisible downstream.

### Incidental defect (in scope — same function)
`addInvoiceItems` is **not atomic**: `invoice.items.push` happens inside the loop *before* later
entries validate, so a multi-entry call that throws on entry N leaves entries 1..N−1 on the draft.
**Observed.** Fix by validating all entries first, then pushing.

## 3. Design

### 3.1 One shared quantity helper (single source of truth)
Add to `api.ts`, replacing the ad-hoc math at all three sites:

```ts
export interface ContractQtyCheck {
  contractQuantityMt: number;   // the contract item's quantity
  alreadyInvoicedMt: number;    // chain-leaf CONFIRMED claims, excluding this invoice
  onThisDocMt: number;          // this document's other lines for the same contract item
  remainingMt: number;          // max(contract − alreadyInvoiced − onThisDoc, 0)
  requestedMt: number;
  exceeds: boolean;
}
function checkContractQty(args: {
  contract, contractItemId, side, invoiceId, requestedMt,
  excludeInvoiceItemId?: string,   // the line being edited, so it doesn't count against itself
  extraOnDocMt?: number,           // entries staged earlier in the same addInvoiceItems call
}): ContractQtyCheck
```
`alreadyInvoicedMt` uses the existing `chainLeafDocs(side, { excludeInvoiceId })` (CONFIRMED-only —
decision §1). `onThisDocMt` sums the document's own lines for that contract item, skipping
`excludeInvoiceItemId`. Rounding follows `round3` (quantities carry 3 decimals), epsilon `1e-9`.

### 3.2 Error payload
All three guards throw `'qty-exceeds-remaining'` with the full breakdown attached:
```ts
const err = new Error('qty-exceeds-remaining') as Error & ContractQtyCheck & { product?: string };
Object.assign(err, check, { product });
```
`available` is retained as an alias of `remainingMt` so existing handlers keep working.

### 3.3 The three call sites
- **`addInvoiceItems`** — keep the (correct) semantics, but route through `checkContractQty` with
  `extraOnDocMt` accumulating across entries, **validate every entry before pushing any** (atomicity
  fix), and attach the breakdown.
- **`updateInvoiceItem`** — replace `uninvoicedExcludingSelf + item.quantityMt` with
  `checkContractQty({ …, excludeInvoiceItemId: item.id })`. This is Hole A's fix.
- **`confirmInvoice`** — **group `invoice.items` by `contractItemId`, sum each group once**, and
  compare the group sum against the remaining. This is Hole B's fix. Report the offending product.

### 3.4 UI
- **i18n** — one interpolated key `tradeInvoices.qtyExceedsContract` with all four numbers, e.g.
  `"{{product}}: contract {{contract}}, already invoiced {{invoiced}}, remaining {{remaining}} — requested {{requested}}"`
  (en/ar/fa, real translations, MT via `formatMt`).
- **AddItemsModal / EditLineModal / ConfirmInvoiceModal** — map `'qty-exceeds-remaining'` to that
  message built from the error payload (fall back to the existing terse string when the payload is
  absent).
- **EditLineModal** — fix the mirrored client formula (`maxQty`) to
  `remaining − otherLines` (no `+ item.quantityMt`), matching the corrected API.
- **Live hint** stays as-is (`uninvoicedHint` / row `max`), now consistent with the API ceiling.

## 4. Out of scope
Whether drafts should reserve quantity (decided: no); the `Math.max(…, 0)` clamp in
`recomputeAllRemaining` (leaving it — it protects downstream display math); the pre-existing seed
`Seal no.` `undefined2160310` bug.

## 5. Verification (must be by execution, not inspection)
1. **Hole A closed:** 253 MT item, draft line 101.2 → `updateInvoiceItem(…, 328.9)` must throw with
   contract 253 / invoiced 0 / remaining 253 / requested 328.9.
2. **Hole B closed:** three lines of 227.7 on the same contract item → `confirmInvoice` must throw
   naming the product and the group sum (683.1 vs 253).
3. **Legal cases still pass:** 151.8 + 101.2 = 253 exactly → adds, edits and confirms cleanly.
4. **Atomicity:** a two-entry `addInvoiceItems` where the second is illegal must leave the draft
   with **zero** new lines.
5. `cust-am` creditLimit still 2,750,000; gate green; the earlier warehouse-ledger flows unaffected.
