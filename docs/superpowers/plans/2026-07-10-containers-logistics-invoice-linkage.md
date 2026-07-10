# Containers → Logistics + Invoice Linkage + Shipped-from-Invoices — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Task-by-task; each gates on `npm run typecheck && npm run lint && npm run build` and commits
> its own files (`git add <specific files>` — NEVER `git add -A`; never stage
> `.claude/launch.json` or `docs/brainstorm.excalidraw`). Trailer:
> `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Branch:
> `feature/containers-logistics-invoice-linkage`.

**Goal:** Make Container a pure logistics entity (multi-goods, weights, no money), wire invoice
lines to containers (replacing free-text BL/Container No), source contract "shipped" from
invoices, and re-base ALL financials onto the trade invoices. Per the BINDING spec
`docs/superpowers/specs/2026-07-10-containers-logistics-invoice-linkage-design.md` — read it
first; every §n reference is binding.

**Architecture:** mock-data app; state in `src/mock/data.ts` (seeded PRNG + localStorage),
selectors/mutations in `src/services/api.ts`, hooks in `src/services/queries.ts`, pages under
`src/pages/`. TS strict, AntD 5, i18n en/ar/fa.

---

## Phase A — Data, seed, calc (compiles with temporary UI shims)

### Task A1 — Types reshape (`src/types/index.ts`)
- [ ] Add `ContainerGood { contractItemId: string; quantityMt: number }`.
- [ ] Reshape `Container` to the logistics shape (spec §2): `id, reference, goods:
  ContainerGood[], shipmentDate, arrivalDate?, grossWeightKg?, netWeightKg?, blNumber?,
  bookingNumber?, sealNumber?`. Remove `contractId, itemId, quantityMt, lmePrice, premium,
  dueDate, invoiceUSD, status`.
- [ ] `InvoiceItem`: remove `blNumber?`, `containerNo?`; add `containerId?: string`.
- [ ] Delete `ShipmentInvoice` interface.
- [ ] `StatusTag.tsx`: drop `ContainerStatus` from the prop union; KEEP
  `CONTAINER_STATUS_COLOR` (reused for the re-based settlement badge). Keep `ContainerStatus`
  type itself exported ONLY if still referenced by the settlement badge tri-state; otherwise
  keep it (the OPEN/PAID/OVERDUE union is reused by `getReceivableInvoices.displayStatus`).
- [ ] Remove `openContainers` from `CustomerAccount` and `DashboardKpis`; remove `totalVolumeMt`
  from `DashboardKpis` (spec §6). (Consumers fixed in Phase D — expect temporary breaks there,
  not here; keep this task type-only + grep the field usages into a note for D.)

This task will NOT compile alone (seed + api still reference old shape). Do A1+A2+A3 as one
commit so the gate passes.

### Task A2 — Seed transform (`src/mock/data.ts`), SCHEMA v3
- [ ] Add a file-local `interface RawContainerSeed` = the OLD container shape (`id, contractId,
  itemId, reference, quantityMt, lmePrice, premium, shipmentDate, arrivalDate?, dueDate,
  invoiceUSD, status, blNumber?, bookingNumber?, sealNumber?`).
- [ ] Change the generation loop (data.ts:233-299) to push into `const rawContainers:
  RawContainerSeed[] = []` instead of `containers`. **Do not change order or any `rnd()`
  call** — byte-identical draws. The `Container: {...}` literal at :262-276 becomes a
  `RawContainerSeed` literal (same fields).
- [ ] The credit-limit post-pass (data.ts:~414-426) keeps reading `rawContainers`
  (`c.invoiceUSD`, `c.status`) unchanged → preserves `cust-am` = 2,750,000. Partner pass
  unchanged.
- [ ] **New final post-pass** (after partner allocation, ZERO `rnd()`):
  1. `const containers: Container[] = rawContainers.map(raw => ({ id: raw.id, reference:
     raw.reference, goods: [{ contractItemId: raw.itemId, quantityMt: raw.quantityMt }],
     shipmentDate: raw.shipmentDate, arrivalDate: raw.arrivalDate, blNumber: raw.blNumber,
     bookingNumber: raw.bookingNumber, sealNumber: raw.sealNumber, netWeightKg:
     Math.round(raw.quantityMt*1000), grossWeightKg: Math.round(raw.quantityMt*1000*1.02) }))`.
  2. **Historical invoices** from `rawContainers` grouped by `raw.contractId`. For each contract
     with raws: one CONFIRMED invoice, `SALE_INVOICE` if contract.contractType==='SELL' else
     `PURCHASE_INVOICE`. Local number helpers (reimplement the `<PFX>-<YYYY>-<NNNN>` /
     `inv-<pfx>-<NNNN>` scheme; PFX SI/PI; YYYY from TODAY). One `InvoiceItem` per raw:
     `{ id, invoiceId, contractItemId: raw.itemId, product: <item.product>, quantityMt:
     raw.quantityMt, lmePercent, lmeFixed, fixedPrice: item.fixedLmePrice, premium, lmePrice:
     raw.lmePrice (if floating) , lmeDate: raw.shipmentDate, discountPercent: 0, amount:
     invoiceItemAmount(...), containerId: raw.id }`. Header `invoiceDate` = latest raw
     shipmentDate for that contract; totals via reduce; `status: 'CONFIRMED'`, `currency:'USD'`,
     `exchangeRate:1`, `createdAt`. Push to `invoices`.
  3. Seed a deterministic IN payment on every OTHER sale invoice (index % 2 === 0), 60% of
     total, `NIZ` id continuing `paymentCounter`, `direction:'IN'`, `invoiceId`, reference =
     invoiceNumber. Purchase invoices: NO payment here (payables).
  4. Code comment: no warehouse docs seeded for historical invoices (seed shortcut).
  5. Recompute every `item.remainingMt` = `round(max(quantityMt − Σ historical-invoice-line
     qty for that item, 0), 3)` so seed matches the runtime `shippedMtForItem` formula.
- [ ] `SCHEMA_VERSION` 2 → 3. `isCompatible`: add `if (o.containers.length && !Array.isArray(
  (o.containers[0] as any)?.goods)) return false;`. `seed` object keys unchanged.

### Task A3 — calc + api shipping helpers
- [ ] `src/utils/calc.ts`: DELETE `shippedMt` (container-based) — both call sites migrate below.
  Keep `containerInvoice`? It's now unused (grep) → delete if no consumer remains.
- [ ] `src/services/api.ts`: add
  ```ts
  /** Chain-leaf docs of `side`: leaf (no non-cancelled successor), excluding CANCELLED.
   *  includeDraft counts DRAFT leaves too; excludeInvoiceId drops one invoice's own claim. */
  function chainLeafDocs(side: InvoiceSide, opts: { includeDraft?: boolean; excludeInvoiceId?: string } = {}): Invoice[] {
    return db.invoices.filter((inv) =>
      isSide(inv.invoiceType, side) &&
      inv.status !== 'CANCELLED' &&
      (opts.includeDraft ? true : inv.status === 'CONFIRMED') &&
      !findSuccessor(inv.id) &&
      inv.id !== opts.excludeInvoiceId &&
      isPricedType(inv.invoiceType)); // provisional/invoice only, never orders
  }
  ```
  Refactor `chainLeafConfirmedInvoices` callers to `chainLeafDocs(side)` (CONFIRMED default).
- [ ] `shippedMtForItem(contractItemId): number` = Σ over BOTH sides of
  `chainLeafDocs(side, { includeDraft: true })` lines matching `contractItemId` × quantityMt.
  (Shipped counts draft+confirmed, cancelled excluded, chain-once — spec §5.)
- [ ] `recomputeAllRemaining()`: for every contract item set `remainingMt = round(max(quantityMt
  − shippedMtForItem(id), 0), 3)`. Call it after every invoice mutation that changes item qty /
  status / conversion (create/add/update/remove item, confirm, cancel, convert) AND from
  `updateItem` (replacing its `shippedMt(itemId, db.containers)` call at :525). Remove the
  container-mutation remaining recompute.
- [ ] Gate + commit A1+A2+A3 together: `git add src/types/index.ts src/mock/data.ts
  src/utils/calc.ts src/services/api.ts src/components/common/StatusTag.tsx` →
  `feat(containers): logistics container model, schema-v3 seed, invoice-based shipping`
  (api.ts will still have container-financial reads that break Phase D consumers — but the app
  must COMPILE; add minimal temporary shims in api.ts container/account selectors returning
  safe values so the build is green, clearly marked `// TEMP Phase D` — Phase D replaces them.)

