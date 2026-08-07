import type {
  ChargeCategory,
  ChargeDoc,
  Claim,
  Cheque,
  Container,
  Contract,
  CostCentre,
  Customer,
  ExchangeGainLoss,
  FinancialAccount,
  Good,
  MoneyTransfer,
  InventoryDocument,
  Invoice,
  Partner,
  Payment,
  Warehouse,
} from '@/types';
import { DEFAULT_FX_AED_PER_USD } from '@/config/constants';

/**
 * Finora mock persistence layer.
 *
 * The app starts with a completely EMPTY dataset — every array in `seed` below is empty.
 * The full deterministic demo dataset (customers, contracts, containers, invoices, payments,
 * …) lives in `src/mock/sampleData.ts` behind `buildSampleData()`, wired up by the
 * "Load sample data" button in Settings → Danger zone (`SettingsPage.tsx`): it does
 * `Object.assign(db, buildSampleData())` + `persistDb()` + a full page reload.
 *
 * To keep edits across page refreshes we hydrate `db` from localStorage on load and write it
 * back after every mutation (see api.ts `persistDb()` calls).
 *
 * IMPORTANT: bump SCHEMA_VERSION whenever an entity shape changes (add/remove/rename a field
 * on Customer/Contract/Item/Container/Payment/Partner/Invoice/Warehouse/InventoryDocument). A
 * new key discards old-shape data and re-seeds (to the EMPTY seed now, not a regenerated demo
 * set), so a persisted db can never crash the app after a schema change. As a safety net,
 * `isCompatible()` also probes representative fields and falls back to the seed when they're
 * missing. `loadDb()` also purges every OTHER `finora-db-v<N>` key so a pre-migration blob
 * never lingers in localStorage.
 *
 * Schema v4 (2026-07-24): `Container.shipmentDate` → `loadDate`; `InvoiceItem` and
 * `InventoryDocumentItem` both gain a required `referenceDocumentItemId`
 * (docs/superpowers/specs/2026-07-24-warehouse-docs-refdocitem-design.md §2).
 *
 * Schema v5 (2026-07-24): the demo dataset generator moved out of this file into
 * `sampleData.ts`'s `buildSampleData()`; the persisted seed itself starts EMPTY
 * (docs/superpowers/specs/2026-07-24-empty-seed-and-expenses-design.md §2). `Customer` also
 * gains `portalAccount?: boolean` (§3) — additive/optional, so it doesn't need its own probe.
 * Phase C (cost centres + expenses) reuses v5 rather than bumping again: those are additive
 * new entities, not a shape change to anything already persisted.
 *
 * Schema v6 (2026-07-27): the flat `Expense` entity is replaced outright by `ChargeCategory` +
 * `ChargeDoc`/`ChargeLine`/`ChargeAllocation` (expenses/revenues, direction-parameterised) and
 * `Claim`/`ClaimItem` (docs/superpowers/specs/2026-07-27-expense-revenue-claim-rework-design.md
 * §2) — **no migration**; any persisted `expenses` data is discarded per that spec's binding
 * decision. Because this is a brand-new STORAGE_KEY, `costCentres`/`chargeCategories`/
 * `chargeDocs`/`claims` are HARD `Array.isArray` requirements below (not the old v5 soft
 * `!== undefined` probe with a `loadDb` backfill) — every blob that reaches `isCompatible` was
 * persisted under v6 or later, so "missing" now means "not v6", full stop.
 *
 * Goods master (2026-07-30): `Good` (BaseInfo → Goods) **reuses v6** — same reasoning as the
 * Phase-C cost centres above. It is an additive new entity; no persisted record changes shape,
 * and `Item.product` stays a plain string (the goods list only feeds autocomplete). Bumping
 * would have discarded live production data for zero benefit, so `goods` gets a SOFT probe
 * plus a `loadDb` backfill instead of a hard `Array.isArray` requirement.
 */
const SCHEMA_VERSION = 6;
const STORAGE_KEY = `finora-db-v${SCHEMA_VERSION}`;

const seed = {
  customers: [] as Customer[],
  contracts: [] as Contract[],
  containers: [] as Container[],
  payments: [] as Payment[],
  partners: [] as Partner[],
  warehouses: [] as Warehouse[],
  invoices: [] as Invoice[],
  inventoryDocs: [] as InventoryDocument[],
  costCentres: [] as CostCentre[],
  chargeCategories: [] as ChargeCategory[],
  chargeDocs: [] as ChargeDoc[],
  claims: [] as Claim[],
  goods: [] as Good[],
  financialAccounts: [] as FinancialAccount[],
  cheques: [] as Cheque[],
  moneyTransfers: [] as MoneyTransfer[],
  exchangeGainLosses: [] as ExchangeGainLoss[],
  fxRate: DEFAULT_FX_AED_PER_USD,
};

