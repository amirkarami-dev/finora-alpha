# Auto-generated codes and document numbers — design

Date: 2026-09-03. Status: approved by the owner in chat (2026-09-03).

## 1. Goal

The user must not type or edit a code. The **server** assigns every code and every
trade-document number, and the app only shows it.

Covers: persons (customers), partners, warehouses, cost centres, charge categories
(expense and revenue), goods, and all six trade-document types.

The database is empty (fresh start on 2026-09-02), so there is **no migration of old
data**. The three rows that exist on the new server today (one good, two charge
categories) are deleted before the release; nothing else is renamed.

## 2. Rules

| Entity | Code format | Example | Sequence scope |
|---|---|---|---|
| Customer (person) | next integer, as text | `1`, `2`, `3` | all customers |
| Partner | next integer | `1`, `2` | all partners |
| Warehouse | next integer | `1`, `2` | all warehouses |
| Cost centre | next integer | `1`, `2` | all cost centres |
| Charge category | next integer | `1`, `2` | **per direction**: EXPENSE has its own 1, 2, …; REVENUE has its own 1, 2, … |
| Good | `<metaltype>-NNN`, lowercase metal, 3 digits | `copper-001`, `copper-002`, `aluminium-001`, `other-001` | per metal type |
| Trade document | `YYMM` + 4 digits, no prefix | `26090001`, `26090002`, `26100001` | **one shared sequence** across all six types, restarting each month |

Binding details:

- **Next integer** = (largest existing code that parses as an integer) + 1, or `1` when
  there are none. Codes are stored as strings exactly as today; nothing else in the
  schema changes shape.
- **Goods**: the counter is per metal type; `NNN` is zero-padded to 3 digits and keeps
  growing past 999 (`copper-1000`). Because the code carries the metal, **`metalType` is
  immutable after creation** — the update endpoint ignores a changed metal type and the
  edit form shows it disabled, exactly like `code` today.
- **Trade documents**: the month comes from the document's **`invoiceDate`**, not from
  "today". `Convert` creates the successor dated today, so it takes today's month. The
  4-digit part is the count of existing documents (any type, any status, cancelled
  included) whose number starts with that `YYMM`, plus one; it grows to 5 digits after
  9999 rather than failing. Numbers are never editable, not even in DRAFT.
- **Editing a DRAFT's date across a month boundary re-mints the number.** The number's
  `YYMM` must always agree with `invoiceDate`, so if a header edit moves the date into a
  different Gulf-time month than the number already carries, the server assigns a fresh
  number in the destination month's sequence at save time; staying within the same month
  leaves the number untouched. This is the server keeping its own promise, not a form of
  user editing — the number field itself stays read-only throughout.
- **Contract ids** keep their current shape and keep using the person code, so they read
  `1-P-251101156`. Customer ids stay `cust-<code>` (`cust-1`). No other id changes.
- **Uniqueness under concurrency**: the existing unique constraints (code per table,
  code per direction for categories, invoice number) stay. The service computes the
  next value, saves, and on a unique-violation retries **once** with a fresh value; a
  second failure surfaces as `duplicate-code` / `duplicate-number`.

## 3. Server changes (`backend/`)

- `MasterDataService`: `CreateCustomerAsync`, `CreatePartnerAsync`,
  `CreateWarehouseAsync`, `CreateCostCentreAsync`, `CreateGoodAsync`,
  `CreateChargeCategoryAsync` stop reading `input.Code` and call a code generator
  instead. The `Code` property is **removed** from each create input record; a client
  that still sends it gets a normal JSON-ignored extra property (no error).
- `UpdateGoodAsync` no longer applies `MetalType`.
- `InvoiceService`: `CreateAsync` and `ConvertAsync` use the new `NextNumber(all,
  date)`; the `InvoiceNumber` property is removed from create and patch inputs; the
  per-type `NumberPrefix` table and the "custom number if supplied" branch are deleted.
- New pure helper `Finora.Erp.Domain.Numbering` (Domain project, no EF):
  `NextIntegerCode(IEnumerable<string> existing)`, `NextGoodCode(MetalType metal,
  IEnumerable<string> existing)`, `NextDocumentNumber(DateOnly date, IEnumerable<string>
  existing)`. Services pass in the relevant existing codes.
- Error codes: `code-required`, `code-invalid` and `duplicate-code` are no longer
  raised by the six create paths; they remain in `contracts/error-codes.json` only if
  another path still raises them (the plan checks; otherwise remove them and the
  matching front-end branches).
- Tests: unit tests for the three helper functions (empty set, gaps, non-numeric
  strays ignored, month rollover, past-9999 growth, per-metal and per-direction
  isolation); integration tests asserting each create endpoint returns the generated
  code, that two creates in a row give `1` then `2`, that a good's metal type cannot be
  changed, and that a converted document takes today's month.

## 4. App changes (`apps/erp-panel/`)

- Forms: `CustomerFormModal`, partner form, `WarehouseFormModal`, `CostCentreFormModal`,
  `GoodFormModal`, `ChargeCategoryFormModal` drop the code input on create and show the
  code as a disabled field on edit. `GoodFormModal` also disables metal type on edit.
  The trade-document create form removes the number field and its preview; it shows a
  short note "Number is assigned on save".
- `services/api.ts`: the `*Input` types lose `code` / `invoiceNumber`; the offline
  (`*Local`) create paths and `nextInvoiceNumber` use the **same rules** as the server
  (ported from `Numbering`) so a browser that lost the API never invents a different
  code; `previewInvoiceNumber` is removed with its hook.
- `mock/data.ts`: bump `SCHEMA_VERSION` (input shape changed).
- i18n: remove `codeTaken`, `codeInvalid`, `codePlaceholder` and the invoice
  `numberPlaceholder` keys from `en`, `ar`, `fa`; add the "assigned on save" note in all
  three.
- Sample data (`sampleData.ts`) is regenerated with codes in the new format so
  "Load sample data" matches production behaviour.

## 5. Out of scope

- Financial accounts (bank / cash safe) have no code today and get none.
- Renaming anything historical.
- A counters table or database sequences — the max+1 scan matches the existing
  `NextNumber` pattern and the desk's few users; revisit only if a duplicate ever
  surfaces in logs.