> Determinism check for the implementer: after A2, run a throwaway probe (tsx) asserting
> `db.customers.find(c=>c.id==='cust-am').creditLimit === 2750000` and delete it. Report the value.

## Phase B — Containers UI + api container surface

### Task B1 — container api surface (`src/services/api.ts`, `queries.ts`)
- [ ] Reshape `ContainerRow` = `Container & { goodsSummary: string; totalQtyMt: number }`
  (drop customerName/product/money). `buildContainerRows` maps goods → summary (first product
  `+N`), totalQtyMt = Σ goods qty. Product names via `itemProduct` map.
- [ ] `ContainerInput = { reference, shipmentDate, arrivalDate?, grossWeightKg?, netWeightKg?,
  blNumber?, bookingNumber?, sealNumber?, goods: {contractItemId, quantityMt}[] }`.
- [ ] `createContainer`/`updateContainer` rebuilt for the new shape; `nextContainerId()` no
  longer needs contractId (use a global `cnt-<n>` counter scan). `updateContainer` enforces the
  removal block: for each good present before but absent now, if `getGoodContainerUsage(id,
  contractItemId)` non-empty → `throw new Error('good-in-use')` (attach `.invoices`,
  `.product`). Every mutation `persistDb()`.
- [ ] `getGoodContainerUsage(containerId, contractItemId): string[]` = invoiceNumbers of
  invoices having an item with `containerId===containerId && contractItemId===contractItemId`.