function isCompatible(d: unknown): d is typeof seed {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  if (!Array.isArray(o.customers) || !Array.isArray(o.contracts) || !Array.isArray(o.partners)) {
    return false;
  }
  if (!Array.isArray(o.invoices) || !Array.isArray(o.warehouses) || !Array.isArray(o.inventoryDocs)) {
    return false;
  }
  if (!Array.isArray(o.containers) || !Array.isArray(o.payments)) return false;
  if (typeof o.fxRate !== 'number') return false;
  // Schema v6: a fresh STORAGE_KEY means every blob that reaches here was persisted under v6 or
  // later, so these four arrays are HARD requirements — unlike the old v5 Phase-C soft probe
  // (`!== undefined &&`) with its `loadDb` backfill, missing OR wrong-shape now means "not v6".
  if (
    !Array.isArray(o.costCentres) ||
    !Array.isArray(o.chargeCategories) ||
    !Array.isArray(o.chargeDocs) ||
    !Array.isArray(o.claims)
  ) {
    return false;
  }
  // Goods master (BaseInfo → Goods): additive new entity, so it reuses v6 rather than bumping —
  // exactly the Phase-C cost-centres precedent noted in the header. That means the probe must be
  // SOFT (`!== undefined &&`), not the hard `Array.isArray` used for the v6 four above: a db
  // persisted before this feature shipped legitimately has no `goods` key, and rejecting it here
  // would wipe real user data on first load. `loadDb` backfills `[]`.
  // Note this is `o.goods` (the master list) — unrelated to `Container.goods` probed just below.
  if (o.goods !== undefined && !Array.isArray(o.goods)) return false;
  // `financialAccounts` (Bank + CashSafe) — same additive-entity reasoning and the same SOFT
  // probe as `goods` above. `loadDb` backfills `[]`.
  if (o.financialAccounts !== undefined && !Array.isArray(o.financialAccounts)) return false;
  // `cheques` — additive again, SOFT probe + `loadDb` backfill. Payment items are inline on
  // each Payment (and equally optional), so they need no probe of their own: a legacy payment
  // simply has no `items` key and `paymentItems()` reads that as [].
  if (o.cheques !== undefined && !Array.isArray(o.cheques)) return false;
  // Transfers + revaluations — additive again, SOFT probes and a `loadDb` backfill.
  if (o.moneyTransfers !== undefined && !Array.isArray(o.moneyTransfers)) return false;
  // `exchangeGainLosses` replaced `exchangeRevaluations` on 2026-08-04. Same soft probe; the old
  // key is dropped in `loadDb` rather than probed, because its records no longer have a shape
  // this app can read.
  if (o.exchangeGainLosses !== undefined && !Array.isArray(o.exchangeGainLosses)) return false;
  // Schema v3: Container is a pure logistics entity with a `goods` line array now — an old
  // (pre-v3) persisted blob's first container won't have it. Probe it explicitly since a
  // stale STORAGE_KEY read would otherwise crash every container-financial read at runtime.
  if (o.containers.length && !Array.isArray((o.containers[0] as Record<string, unknown> | undefined)?.goods)) {
    return false;
  }
  // Schema v4: Container.shipmentDate → loadDate.
  if (o.containers.length && typeof (o.containers[0] as Record<string, unknown> | undefined)?.loadDate !== 'string') {
    return false;
  }
  // Schema v4: InvoiceItem/InventoryDocumentItem gain a required referenceDocumentItemId.
  // `.find()` for the first entity that actually HAS items — never index [0].items[0] blindly:
  // createInvoice produces empty-items DRAFTs, and a leading empty draft would false-negative
  // this probe and silently wipe user data.
  const invWithItems = (o.invoices as Array<Record<string, unknown>>).find(
    (i) => Array.isArray(i?.items) && (i.items as unknown[]).length > 0,
  );
  if (
    invWithItems &&
    typeof (invWithItems.items as Array<Record<string, unknown>>)[0].referenceDocumentItemId !== 'string'
  ) {
    return false;
  }
  const docWithItems = (o.inventoryDocs as Array<Record<string, unknown>>).find(
    (d) => Array.isArray(d?.items) && (d.items as unknown[]).length > 0,
  );
  if (
    docWithItems &&
    typeof (docWithItems.items as Array<Record<string, unknown>>)[0].referenceDocumentItemId !== 'string'
  ) {
    return false;
  }
  // Schema v6: ChargeDoc.lines is inline, and each line's allocations is an inline array too.
  // `.find()` for the first doc that actually HAS lines — never `[0].lines[0]` blindly: a
  // freshly-created doc with no lines yet is normal, and a leading one would false-negative
  // this probe and silently wipe user data.
  const chargeDocWithLines = (o.chargeDocs as Array<Record<string, unknown>>).find(
    (cd) => Array.isArray(cd?.lines) && (cd.lines as unknown[]).length > 0,
  );
  if (
    chargeDocWithLines &&
    !Array.isArray((chargeDocWithLines.lines as Array<Record<string, unknown>>)[0].allocations)
  ) {
    return false;
  }
  // Probe representative fields added over time (belt-and-braces vs. SCHEMA_VERSION).
  const c = o.customers[0] as Record<string, unknown> | undefined;
  if (c && (c.active === undefined || c.customerType === undefined || c.creditLimit === undefined)) {
    return false;
  }
  const ct = o.contracts[0] as Record<string, unknown> | undefined;
  if (ct && ct.contractType === undefined) return false;
  const p = o.partners[0] as Record<string, unknown> | undefined;
  if (p && p.active === undefined) return false;
  const inv = o.invoices[0] as Record<string, unknown> | undefined;
  if (inv && inv.invoiceType === undefined) return false;
  const wh = o.warehouses[0] as Record<string, unknown> | undefined;
  if (wh && wh.active === undefined) return false;
  return true;
}

