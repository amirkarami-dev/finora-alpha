# Person ledger, payment methods, cheque lifecycle, claim sides, gain/loss, reports

Date: 2026-08-04 · Status: approved

## 0. Why

Seven changes requested together. They share one spine: **money must be attributable to a
person and to an account, on both the sale and the purchase side.** Today the app only models
the sale side, floors the result at zero, and ignores claims entirely.

---

## 1. Binding decisions

| # | Question | Decision |
|---|---|---|
| 1 | Scope of the new formula | **Person surfaces only.** New field `netBalance`; `totalOutstanding` keeps its present sale-only meaning for Dashboard, Executive, aging, DSO, credit limits and the portal. |
| 2 | Buyer *and* supplier person | **One net figure**, split by side in the drill-down. |
| 3 | Transfers | **Kept.** Shown in report (a) as account movement, and in the person drill-down as **informational** rows that do not change the balance. |
| 4 | Legacy gain/loss records | **Wiped.** |
| 5 | Cheques tab | **Create removed**; list, filters, edit and status changes stay. |
| 6 | GENERAL payment side | **Explicit `direction` on the header**, required for GENERAL; legacy rows read as `IN`. |
| 7 | Invoice universe | **Deepest CONFIRMED chain member**, not `chainLeafDocs`. |
| 8 | Legacy claim side | **Derived from the claim's own invoice**, never from the old label. |
| 9 | Currency | Every term of the balance is **USD**. |
| 10 | Schema | **No `SCHEMA_VERSION` bump.** Two `loadDb` backfills + one membership probe. |

### Why 1 (scope)
Ageing a purchase invoice is meaningless, and `availableCredit`, `dsoDays`,
`creditUtilizationPct`, `onTimeSharePct` and `DashboardPage.tsx:186` all divide by or clamp
against `totalOutstanding`. Removing its `Math.max(…, 0)` floor (`api.ts:155`) would turn four
pages and the portal into ±∞/NaN. A **new parallel field** gets the requested number with zero
blast radius.

### Why 7 (invoice universe)
`findSuccessor` (`api.ts:1247-1249`) treats a **DRAFT** successor as a successor. So converting
a confirmed, partly-paid invoice drops its `totalAmount` out of `invoiced` while its payments
remain. Today `Math.max(…, 0)` hides it; `netBalance` has no floor, so it would surface as a
person's balance going negative for no reason. The codebase already fixed exactly this on the
quantity side — `confirmedClaimsByItem` (`api.ts:1316-1358`) walks each chain once and counts
its deepest CONFIRMED member. The money side adopts the same rule.

### Why 8 (claim migration)
`api.ts:3309` maps `EXPENSE→PURCHASE`. The request maps the *expense* tab onto **SALE**. A
literal `EXPENSE→SALE` rename re-sides every stored claim onto the wrong invoice type — and
under §2 that **inverts its sign**. `isCompatible` cannot catch it (`claims` has only an
`Array.isArray` probe) so it is a silent wrong number. The backfill therefore reads each
claim's own invoice and ignores the stored label entirely.

---

## 2. Person balance

```
netBalance(P) =                                    // USD, signed, NOT floored
  + Σ usd(inv.totalAmount)   over SALE     docs of P      // they owe us more
  − Σ paymentContribution    on the SALE side of P        // they paid us
  − Σ claim.amountUSD        over SALE     claims of P    // credit we granted
  − Σ usd(inv.totalAmount)   over PURCHASE docs of P      // we owe them
  + Σ claim.amountUSD        over PURCHASE claims of P    // credit they granted us
  + Σ paymentContribution    on the PURCHASE side of P    // we paid them
```

`usd(x)` = `round(x / inv.exchangeRate)` — `Invoice.totalAmount` is in the **invoice's**
currency (`types/index.ts:402`), while every payment figure is USD. Existing code compares the
two directly (`api.ts:239`); that inconsistency is **not** inherited here.

**Document universe.** Per §1.7: group invoices by chain, take the deepest CONFIRMED member,
require `isPricedType`. Sale and purchase both.

**Sign convention.** Positive = the person owes us. Negative = we owe them, rendered in
brackets, e.g. `(390)`.

**Payment contribution.** Per **settled** payment (`isSettled`), per line:

| Line | Side | Counted |
|---|---|---|
| has `invoiceId` | that invoice's side | always |
| no `invoiceId` (GENERAL) | header `direction` (`IN`→sale side, `OUT`→purchase side) | always |
| method `Cheque` | as above | **only when `cheque.status === 'PAID'`** |
| payment with **no** `items` (legacy) | `invoiceId ? invoiceSide : direction ?? 'IN'` | header `amountUSD`; no cheque gate — there is no cheque record to check |

Claims count only when `status === 'ACTIVE'`.