- [ ] `getContainerOptions(): { id, reference, blNumber? }[]`.
- [ ] queries.ts: reshape `useContainers`; drop `useShipmentInvoices`/`qk.shipmentInvoices`
  (grep consumers — Phase D fixes dashboard/portal); add `useContainerOptions`, usage is called
  imperatively from the form (via `api.getGoodContainerUsage`) not a hook. Container mutation
  invalidations: containers + contracts + invoices (a goods change can affect derived reads).
- [ ] Gate + commit → `feat(containers): logistics container api (goods, usage, options)`

### Task B2 — ContainersPage + ContainerFormModal
- [ ] `ContainersPage.tsx`: columns reference / goods summary / total MT / gross / net /
  shipmentDate / arrivalDate; expandable row keeps BL/booking/seal. REMOVE contract, quantity,
  LME, due, invoice, status columns + the status `Segmented` + `CONTAINER_STATUSES` import +
  `StatusTag`/`Money`/`relativeDays` imports if now unused. Search by reference/product-in-goods.
- [ ] `ContainerFormModal.tsx` (move to `src/pages/containers/` — update the single import in
  ContainersPage; delete old path): fields reference/shipmentDate/arrivalDate/grossWeightKg/
  netWeightKg/blNumber/bookingNumber/sealNumber + a goods `Form.List` (stable-id keyed, one
  `Select` grouped by contract via `OptGroup` with `getContractRemaining`-sourced remaining-MT
  hint + `quantityMt` InputNumber). ≥1 good required. Remove contract/qty-remaining/LME/premium/
  status/due/preview. On remove of an existing (persisted) goods row, call
  `api.getGoodContainerUsage`; if non-empty, `App.useApp().modal.warning({ title:
  containers.goodInUseTitle, content: containers.goodInUseBody with {{product}}/{{invoices}} })`
  and DON'T remove. `useCreateContainer`/`useUpdateContainer`; map `'good-in-use'` on save too.