/** Remove every OTHER schema-versioned key (`finora-db-v<N>`) so a stale pre-migration blob
 *  never lingers in localStorage after a SCHEMA_VERSION bump. */
function purgeStaleSchemaKeys(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key !== STORAGE_KEY && /^finora-db-v\d+$/.test(key)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* localStorage unavailable — nothing to purge */
  }
}

/**
 * 2026-08-04: `ClaimSide` changed value domain from `'EXPENSE' | 'REVENUE'` to
 * `'SALE' | 'PURCHASE'`, AND changed meaning. The old values mapped to the OPPOSITE invoice
 * side (`api.ts`'s deleted `claimInvoiceSide`: EXPENSE → PURCHASE), so a textual rename would
 * re-side every stored claim onto the wrong document type — and because the person balance now
 * signs sale and purchase claims oppositely, that silently INVERTS the claim's sign.
 *
 * There is deliberately no `isCompatible` probe for this. A probe would REJECT a db holding old
 * values, and rejection means `loadDb` falls back to the empty seed — destroying the user's
 * customers, contracts, invoices and payments to fix one field on one entity. Old values must be
 * ACCEPTED and migrated, which is what this does.
 *
 * The side is re-derived from the claim's OWN invoice rather than from the old label, so a claim
 * whose stored side was already inconsistent with its invoice is repaired rather than preserved.
 * The label map is only a fallback for the (impossible-by-construction) case of a missing
 * invoice, and it uses the TRUE historical mapping — EXPENSE → PURCHASE — not the renaming that
 * prompted this migration.
 *
 * Idempotent: a claim already carrying a valid new value is left untouched.
 */
function migrateClaimSides(claims: Claim[], invoices: Invoice[]): void {
  if (!Array.isArray(claims) || claims.length === 0) return;
  let byId: Map<string, Invoice> | undefined;
  for (const claim of claims) {
    const side: unknown = claim.side;
    if (side === 'SALE' || side === 'PURCHASE') continue;
    if (!byId) byId = new Map(invoices.map((inv) => [inv.id, inv]));
    const invoiceType = byId.get(claim.invoiceId)?.invoiceType;
    claim.side = invoiceType
      ? invoiceType.startsWith('PURCHASE')
        ? 'PURCHASE'
        : 'SALE'
      : side === 'EXPENSE'
        ? 'PURCHASE'
        : 'SALE';
  }
}

function loadDb(): typeof seed {
  purgeStaleSchemaKeys();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isCompatible(parsed)) {
        // `goods` backfill — see the soft probe in `isCompatible`. A v6 blob written before the
        // goods master existed has no such key, and every reader assumes an array.
        const d = parsed as typeof seed & {
          goods?: Good[];
          financialAccounts?: FinancialAccount[];
          cheques?: Cheque[];
          moneyTransfers?: MoneyTransfer[];
          exchangeGainLosses?: ExchangeGainLoss[];
          /** Pre-2026-08-04 revaluation records. Read only to be discarded. */
          exchangeRevaluations?: unknown;
        };
        if (!Array.isArray(d.goods)) d.goods = [];
        if (!Array.isArray(d.financialAccounts)) d.financialAccounts = [];
        if (!Array.isArray(d.cheques)) d.cheques = [];
        if (!Array.isArray(d.moneyTransfers)) d.moneyTransfers = [];
        if (!Array.isArray(d.exchangeGainLosses)) d.exchangeGainLosses = [];
        // The revaluation engine is gone and its records cannot be read as gain/loss entries —
        // they carried an account, a pair of rates and a proportional allocation set, none of
        // which the new record has. Dropped on purpose, per the agreed decision to wipe them.
        // `delete` rather than leaving them: `persistDb` serialises the whole db, so an
        // untouched key would be written back for ever.
        delete d.exchangeRevaluations;
        migrateClaimSides(d.claims, d.invoices);
        return d;
      }
    }
  } catch {
    /* corrupt or unavailable — fall back to the (empty) seed */
  }
  return seed;
}

export const db = loadDb();

/** Serialize the current db to localStorage. Called after every mutation. */
export function persistDb(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* quota exceeded / serialization issue — ignore in the mock layer */
  }
}

/** Wipe all persisted data and reload — the app starts EMPTY again (the demo dataset lives
 *  behind "Load sample data" in Settings; see `buildSampleData()` in `sampleData.ts`). */
export function resetDb(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export type Db = typeof db;