**One predicate, one place.** `personLedgerEntries(personId)` returns the ordered, signed
entry list; `netBalance` is its running total. The list and the number can never disagree
because the number *is* the list's last running value.

### Ledger entry

```ts
export type LedgerKind =
  | 'SALE_INVOICE' | 'SALE_CLAIM' | 'SALE_PAYMENT'
  | 'PURCHASE_INVOICE' | 'PURCHASE_CLAIM' | 'PURCHASE_PAYMENT'
  | 'TRANSFER';                       // informational only, effect === 0

export interface PersonLedgerEntry {
  id: string;
  date: string;
  kind: LedgerKind;
  side: 'SALE' | 'PURCHASE' | 'NONE';
  reference: string;                  // invoice number / claim title / payment id / transfer number
  refId?: string;                     // for row navigation
  currency: Currency;
  amount: number;                     // as entered, in `currency`
  effect: number;                     // signed USD applied to the running balance
  running: number;                    // balance after this entry
  informational?: boolean;            // TRANSFER rows; excluded from every subtotal
  pending?: string;                   // e.g. 'cheque-not-paid' — shown greyed, effect 0
}
```

**Ordering** — `date` asc, then `kind` in the order listed above, then `id` asc. Fully
deterministic; the running column is reproducible.

A Cheque line whose cheque is not yet PAID appears with `effect: 0` and `pending`. Showing it
greyed is the point: the money exists but is not yet in the balance, and hiding it entirely
would look like data loss.

---

## 3. Payment item methods

`PaymentItem.invoiceId` becomes **optional** (widening — every stored line still satisfies it).

| Method | Reveals | Server guard |
|---|---|---|
| TT | active accounts of type `BANK` | `bank-account-required` / `-not-found` / `-inactive` / **`account-type-mismatch`** |
| Cash | active accounts of type `CASH_SAFE` | same four codes, type `CASH_SAFE` |
| Cheque | **inline create form** (no picker) | cheque fields validated by `createCheque`'s own guards |
| Offset, Credit note | nothing | — |

Both TT and Cash write `bankAccountId` — one field, the account's own `type` says which it is.
A new `account-type-mismatch` guard is required because `buildPaymentItem:4657` is currently
type-agnostic: without it, a Cash line could name a bank.

**Cheque inline creation.** The item modal creates the cheque and attaches it in one submit.
If the item then fails validation the cheque must not be left orphaned — so the item is
validated **first**, the cheque created **second**, in that order.

**GENERAL payments.** Identical modal minus the invoice picker and allocations
(`allocations: []`). Header gains a required `direction` (money in / money out).

**Cheques tab.** Create button and `ChequeFormModal` mount removed. Edit, status actions,
and new filters stay.

---

## 4. Cheque lifecycle

```
PENDING → PAID | RETURNED | EXPIRED | CHANGED
PAID    → PENDING            (the un-pay step that unlocks editing)
RETURNED| EXPIRED | CHANGED → PENDING
```

Every status user-settable. `CHEQUE_TRANSITIONS` (`api.ts:4293-4299`, where `PAID: []` and
`CHANGED: []` are terminal today) opens up accordingly, and its doc-comment — which already
contradicts its own table — is corrected.

- **Data editable only in `PENDING`.** `updateCheque` currently blocks only PAID
  (`api.ts:4358`); it becomes PENDING-only, new code `cheque-not-pending`.
- **Leaving PAID clears `bankAccountId`.** Otherwise `ChequeRow.bankAccountName`
  (`api.ts:4415-4423`) shows a bank for a cheque that is no longer paid.
- **A cheque affects money only in `PAID`** — the balance gate (`accountFeeds:3790-3793`) and
  now the person ledger too.

**Filters** (client-side, `ChequesTab`): free text over number / owner / bank, status, type,
due-date range, amount range, currency, and a "needs action" toggle reusing `dueForAction`.

---

## 5. Claim sides

`ClaimSide` becomes `'SALE' | 'PURCHASE'`, mapping to the **same** invoice side —
`claimInvoiceSide` (`api.ts:3308-3310`) is deleted and the identity inlined.

- Sale claim tab → SALE invoices.
- Purchase claim tab → PURCHASE invoices.
- Tab order: sale first.

**Migration** (`loadDb`, before any consumer runs):

```ts
c.side = String(invoiceOf(c).invoiceType).startsWith('PURCHASE') ? 'PURCHASE' : 'SALE'
```

Applied whenever `side` is not already one of the new values. `isCompatible` gains a
membership probe on `claims[0].side` — safe on index 0 because every claim has a side (the
`.find()` discipline at `data.ts:145-175` exists for *child* arrays that may legitimately be
empty).

Sample data's two claim seeds move to the correct document sides.

---

## 6. Exchange gain/loss

Collapses to a manual record. No account, no rate, no balance, no allocations, no preview.