- [ ] i18n en/ar/fa: `containers.goods, addGood, grossWeight, netWeight, totalQty,
  goodInUseTitle, goodInUseBody, goodRemainingHint, weightKg`; remove dead
  `containers.contract/quantityMt/lmePrice/premium/dueDate/invoice/status` (KEEP `overdueBy`/
  `dueIn` — dashboard uses them). Identical key sets.
- [ ] Gate + commit → `feat(containers): logistics containers page + goods form`

## Phase C — Invoice ↔ container linkage

### Task C1 — api: container on items, confirm guard, convert-apply, cap fix
- [ ] `updateInvoiceItem` (api.ts:~1360-1380): accept `containerId?`; drop `blNumber`/
  `containerNo` handling. `addInvoiceItems` input rows accept `containerId?`.
- [ ] `getContractRemaining(contractId, side, excludeInvoiceId?)` + thread into
  `chainLeafDocs`. `useContractRemaining(contractId, side, invoiceId?)`.
- [ ] `confirmInvoice`: after the 'missing-lme-price' guard (api.ts:~1450), before final/stock:
  `if (isPricedType(type)) { const noC = invoice.items.filter(it => !it.containerId); if
  (noC.length) { const e = new Error('missing-container'); (e as any).products =
  noC.map(i=>i.product); throw e; } }`.
- [ ] `applyContainerToAll(invoiceId, containerId)`: set containerId on all items, persist.
- [ ] queries: `useApplyContainerToAll`, mutation invalidations include tradeInvoice(id).
- [ ] Gate + commit → `feat(invoicing): invoice-item container link, confirm guard, cap exclude`

### Task C2 — trade-invoice UI (detail, add-items, edit-line, convert)
- [ ] `EditLineModal.tsx`: replace BL No + Container No inputs with one container `Select`
  (`useContainerOptions`, label `"<reference> · <BL or —>"`, optional, searchable).
- [ ] `AddItemsModal.tsx`: add a per-row container `Select` (net-new; optional); pass
  `containerId` in the added rows; thread `invoiceId` into `useContractRemaining` and drop the
  client-side `alreadyOnDoc` subtraction (now handled by excludeInvoiceId).
- [ ] `InvoiceDetailPage.tsx`: items table BL No / Container No cells resolve from the line's
  container via `useContainerOptions` map (reference/blNumber; '—' when unset). Line with no
  container + priced type + DRAFT → actions "Assign container" button opening the existing
  `EditLineModal` (reuse `editLineItem`/`'editLine'`). Convert Dropdown item → open new
  `ActiveModal='convertContainer'` (+ `pendingConvertTarget` state) instead of converting
  directly; the modal (new `ConvertContainerModal.tsx`) offers optional container `Select`, on OK
  `convertInvoice` → if chosen `applyContainerToAll(created.id, cid)` → navigate. Map
  'missing-container' → toast `tradeInvoices.missingContainer` (list products).
- [ ] `InvoicePrintPage.tsx`: BL/container cells resolve from container (reference/blNumber).
- [ ] i18n: `tradeInvoices.container, assignContainer, missingContainer, convertPickContainer,
  convertContainerHint`; remove dead `blNumber`/`containerNo` line labels if unused. 3 locales.
- [ ] Gate + commit → `feat(invoicing): container pickers, assign action, convert step`

## Phase D — Financial re-base (the big one)

### Task D1 — receivables + selectors (`src/services/api.ts`)
- [ ] Derived due date helper: `invoiceDueDate(inv) = dayjs(inv.invoiceDate).add(customer terms,
  'day')`.
- [ ] `saleReceivables()` per customer (chain-leaf non-cancelled SALE totals; paid = IN
  payments; outstanding; overdue via due date). Rewrite `computeAccounts` on it; drop container
  reads + `openContainers`.
