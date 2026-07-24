# Warehouse Receipt/Issue + ReferenceDocumentItemId + Load Date — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Each task gates on `npm run typecheck && npm run lint && npm run build` and commits its own files
> (`git add <specific files>` — NEVER `git add -A`; never stage `.claude-flow/`, `.claude/*.json`,
> `graphify-out/`, `docs/brainstorm.excalidraw`). Trailer:
> `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
> Branch: `feature/warehouse-docs-refdocitem`. Repo root: `C:\Projects\Emad\finora-alpha`.

**Goal:** Manual Warehouse Receipt/Issue documents sourced from invoices, deduped by a
conversion-stable `referenceDocumentItemId` with a consumed-quantity ledger; container pickers
filtered by good; `shipmentDate` → `loadDate`; goods-Select style fix. Per the BINDING spec
`docs/superpowers/specs/2026-07-24-warehouse-docs-refdocitem-design.md` — read it first; every §n
below is binding.

**Critical constraints (do not violate):**
- Seed determinism: `cust-am` creditLimit === **2,750,000**. All new seed code at/after
  `src/mock/data.ts` L485; **zero** `rnd()`/`pick()`/`between()`/`intBetween()` calls.
- `tsconfig.app.json` has `noUnusedLocals` — orphaned symbols are **build errors**, not warnings.
- i18n en/ar/fa must stay key-identical with real translations.

---

## Phase A — Types, UUIDs, seed ref ids, loadDate rename, schema v4

**Files:** `src/types/index.ts`, `src/mock/data.ts`, `src/services/api.ts`,
`src/pages/containers/{ContainersPage,ContainerFormModal}.tsx`, `src/i18n/locales/{en,ar,fa}.json`.

- [ ] **A1 — types (§2):** `Container.shipmentDate` → `loadDate` (L110); `InvoiceItem` gains
  required `referenceDocumentItemId: string`; `InventoryDocumentItem` gains required
  `referenceDocumentItemId: string` (keep `invoiceItemId?`).
- [ ] **A2 — `newGuid()` in api.ts (§3):** add near the id helpers (~L1061), verbatim from §3
  (guarded `crypto.randomUUID` + `getRandomValues` fallback). Use it **only** in `addInvoiceItems`'
  `newItem` literal (L1443-1456).
- [ ] **A3 — ref-id reuse on re-add (§3, closes the convert bypass):** in `addInvoiceItems`, when
  the target invoice has a `refInvoiceId`, walk the chain (`invoiceChain`) for a line with the same
  `contractItemId` and reuse its `referenceDocumentItemId`; mint `newGuid()` only if none found.
- [ ] **A4 — `convertInvoice` comment (§3):** add a load-bearing comment at the item-copy spread
  (L1717-1724): the `...it` spread is what preserves `referenceDocumentItemId` across
  provisional→final; replacing it with an explicit field list silently breaks requirement 5.
- [ ] **A5 — seed ref ids (§3):** add `fnv1a`/`hex8`/`seedUuid` **verbatim from §3 (PREFIXED
  salt)** in the zero-PRNG region (after L485). Give `makeInvoiceItem` a `refKey: string` param.
  Keys: PO/PP/PI all use `` `inv-po-0001|${contractItem.id}` ``; SO uses
  `` `inv-so-0001|${firstItem.id}` ``; `makeHistoricalInvoiceItem` uses `raw.id`. Seeded GRN items
  (L640-646) **copy `piItems[idx].referenceDocumentItemId`** — never mint.
- [ ] **A6 — loadDate rename (§5.1):** every site listed in §5.1 — types L110; data.ts L40, L274,
  L296, L378, L395, L711, **L778 (`lmeDate: raw.shipmentDate`)**, **L797-802 (MAX reduce)**;
  api.ts L269, L650, L678, L718; ContainersPage L59-64; ContainerFormModal **all five sites**
  (L22, L86, L95, L138, L206). Pure identifier rename — no value/order change.
- [ ] **A7 — schema v4 (§2):** `SCHEMA_VERSION` 3 → 4; extend `isCompatible` with the three
  **defensive `find`-based** probes from §2 (never index `[0].items[0]`). Update the comment block.
- [ ] **A8 — i18n:** `containers.shipmentDate` → `containers.loadDate` ("Load date" / `تاريخ التحميل`
  / `تاریخ بارگیری`) in all three; reword `containers.subtitle`. Do NOT touch `contracts.progress`.
- [ ] **A9 — determinism probe:** bundle/execute the seed (esbuild or vite-node) and assert
  `cust-am` creditLimit === 2750000 **and** the ref-id set is 174 distinct over 176 lines, 0
  malformed, 0 with version nibble '4'. Delete the probe before committing; report the numbers.
- [ ] **A10 — gate + commit:**
  `git add src/types/index.ts src/mock/data.ts src/services/api.ts src/pages/containers/ContainersPage.tsx src/pages/containers/ContainerFormModal.tsx src/i18n/locales/en.json src/i18n/locales/ar.json src/i18n/locales/fa.json`
  → `feat(warehouse): reference document item ids, load date rename, schema v4`

## Phase B — Warehouse documents + confirm/cancel decoupling (ONE commit)

> Both halves must land together: §4's deletions orphan `stockOf`, `nextInventoryDocId`,
> `nextInventoryDocNumber` and the `InventoryDocument`/`InventoryDocType` imports, which are
> **TS6133 build errors** under `noUnusedLocals` until §6.1 re-uses them.

**Files:** `src/services/{api,queries}.ts`, `src/pages/tradeInvoices/{ConfirmInvoiceModal,InvoiceDetailPage}.tsx`,
`src/pages/warehouse/WarehousePage.tsx`, new `src/pages/warehouse/InventoryDocFormModal.tsx`,
`src/i18n/locales/{en,ar,fa}.json`.

- [ ] **B1 — api deletions (§4):** `confirmInvoice` loses the warehouse block (L1613-1650),
  `ConfirmInvoiceOptions` (L1559-1561), the `options` param, and dead `isFinalType` (L1555-1557).
  `cancelInvoice` loses the doc lookup (L1672), `cancel-blocked-stock` (L1673-1684) and the cascade
  (L1687). Update both JSDocs.
- [ ] **B2 — api additions (§6.1):** `InventoryDocItemInput` / `InventoryDocInput`;
  `usedQtyByReferenceDocumentItemId()`; `getInvoiceLinesForInventory(invoiceId)` returning
  `{invoiceItemId, referenceDocumentItemId, product, quantityMt, usedMt, remainingMt, containerId?,
  usedInDocNumbers[]}`; `getInventorySourceInvoices(type)` (chain-leaf CONFIRMED, side-matched);
  `getInvoiceOptions()` (ALL invoices, for the label map); `createInventoryDocument` with the
  **seven ordered guards** of §6.1 (product + max qty derived server-side; running stock deduction
  for OUT); `cancelInventoryDocument` (running accumulation for the IN reversal);
  `nextInventoryDocItemId()` (max-scanning, NOT length-derived); `nextInventoryDocNumber` year from
  `input.date`.
- [ ] **B3 — UI cleanup (§4):** `ConfirmInvoiceModal` — strip warehouse state/UI/imports **incl. the
  now-unused `useMemo`/`useState` import line**; keep `formatMt` + `isFinal`.
  `InvoiceDetailPage` — drop the `cancel-blocked-stock` branch, the Available-stock column, and its
  orphans: `useStockLevels`, `stockByProduct`, `isSaleFinal`, the `theme` import **and** the
  `const { token } = theme.useToken()` destructure.
- [ ] **B4 — queries (§4, §6.2):** `useConfirmInvoice` takes `id: string`; `useInvalidateInvoices`
  drops `qk.inventory`/`qk.stock` and **adds `qk.invoiceOptions`**; add `qk.inventoryDocLines(id)`,
  `qk.invoiceOptions`, `qk.inventorySourceInvoices(type)` + their hooks and the two mutation hooks;
  `useInvalidateWarehouses` also invalidates the bare `['inventoryDocLines']` and
  `['inventorySourceInvoices']` prefixes.
- [ ] **B5 — WarehousePage (§6.3):** third `TAB_KEYS` entry `documents`; move the documents table
  there; New receipt / New issue buttons in `PageHeader.extra`; Cancel Popconfirm actions column;
  label map from `useInvoiceOptions`. `?tab=inventory` must still resolve.
- [ ] **B6 — `InventoryDocFormModal.tsx` (new, §6.3):** AddItemsModal pattern (single `Form` +
  `Form.List` keyed by stable id). Warehouse Select (active only, zero-active empty state), invoice
  Select from `useInventorySourceInvoices`, date, notes; lines with checkbox + qty **capped at
  `remainingMt`**; exhausted rows disabled naming the consuming docs; Issue-only available hint from
  `useStockLevels` (`product.trim().toLowerCase()`); every api code mapped to a toast.
- [ ] **B7 — i18n (§7):** add the new `warehouse.*` keys; **move** `selectWarehouse`,
  `noActiveWarehouse`, `insufficientStock`, `cancelBlockedStock` from `tradeInvoices.*`;
  **keep `warehouse.availableMt`** (retargeted). Three locales identical.
- [ ] **B8 — gate + commit** → `feat(warehouse): manual receipt/issue documents with consumed-qty ledger`

## Phase C — Container pickers + goods Select fix

**Files:** `src/services/api.ts`, `src/pages/tradeInvoices/{AddItemsModal,EditLineModal,ConvertContainerModal}.tsx`,
`src/pages/containers/ContainerFormModal.tsx`, `src/i18n/locales/{en,ar,fa}.json`.

- [ ] **C1 — `ContainerOptionRow` (§5.2):** widen to
  `{ id, reference, blNumber?, loadDate, contractItemIds: string[] }`, sorted by `loadDate` desc.
- [ ] **C2 — `applyContainerToAll` carriage fix (§5.2):** assign only to lines the container
  actually carries; return `{ applied, total }` so the convert modal can report coverage.
- [ ] **C3 — shared filtered picker (§5.2):** one helper producing per-`contractItemId` options
  labelled `` `${reference} · ${formatDate(loadDate)}` `` (**plain strings**). Wire into
  AddItemsModal (per-row via `rows[field.name].contractItemId`) and EditLineModal (via
  `item.contractItemId`), each with a **Show all containers** toggle (default = filtered) and an
  `Empty` `notFoundContent`. EditLineModal **unions the currently-selected container**, flagged.
  ConvertContainerModal stays unfiltered; relabel with load date + report coverage from C2.
- [ ] **C4 — goods Select fix (§5.3):** add `optionLabelProp="label"` at ContainerFormModal L261.
  Do NOT convert to the `options` prop.
- [ ] **C5 — i18n:** `tradeInvoices.noContainerForGood`, `containerNotCarryingGood`,
  `showAllContainers`, `containerAppliedToSome` ({{applied}},{{total}}). Three locales.
- [ ] **C6 — gate + commit** → `feat(invoicing): good-filtered container pickers + goods select fix`

## Phase D — Adversarial review + live verification

- [ ] **D1 — full-diff adversarial review** (parallel lenses: determinism/seed, warehouse logic +
  ledger, UI/i18n/regressions). Fix findings.
- [ ] **D2 — live verify (preview MCP).** The seeded PO/PP/PI chain **cannot** be used (it already
  has a successor and its line is consumed). **Build a chain live:**
  1. Create a `PURCHASE_PROVISIONAL` on a contract with uninvoiced qty; add items; assign containers
     (exercise the filter + the Show-all toggle); confirm.
  2. Warehouse → Documents → **New receipt** → pick that invoice → **receive PART of a line** →
     verify the remainder is still offered with the right `remainingMt`.
  3. Receive the rest → verify the line goes **exhausted/disabled** naming the document.
  4. **Convert the provisional to final** → open a new receipt on it → **assert every line is
     refused** (this is requirement 6).
  5. Cancel the receipt → verify the lines become available again.
  6. **Issue** against a sale invoice: over-issue → `insufficient-stock`; two lines of the same
     product jointly over stock → still caught (running deduction).
  7. Goods Select shows only the product name once selected (bug 3).
  8. Load date column/label reads "Load date"; container picker labels show it.
  9. Determinism: `finora-db-v4`, `cust-am` creditLimit 2,750,000.
  10. Role menus unchanged (CEO/Customer); console clean.
- [ ] **D3 — commit fixes; report to user** (commit/push/deploy only on request).

## Self-review

- Spec coverage: §2→A1/A7, §3→A2-A5/A9, §4→B1/B3/B4, §5.1→A6/A8, §5.2→C1-C3/C5, §5.3→C4,
  §6→B2/B5/B6, §7→B7/C5, §9→phase split. No gaps.
- Name consistency: `newGuid`, `seedUuid`, `usedQtyByReferenceDocumentItemId`,
  `getInvoiceLinesForInventory`, `getInventorySourceInvoices`, `getInvoiceOptions`,
  `createInventoryDocument`, `cancelInventoryDocument`, `nextInventoryDocItemId`,
  `InventoryDocFormModal` — used verbatim across phases.
- The one hard sequencing constraint (B must be one commit) is called out at the phase head.