```ts
export interface ExchangeGainLoss {
  id: string;                 // 'egl-0001'
  number: string;             // 'EGL-0001'
  date: string;
  type: ExchangeGainLossType; // derived: amount >= 0 ? 'GAIN' : 'LOSS'
  amount: number;             // USD, signed
  notes?: string;
  createdAt: string;
}
```

Deleted: `previewRevaluation`, `createRevaluation`'s allocation derivation,
`getGainLossReport` + hook + query key, `accountFeeds`' gain absorption
(`api.ts:3849-3852`), `transfer-revalued` (`3978-3985`), `revaluation-superseded`
(`4175-4184`), `RevaluationFormModal`'s preview block, and ~30 dead `exchange.*` i18n leaves
in all three locales.

**Consequences accepted:**
- `bookRate` becomes the pure feed-implied rate. It still exists — `buildTransfer`
  (`api.ts:3906/3910/3925`) reads it for a transfer's USD value.
- CONFIRMED transfers become freely cancellable (nothing measures against them any more).
- Persisted records are **wiped** (§1.4), so no shape backfill is needed — `loadDb` clears
  `exchangeRevaluations` once and the new array starts empty.

`MoneyTransfer` is untouched.

---

## 7. Reports

`ReportsPage` gains `useTabParam` + `Card tabList` (the `ExchangeGainLossPage` pattern).
**Tabs, not routes** — `ROLE_ACCESS.CEO` is `['executive','reports','settings']`
(`roles.ts:9`), so a new route would silently redirect for CEO.

Every report takes a **date range** (default: last 12 months) and shows
**opening → movements → closing**.

| # | Report | Rows | Columns |
|---|---|---|---|
| a | Banks & cash safes | one block per account | date, kind (transfer in/out, payment in/out), reference, amount (account currency), USD, running |
| b | Persons | one block per person | the §2 ledger, reusing `personLedgerEntries` verbatim |
| c | Expenses | one row per charge line | date, category, cost centre, person, invoice, description, amount, USD; grouped totals by category and by cost centre |
| d | Purchases & sales | one row per invoice **item** | date, doc type, number, person, product, MT, unit price, amount, USD; expandable to the invoice header |

Report (b) **is** the drill-down selector — one implementation, two surfaces. Report (a) is
the only place transfers appear as first-class movements.

Existing chart cards stay on an "Overview" tab so nothing is lost.

---

## 8. Data migration summary

No `SCHEMA_VERSION` bump. `purgeStaleSchemaKeys` (`data.ts:194-205`) deletes the old blob on
the next load, so a bump is a **one-way door** that would destroy customers, contracts and
invoices to fix one field on one entity — exactly what the Goods precedent (`data.ts:62-66`)
rules out.

1. `claims[*].side` — membership probe + invoice-derived backfill (§5).
2. `exchangeRevaluations` — cleared once (§6).
3. `PaymentItem.invoiceId` optional, `Payment.direction` explicit — pure widenings, no
   backfill needed; `direction` already defaults to `IN` at every read site.

---

## 9. Phases

Each ends clean on `npm run typecheck && npm run lint && npm run build`.

1. **Claims** — side rename + flip + migration. First, because it is the only one-way data
   decision and §2 depends on knowing a claim's side.
2. **Cheque lifecycle** — transitions, PENDING-only edit, clear bank on leaving PAID, filters,
   create removed. No money math.
3. **Payment methods** — Cash → cash safe, Cheque → inline create, `account-type-mismatch`.
4. **General payments** — optional `invoiceId`, explicit `direction`, fix `accountFeeds`'
   no-invoice `+1` sign bug (`api.ts:3799-3800`), which otherwise makes every cash-out
   GENERAL line *increase* the bank balance.
5. **Person ledger** — `personLedgerEntries` + `netBalance` + drill-down modal + negative-safe
   rendering (the four raw `<Statistic prefix="$" precision={0}>` bypasses at
   `CustomerDetailPage.tsx:232-238` and `:247` become `<Money/>`; `Money`'s `colored` must not
   paint "we owe them" green).
6. **Gain/loss** — the shrink.
7. **Reports** — four tabs.

---

## 10. Verification

Executable probe per phase, plus a browser pass. The §2 worked example is the acceptance
test and must reproduce **exactly**:

| Entry | Effect | Running |
|---|---|---|
| sale 1000 | +1000 | 1000 |
| sale claim 50 | −50 | 950 |
| payment on sale 500 | −500 | 450 |
| purchase 500 | −500 | (50) |
| purchase claim 60 | +60 | 10 |
| purchase 600 | −600 | (590) |
| payment on purchase 200 | +200 | (390) |

Plus: a Cheque payment moves the balance only once PAID; un-paying it moves the balance back;
a legacy claim lands under the tab matching its own invoice; a Cash line cannot name a bank
account; a GENERAL OUT line lowers the cash safe.
