import { db, applySnapshot, onPersist, persistDb, resetDb, type Db } from '@/mock/data';
import { buildSampleData } from '@/mock/sampleData';
import { ApiError, request } from '@/services/http';

/**
 * The whole ERP dataset, moved between the browser and the server in one piece.
 *
 * <p>This is the strangler seam. The app's derived reads are global — one person's balance walks
 * customers, invoices, payments, claims, charge documents, cheques and transfers together — so
 * no single entity can move to the server on its own without leaving every balance quietly
 * wrong. Instead the store is filled from one snapshot on boot and the existing derivation keeps
 * running over it; writes then move feature by feature, and this file disappears when the last
 * read is server-side.</p>
 */

/**
 * Fills the store from the server.
 *
 * Returns false when the API is unreachable, which is not an error: the app still runs on
 * whatever localStorage holds, so a backend that is down degrades to the old behaviour rather
 * than to a blank screen.
 */
export async function hydrateFromServer(): Promise<boolean> {
  try {
    const snapshot = await request<Db>('/api/erp/snapshot');
    applySnapshot(snapshot);
    return true;
  } catch {
    return false;
  }
}

/** Replaces the server's dataset with what the store currently holds. */
export async function pushSnapshot(): Promise<void> {
  await request<void>('/api/erp/snapshot', { method: 'PUT', body: JSON.stringify(db) });
}

/**
 * Pushes after a quiet moment.
 *
 * <p>Transitional, and deliberately crude: until each mutation has its own endpoint, the only
 * way an edit survives a reload is for the whole dataset to go back. The debounce keeps a burst
 * of edits to one request, and the payload is the size of the dataset — a few hundred KB for the
 * full demo set. Every feature whose writes move server-side removes work from here, and the
 * last one removes this function.</p>
 */
let pending: ReturnType<typeof setTimeout> | undefined;
export function schedulePush(): void {
  if (!serverBacked) return;
  clearTimeout(pending);
  pending = setTimeout(() => {
    void pushSnapshot()
      .then(() => setSyncState({ kind: 'ok' }))
      .catch((error: unknown) => {
        const code = error instanceof ApiError ? error.message : 'network';
        // A 403 is not a hiccup. `PUT /api/erp/snapshot` is gated on `Erp:AllowDestructiveAdmin`,
        // which production leaves off, so retrying changes nothing and the edit will NEVER
        // reach the database from here — it needs its own endpoint. Anything else may pass.
        const status = error instanceof ApiError ? error.status : 0;
        setSyncState({ kind: status === 403 ? 'refused' : 'failing', code });
      });
  }, 800);
}

/**
 * Whether the writes that still have no endpoint of their own are reaching the server.
 *
 * <p>`refused` is the honest and permanent one: the whole-dataset push is disabled on this
 * environment, so those edits live in this browser's localStorage and nowhere else.</p>
 */
export type SyncState =
  | { kind: 'ok' }
  | { kind: 'failing'; code: string }
  | { kind: 'refused'; code: string };

let syncState: SyncState = { kind: 'ok' };
const syncListeners = new Set<(state: SyncState) => void>();

function setSyncState(next: SyncState): void {
  // Only on a real change: this fires from a debounced background task, and re-rendering the
  // whole shell on every successful push would be a needless render per edit.
  if (next.kind === syncState.kind) return;
  syncState = next;
  for (const listener of syncListeners) listener(next);
}

export function getSyncState(): SyncState {
  return syncState;
}

export function onSyncStateChange(listener: (state: SyncState) => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

/** True once the server has answered — the app only pushes to a backend it actually reached. */
let serverBacked = false;
export function setServerBacked(value: boolean): void {
  serverBacked = value;
}

export function isServerBacked(): boolean {
  return serverBacked;
}

/**
 * Replaces everything with a fresh demo dataset centred on today, then reloads.
 *
 * The reload is not cosmetic: `api.ts` holds lookup indexes over the store, and while
 * `applySnapshot` rebuilds them, a reload is still the simplest way to guarantee no component
 * is holding a stale derived value from before the swap.
 */
export async function loadSampleData(): Promise<void> {
  applySnapshot(buildSampleData());
  persistDb();
  if (isServerBacked()) await pushSnapshot();
  window.location.reload();
}

/**
 * Empties the store without telling the server.
 *
 * <p>Used when a session ends. The previous user's dataset must not survive into the next one:
 * the server decides how much of it each role may see — a portal customer receives only their own
 * affairs — and a full dataset left behind in memory and localStorage would hand the next person
 * to sign in on this browser everything the last one could read.</p>
 */
export function clearHydratedData(): void {
  serverBacked = false;
  applySnapshot(EMPTY);
  // Marked as already synced: this is a local clear, not an instruction to empty the database.
  persistDb({ alreadySynced: true });
}

/** Wipes everything — the app starts empty again. */
export async function resetData(): Promise<void> {
  if (isServerBacked()) {
    applySnapshot(EMPTY);
    await pushSnapshot();
  }
  // Clears localStorage and reloads.
  resetDb();
}

/** Every collection empty. Spelled out rather than derived, so a new table added to the store
 *  without a thought here shows up as a type error instead of silently surviving a reset. */
const EMPTY: Db = {
  customers: [], contracts: [], containers: [], payments: [], partners: [], warehouses: [],
  invoices: [], inventoryDocs: [], costCentres: [], chargeCategories: [], chargeDocs: [],
  claims: [], goods: [], financialAccounts: [], cheques: [], moneyTransfers: [],
  exchangeGainLosses: [], fxRate: db.fxRate,
};

// Every local write schedules a push, so an edit made before its feature has a real endpoint
// still survives a reload. Registered once, at module load.
onPersist(schedulePush);
