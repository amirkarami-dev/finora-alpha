import type {
  Container,
  Contract,
  CostCentre,
  Customer,
  Expense,
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
 */
const SCHEMA_VERSION = 5;
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
  expenses: [] as Expense[],
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
  // Phase C (cost centres + expenses) reuses schema v5 rather than bumping — so a blob persisted
  // before this change shipped won't have these two arrays AT ALL. Missing is fine (backfilled
  // in `loadDb` below); PRESENT-but-wrong-shape is the only thing that should reject the whole
  // blob, so a corrupt/foreign value here can't silently masquerade as an empty list.
  if (o.costCentres !== undefined && !Array.isArray(o.costCentres)) return false;
  if (o.expenses !== undefined && !Array.isArray(o.expenses)) return false;
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

function loadDb(): typeof seed {
  purgeStaleSchemaKeys();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isCompatible(parsed)) {
        // Backfill Phase C's two additive arrays for a blob persisted before they existed
        // (schema v5 wasn't bumped for them) — never silently wipe the customers/contracts
        // already in that blob just because two new lists aren't there yet.
        if (!Array.isArray(parsed.costCentres)) parsed.costCentres = [];
        if (!Array.isArray(parsed.expenses)) parsed.expenses = [];
        return parsed;
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