- [ ] `getReceivableInvoices(customerId?)` → `{ id, invoiceNumber, customerId, customerName,
  summary, totalAmount, invoiceDate, dueDate, paidUSD, displayStatus }` where
  `displayStatus`: paid≥total → 'PAID'; else dueDate<TODAY → 'OVERDUE'; else 'OPEN'.
- [ ] Rewrite `getProductVolumes` (over chain-leaf non-cancelled SALE invoice items),
  `getAgingBuckets` (from getReceivableInvoices due dates), `getCashflowSeries` (invoiced =
  sale invoice totals by month; collected = IN payments), `getKpis` (drop openContainers/
  totalVolumeMt or redefine totalVolumeMt = Σ shipped sale qty — prefer drop),
  `getExecutiveSummary`, `getCustomerPortalSummary` (its inline monthly series + aging).
- [ ] DELETE `buildInvoices`/`getInvoices`/`ShipmentInvoice` refs; remove the TEMP Phase A shims.
- [ ] queries: `useReceivableInvoices`; drop shipment-invoice hook; invalidations wired.
- [ ] Gate + commit → `feat(invoicing): re-base receivables/KPIs/volumes/aging onto invoices`

### Task D2 — dashboard / portal / reports / customers wiring
- [ ] `DashboardPage.tsx`: overdue/recent widget + KPI strip use `useReceivableInvoices` +
  reworked kpis (remove Open Containers tile + `dashboard.kpiContainers`); show `invoiceNumber`
  + `summary` where it showed `containerReference · product`; `StatusTag` on `displayStatus`.
- [ ] `CustomerPortalPage.tsx`: open-invoices table dataIndex `invoiceNumber`
  (title `tradeInvoices.number`), `displayStatus` badge; aging/series already from summary.
- [ ] `CustomersPage.tsx`: remove the "Open containers" column (dropped field).
- [ ] `ReportsPage.tsx` / `ExecutiveDashboardPage.tsx`: product-mix/volume come from reworked
  `getProductVolumes` — verify no other dropped-field reads.
- [ ] i18n: remove `dashboard.kpiContainers`, `customers.openContainers` if unused; 3 locales.
- [ ] Gate + commit → `feat(invoicing): dashboard/portal/reports on invoice-based financials`

## Phase E — Final review + live verify

### Task E1 — adversarial full-diff review (subagents) + fixes
Lenses: determinism (cust-am 2,750,000; seed richness), spec-compliance, regressions (T8 sale
flow, existing trade-invoice flows), antd/rtl/i18n. Fix findings.

### Task E2 — live verify (preview MCP)
- [ ] Determinism: `finora-db-v3` created; cust-am creditLimit 2,750,000.
- [ ] Containers: page shows logistics columns; create/edit with multiple goods; removing an
  invoiced good is blocked with the invoice-number modal.
- [ ] Invoice: add line → assign container; convert → container modal; confirm without container
  → 'missing-container' toast; with container → passes; print shows container's BL/ref.
- [ ] Contract detail: shipped % reflects invoices (draft+confirmed, chain-once, no cancelled).
- [ ] Dashboard/Executive/Reports/Portal populated (historical invoices) — no empty screens; all
  four roles' menus correct (CEO/Customer unchanged); console clean.
- [ ] Commit fixes; report to user (commit/push/deploy on request only).

## Self-review (writing-plans checklist)
- Spec coverage: §2→A1, §3→A2, §5→A3/C1, §6→D1/D2, §4→B2, §7→C1/C2, §8→B1/C1/D1, §9→all.
- Type/name consistency: `chainLeafDocs`, `shippedMtForItem`, `recomputeAllRemaining`,
  `getReceivableInvoices/displayStatus`, `applyContainerToAll`, `getGoodContainerUsage`,
  `ConvertContainerModal` reused verbatim across tasks.
- No placeholders: each task names files, contracts, error codes, i18n keys; full code for the
  determinism-critical helpers (chainLeafDocs, seed raw-type, displayStatus).
- Known accepted gap stated: container goods quantity has no hard cap (§4).
