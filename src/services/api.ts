import dayjs from 'dayjs';
import { db, persistDb } from '@/mock/data';
import type {
  ChargeAllocation,
  ChargeCategory,
  ChargeDirection,
  ChargeDoc,
  ChargeLine,
  ChargeScope,
  Cheque,
  ChequeStatus,
  ChequeType,
  Claim,
  ClaimItem,
  ClaimSide,
  ClaimType,
  Container,
  ContainerGood,
  ContainerStatus,
  Contract,
  ContractStatus,
  ContractType,
  CostCentre,
  Currency,
  Customer,
  CustomerAccount,
  CustomerType,
  DashboardKpis,
  ExchangeGainLossType,
  ExchangeRealization,
  ExchangeRevaluation,
  FinancialAccount,
  FinancialAccountType,
  Good,
  GoodForm,
  GoodUnit,
  Incoterm,
  Invoice,
  InventoryDocument,
  InventoryDocumentItem,
  InventoryDocType,
  InvoiceItem,
  InvoiceSide,
  InvoiceStatus,
  InvoiceType,
  Item,
  ItemPartner,
  ItemStatus,
  MetalType,
  MoneyTransfer,
  Partner,
  Payment,
  PaymentItem,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ProductVolume,
  StatusBreakdown,
  TimeSeriesPoint,
  TransferStatus,
  Warehouse,
} from '@/types';
import { contractValue, invoiceItemAmount, invoiceItemUnitPrice, splitEqually } from '@/utils/calc';

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms));

/** Live "today" — the single clock every derived read (overdue badges, aging, cashflow
 *  windows) is computed against (spec §2.5: previously pinned to a fixed seed date). */
const TODAY = dayjs();

/**
 * Lookup indexes over the mock `db`. They are rebuilt by `reindex()` after any
 * mutation so derived reads (rows, invoices, product columns) stay consistent.
 */
let customerById = new Map(db.customers.map((c) => [c.id, c]));
let contractById = new Map(db.contracts.map((c) => [c.id, c]));
let itemProduct = new Map(
  db.contracts.flatMap((c) => c.items.map((i) => [i.id, i.product] as const)),
);

function reindex() {
  customerById = new Map(db.customers.map((c) => [c.id, c]));
  contractById = new Map(db.contracts.map((c) => [c.id, c]));
  itemProduct = new Map(
    db.contracts.flatMap((c) => c.items.map((i) => [i.id, i.product] as const)),
  );
}

/* ----------------------------- Customers ---------------------------- */

/** Derived due date for a trade invoice: invoiceDate + the customer's payment terms (spec §6). */
function invoiceDueDate(inv: Invoice): dayjs.Dayjs {
  const terms = customerById.get(inv.customerId)?.paymentTermsDays ?? 0;
  return dayjs(inv.invoiceDate).add(terms, 'day');
}

/** Chain-leaf, CONFIRMED, non-cancelled, priced SALE documents — the receivables universe
 *  (spec §6: "confirmed trade invoices"; draft provisionals/invoices are not yet receivable). */
function receivableLeaves(): Invoice[] {
  return chainLeafDocs('SALE', { includeDraft: false }).filter((inv) => isPricedType(inv.invoiceType));
}

interface SaleReceivable {
  invoiced: number;
  paid: number;
  outstanding: number;
  overdue: number;
}

/** Σ IN-direction payments across an invoice's full chain (spec §7) — the SAME math used by
 *  `getReceivableInvoices`' per-row `paidUSD`, shared here so `saleReceivables()`'s per-document
 *  overdue netting agrees exactly with the per-row OVERDUE badges. */
function receivablePaidUSD(inv: Invoice): number {
  const chainIds = new Set(invoiceChain(inv).map((c) => c.id));
  return round(
    db.payments
      .filter(
        (p) =>
          isSettled(p) && p.invoiceId && chainIds.has(p.invoiceId) && (p.direction ?? 'IN') === 'IN',
      )
      .reduce((s, p) => s + p.amountUSD, 0),
  );
}

/**
 * Per-customer receivables aggregate (spec §6): `invoiced` = Σ chain-leaf CONFIRMED SALE
 * totals; `paid` = Σ IN payments; `outstanding = invoiced − paid`; `overdue` = Σ PER-DOCUMENT
 * netted outstanding (`totalAmount − receivablePaidUSD(inv)`, floored at 0) over sale docs whose
 * derived due date (`invoiceDate + paymentTermsDays`) is before TODAY — true per-document
 * netting, matching `getReceivableInvoices`' per-row OVERDUE math exactly (NOT a raw-total sum
 * capped at the customer-aggregate outstanding).
 */
function saleReceivables(): Map<string, SaleReceivable> {
  const leaves = receivableLeaves();
  const map = new Map<string, SaleReceivable>();
  for (const customer of db.customers) map.set(customer.id, { invoiced: 0, paid: 0, outstanding: 0, overdue: 0 });

  for (const inv of leaves) {
    const entry = map.get(inv.customerId);
    if (!entry) continue;
    entry.invoiced += inv.totalAmount;
    if (invoiceDueDate(inv).isBefore(TODAY, 'day')) {
      const docOutstanding = Math.max(inv.totalAmount - receivablePaidUSD(inv), 0);
      entry.overdue += docOutstanding;
    }
  }
  // Receivables only: purchase-side (OUT) payments must never inflate totalPaid (spec §7).
  for (const p of db.payments) {
    if (!isSettled(p)) continue;
    if ((p.direction ?? 'IN') !== 'IN') continue;
    const entry = map.get(p.customerId);
    if (entry) entry.paid += p.amountUSD;
  }
  for (const [, entry] of map) {
    entry.outstanding = round(Math.max(entry.invoiced - entry.paid, 0));
    entry.overdue = round(entry.overdue);
    entry.invoiced = round(entry.invoiced);
    entry.paid = round(entry.paid);
  }
  return map;
}

export function computeAccounts(): CustomerAccount[] {
  const receivables = saleReceivables();
  return db.customers.map((customer) => {
    const contractCount = db.contracts.filter((c) => c.customerId === customer.id).length;
    const r = receivables.get(customer.id) ?? { invoiced: 0, paid: 0, outstanding: 0, overdue: 0 };
    return {
      ...customer,
      totalInvoiced: r.invoiced,
      totalPaid: r.paid,
      totalOutstanding: r.outstanding,
      overdue: r.overdue,
      contractCount,
    };
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
// 3-decimal rounding for the warehouse ledger: InvoiceItem.quantityMt routinely carries 3
// decimals (unlike money, which is 2dp), so a 2dp `round()` there can round a line's remaining
// quantity ABOVE its actual quantityMt — letting a receipt/issue over-consume by up to 0.005 MT
// or strand a fully-used line as "remaining". Mirrors recomputeAllRemaining's existing 3dp math.
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function getAccounts(): Promise<CustomerAccount[]> {
  await delay();
  return computeAccounts().sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}

export async function getAccount(id: string): Promise<CustomerAccount | null> {
  await delay(160);
  // `?? null`, never a bare `.find()` — TanStack Query rejects `undefined` query data and logs a
  // console error even though the page renders its 404 fine. Same rule as
  // `getCustomerPortalSummary`; every "fetch one by id" reader in this file follows it.
  return computeAccounts().find((a) => a.id === id) ?? null;
}

export interface ReceivableInvoiceRow {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  /** First line's product, plus "+N" when the invoice carries more than one line. */
  summary: string;
  totalAmount: number;
  invoiceDate: string;
  dueDate: string;
  paidUSD: number;
  /** Settlement tri-state — reuses the OPEN/PAID/OVERDUE union + `CONTAINER_STATUS_COLOR`
   *  for the badge (spec §6). */
  displayStatus: ContainerStatus;
  /** `TODAY − dueDate` in days (>0 = overdue, ≤0 = due today/future) — computed once here so
   *  every UI surface reads the SAME clock instead of each page pinning its own "today". */
  overdueDays: number;
}

/**
 * Chain-leaf CONFIRMED sale documents as receivable "invoice" rows (spec §6), optionally
 * scoped to one customer. `paidUSD` sums IN payments across the WHOLE chain — a payment may
 * be recorded against an earlier document in the chain (e.g. a provisional later converted to
 * a final invoice), not necessarily the leaf itself.
 */
export async function getReceivableInvoices(customerId?: string): Promise<ReceivableInvoiceRow[]> {
  await delay(160);
  const leaves = receivableLeaves().filter((inv) => !customerId || inv.customerId === customerId);
  return leaves
    .map((inv) => {
      const products = inv.items.map((it) => it.product);
      const summary =
        products.length === 0
          ? '—'
          : products.length === 1
            ? products[0]
            : `${products[0]} +${products.length - 1}`;
      const paidUSD = receivablePaidUSD(inv);
      const dueDate = invoiceDueDate(inv);
      const displayStatus: ContainerStatus =
        paidUSD >= inv.totalAmount - 0.01 ? 'PAID' : dueDate.isBefore(TODAY, 'day') ? 'OVERDUE' : 'OPEN';
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: customerById.get(inv.customerId)?.name ?? '—',
        summary,
        totalAmount: inv.totalAmount,
        invoiceDate: inv.invoiceDate,
        dueDate: dueDate.toISOString(),
        paidUSD,
        displayStatus,
        overdueDays: TODAY.startOf('day').diff(dueDate.startOf('day'), 'day'),
      };
    })
    .sort((a, b) => dayjs(b.invoiceDate).valueOf() - dayjs(a.invoiceDate).valueOf());
}

/* ----------------------------- Contracts ---------------------------- */
export interface ContractRow extends Contract {
  customerName: string;
  quantityMt: number;
  value: number;
  remainingMt: number;
  shippedPct: number;
}

export function buildContractRows(): ContractRow[] {
  return db.contracts.map((contract) => {
    const customer = customerById.get(contract.customerId);
    const quantityMt = contract.items.reduce((s, i) => s + i.quantityMt, 0);
    const remainingMt = contract.items.reduce((s, i) => s + i.remainingMt, 0);
    return {
      ...contract,
      customerName: customer?.name ?? '—',
      quantityMt: round(quantityMt),
      value: round(contractValue(contract)),
      remainingMt: round(remainingMt),
      shippedPct: quantityMt > 0 ? round(((quantityMt - remainingMt) / quantityMt) * 100) : 0,
    };
  });
}

export async function getContracts(): Promise<ContractRow[]> {
  await delay();
  return buildContractRows().sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

export async function getContract(id: string): Promise<ContractRow | null> {
  await delay(160);
  return buildContractRows().find((c) => c.id === id) ?? null;
}

export async function getContractsByCustomer(customerId: string): Promise<ContractRow[]> {
  await delay(160);
  return buildContractRows().filter((c) => c.customerId === customerId);
}

/* ----------------------------- Containers --------------------------- */
export interface ContainerRow extends Container {
  /** First good's product, plus "+N" when the container carries more than one line. */
  goodsSummary: string;
  totalQtyMt: number;
}

export function buildContainerRows(): ContainerRow[] {
  return db.containers.map((c) => {
    const totalQtyMt = round(c.goods.reduce((s, g) => s + g.quantityMt, 0));
    const products = c.goods.map((g) => itemProduct.get(g.contractItemId) ?? '—');
    const goodsSummary =
      products.length === 0 ? '—' : products.length === 1 ? products[0] : `${products[0]} +${products.length - 1}`;
    return { ...c, goodsSummary, totalQtyMt };
  });
}

export async function getContainers(): Promise<ContainerRow[]> {
  await delay();
  return buildContainerRows().sort(
    (a, b) => dayjs(b.loadDate).valueOf() - dayjs(a.loadDate).valueOf(),
  );
}

export async function getContainersByContract(contractId: string): Promise<ContainerRow[]> {
  await delay(140);
  const itemIds = new Set(contractById.get(contractId)?.items.map((i) => i.id) ?? []);
  return buildContainerRows().filter((c) => c.goods.some((g) => itemIds.has(g.contractItemId)));
}

/** Invoice numbers of invoices holding a line whose `containerId`/`contractItemId` match — used
 *  by the container goods-removal guard (spec §4/§8). */
function goodContainerUsage(containerId: string, contractItemId: string): string[] {
  return db.invoices
    .filter((inv) => inv.items.some((it) => it.containerId === containerId && it.contractItemId === contractItemId))
    .map((inv) => inv.invoiceNumber);
}

export async function getGoodContainerUsage(containerId: string, contractItemId: string): Promise<string[]> {
  await delay(120);
  return goodContainerUsage(containerId, contractItemId);
}

export interface ContainerOptionRow {
  id: string;
  reference: string;
  blNumber?: string;
  loadDate: string;
  /** Contract-item ids this container carries (`c.goods[].contractItemId`) — drives the
   *  good-filtered container pickers (spec §5.2). */
  contractItemIds: string[];
}

export async function getContainerOptions(): Promise<ContainerOptionRow[]> {
  await delay(100);
  return db.containers
    .map((c) => ({
      id: c.id,
      reference: c.reference,
      blNumber: c.blNumber,
      loadDate: c.loadDate,
      contractItemIds: c.goods.map((g) => g.contractItemId),
    }))
    .sort((a, b) => dayjs(b.loadDate).valueOf() - dayjs(a.loadDate).valueOf());
}

/* ----------------------------- Payments ----------------------------- */
export interface PaymentRow extends Payment {
  customerName: string;
  /** Number of the trade invoice this payment is recorded against, when linked. */
  invoiceNumber?: string;
  /** Resolved through the legacy-safe helpers so the list never has to default them itself. */
  resolvedType: PaymentType;
  resolvedStatus: PaymentStatus;
  itemCount: number;
}

/** ONE place that widens a Payment into a row. Four call sites build these; without a shared
 *  builder each would have to remember to default `status`/`type` itself, and the one that
 *  forgot would quietly show every legacy payment as a draft. */
export function toPaymentRow(p: Payment): PaymentRow {
  return {
    ...p,
    customerName: customerById.get(p.customerId)?.name ?? '—',
    invoiceNumber: p.invoiceId ? findInvoice(p.invoiceId)?.invoiceNumber : undefined,
    resolvedType: paymentType(p),
    resolvedStatus: paymentStatus(p),
    itemCount: paymentItems(p).length,
  };
}

export async function getPayments(type?: PaymentType): Promise<PaymentRow[]> {
  await delay();
  return db.payments
    .filter((p) => (type ? paymentType(p) === type : true))
    .map(toPaymentRow)
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

export async function getPaymentsByCustomer(customerId: string): Promise<PaymentRow[]> {
  await delay(140);
  return db.payments
    .filter((p) => p.customerId === customerId)
    .map(toPaymentRow)
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

/* ----------------------------- Dashboard ---------------------------- */
export async function getKpis(): Promise<DashboardKpis> {
  await delay(180);
  const accounts = computeAccounts();
  const totalOutstanding = sum(accounts, (a) => a.totalOutstanding);
  const overdue = sum(accounts, (a) => a.overdue);
  const totalPaid = sum(accounts, (a) => a.totalPaid);
  const totalInvoiced = sum(accounts, (a) => a.totalInvoiced);
  const activeContracts = db.contracts.filter((c) => c.status === 'ACTIVE').length;
  const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

  return {
    totalOutstanding: round(totalOutstanding),
    overdue: round(overdue),
    totalPaid: round(totalPaid),
    totalInvoiced: round(totalInvoiced),
    activeContracts,
    customers: db.customers.length,
    collectionRate: round(collectionRate),
  };
}

/** Monthly invoiced (chain-leaf CONFIRMED sale totals) vs collected (IN payments), by date
 *  (spec §6). */
export async function getCashflowSeries(): Promise<TimeSeriesPoint[]> {
  await delay(180);
  const leaves = receivableLeaves();
  const months: TimeSeriesPoint[] = [];
  const start = TODAY.subtract(11, 'month').startOf('month');
  for (let i = 0; i < 12; i++) {
    const m = start.add(i, 'month');
    const key = m.format('YYYY-MM');
    const invoiced = leaves
      .filter((inv) => dayjs(inv.invoiceDate).format('YYYY-MM') === key)
      .reduce((s, inv) => s + inv.totalAmount, 0);
    // Receivables only: exclude 'OUT' (supplier) payments from the collected series (spec §7).
    const collected = db.payments
      .filter(
        (p) => isSettled(p) && dayjs(p.date).format('YYYY-MM') === key && (p.direction ?? 'IN') === 'IN',
      )
      .reduce((s, p) => s + p.amountUSD, 0);
    months.push({ month: m.format('MMM'), invoiced: round(invoiced), collected: round(collected) });
  }
  return months;
}

/** Aggregates chain-leaf CONFIRMED SALE invoice items — the same "confirmed trade invoices"
 *  universe as receivables (spec §6). */
export async function getProductVolumes(): Promise<ProductVolume[]> {
  await delay(180);
  const map = new Map<string, ProductVolume>();
  for (const inv of receivableLeaves()) {
    for (const it of inv.items) {
      const entry = map.get(it.product) ?? { product: it.product, volumeMt: 0, valueUSD: 0 };
      entry.volumeMt += it.quantityMt;
      entry.valueUSD += it.amount;
      map.set(it.product, entry);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, volumeMt: round(e.volumeMt), valueUSD: round(e.valueUSD) }))
    .sort((a, b) => b.volumeMt - a.volumeMt);
}

export async function getContractStatusBreakdown(): Promise<StatusBreakdown[]> {
  await delay(160);
  const map = new Map<string, StatusBreakdown>();
  for (const c of db.contracts) {
    const entry = map.get(c.status) ?? { status: c.status, count: 0, value: 0 };
    entry.count += 1;
    entry.value += contractValue(c);
    map.set(c.status, entry);
  }
  return [...map.values()].map((e) => ({ ...e, value: round(e.value) }));
}

export interface AgingBucket {
  bucket: string;
  value: number;
}

/** Aging over `getReceivableInvoices()`'s derived outstanding (totalAmount − paidUSD) and
 *  derived due date (spec §6). */
export async function getAgingBuckets(): Promise<AgingBucket[]> {
  await delay(160);
  const rows = await getReceivableInvoices();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  for (const row of rows) {
    const outstanding = row.totalAmount - row.paidUSD;
    if (outstanding <= 0.01) continue;
    const overdueDays = TODAY.startOf('day').diff(dayjs(row.dueDate).startOf('day'), 'day');
    if (overdueDays <= 0) buckets.current += outstanding;
    else if (overdueDays <= 30) buckets.d30 += outstanding;
    else if (overdueDays <= 60) buckets.d60 += outstanding;
    else if (overdueDays <= 90) buckets.d90 += outstanding;
    else buckets.d90p += outstanding;
  }
  return [
    { bucket: 'current', value: round(buckets.current) },
    { bucket: 'days30', value: round(buckets.d30) },
    { bucket: 'days60', value: round(buckets.d60) },
    { bucket: 'days90', value: round(buckets.d90) },
    { bucket: 'days90plus', value: round(buckets.d90p) },
  ];
}

function sum<T>(arr: T[], fn: (t: T) => number): number {
  return arr.reduce((s, t) => s + fn(t), 0);
}

export const fxRate = db.fxRate;

/* ----------------------------- Executive ---------------------------- */
export interface ExecutiveSummary {
  invoiced: number;
  collected: number;
  outstanding: number;
  overdue: number;
  collectionRate: number;
  /** `undefined` when there's no prior period to compare against, or the prior period was
   *  zero (spec §4) — StatCard hides the trend badge rather than render a misleading ↑0%. */
  invoicedGrowthPct: number | undefined;
  collectedGrowthPct: number | undefined;
  activeContracts: number;
  customers: number;
}

export async function getExecutiveSummary(): Promise<ExecutiveSummary> {
  await delay(180);
  const accounts = computeAccounts();
  const invoiced = round(sum(accounts, (a) => a.totalInvoiced));
  const collected = round(sum(accounts, (a) => a.totalPaid));
  const outstanding = round(sum(accounts, (a) => a.totalOutstanding));
  const overdue = round(sum(accounts, (a) => a.overdue));
  const collectionRate = invoiced > 0 ? round((collected / invoiced) * 100) : 0;

  const series = await getCashflowSeries();
  // `undefined` (not 0) whenever there's no meaningful prior-period comparison — too few
  // points, or either period is zero, which would otherwise divide-by-(0||1) or diff-against-0
  // into a bogus ±100%/0% badge (spec §4). StatCard already hides the trend badge when `trend`
  // is undefined. Compares the last two COMPLETE months — `series`'s final point is the
  // current, still-partial month, so comparing against it manufactures a fake decline every
  // day that isn't the 1st (proven: a sample dataset that merely aged from day 0 to day +20/+75
  // reported ↓100%, purely from the partial-month denominator shrinking as the month rolled).
  const growth = (sel: (p: TimeSeriesPoint) => number): number | undefined => {
    if (series.length < 3) return undefined;
    const last = sel(series[series.length - 2]);
    const prev = sel(series[series.length - 3]);
    return prev > 0 && last > 0 ? round(((last - prev) / prev) * 100) : undefined;
  };

  return {
    invoiced,
    collected,
    outstanding,
    overdue,
    collectionRate,
    invoicedGrowthPct: growth((p) => p.invoiced),
    collectedGrowthPct: growth((p) => p.collected),
    activeContracts: db.contracts.filter((c) => c.status === 'ACTIVE').length,
    customers: db.customers.length,
  };
}

/* ----------------------------- Mutations ---------------------------- *
 * The demo runs on an in-memory dataset, so edits live for the session
 * only (a reload restores the seeded data). Each mutation writes through
 * to `db` and calls `reindex()` to refresh the lookup indexes.
 * ------------------------------------------------------------------- */

export interface ContractInput {
  customerId: string;
  /** ISO date string. */
  date: string;
  destination: string;
  status: ContractStatus;
  notes?: string;
  contractType?: ContractType;
}

export interface ItemInput {
  product: string;
  quantityMt: number;
  lmePercent: number;
  lmeFixed: boolean;
  fixedLmePrice: number;
  premium: number;
  incoterm: Incoterm;
  status: ItemStatus;
  notes?: string;
  partners?: ItemPartner[];
}

export async function getCustomers(): Promise<Customer[]> {
  await delay(140);
  return [...db.customers].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPartners(): Promise<Partner[]> {
  await delay(120);
  return [...db.partners];
}

/**
 * Product-name suggestions for the contract goods form.
 *
 * ACTIVE goods master entries first, then any name already used on a contract line. Both
 * sources matter: the master is the list the user curates, but `Item.product` is free text, so
 * names typed before the master existed (or typed straight past it) must stay suggestable or
 * the autocomplete would silently push people to re-type them and create a near-duplicate.
 *
 * Inactive goods are omitted on purpose — that is the whole effect of deactivating one. Its
 * name still appears if a contract already uses it, which is correct: history is not rewritten.
 * De-duplicated case-insensitively, keeping the master's spelling as canonical.
 */
export async function getProductNames(): Promise<string[]> {
  await delay(120);
  const byLower = new Map<string, string>();
  for (const g of db.goods) {
    if (g.active && g.name) byLower.set(g.name.toLowerCase(), g.name);
  }
  for (const contract of db.contracts) {
    for (const item of contract.items) {
      if (item.product && !byLower.has(item.product.toLowerCase())) {
        byLower.set(item.product.toLowerCase(), item.product);
      }
    }
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}

function nextContractId(customerCode: string, dateIso: string): string {
  const base = `${customerCode}-P-${dayjs(dateIso).format('YYMMDD')}`;
  const taken = new Set(db.contracts.map((c) => c.id));
  for (let n = 100; n <= 999; n++) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${db.contracts.length + 1}`;
}

export async function createContract(input: ContractInput): Promise<ContractRow> {
  await delay(180);
  const customer = customerById.get(input.customerId);
  const contract: Contract = {
    id: nextContractId(customer?.code ?? 'XX', input.date),
    customerId: input.customerId,
    contractType: input.contractType ?? 'SELL',
    date: input.date,
    destination: input.destination,
    status: input.status,
    notes: input.notes ?? '',
    items: [],
  };
  db.contracts.push(contract);
  reindex();
  persistDb();
  return buildContractRows().find((c) => c.id === contract.id)!;
}

export async function updateContract(id: string, input: ContractInput): Promise<ContractRow> {
  await delay(180);
  const contract = db.contracts.find((c) => c.id === id);
  if (!contract) throw new Error(`Contract ${id} not found`);
  contract.customerId = input.customerId;
  contract.date = input.date;
  contract.destination = input.destination;
  contract.status = input.status;
  contract.notes = input.notes ?? '';
  reindex();
  persistDb();
  return buildContractRows().find((c) => c.id === id)!;
}

function nextItemId(contract: Contract): string {
  let max = 0;
  for (const item of contract.items) {
    const match = /-I(\d+)$/.exec(item.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${contract.id}-I${max + 1}`;
}

export async function createItem(contractId: string, input: ItemInput): Promise<Item> {
  await delay(180);
  const contract = db.contracts.find((c) => c.id === contractId);
  if (!contract) throw new Error(`Contract ${contractId} not found`);
  const item: Item = {
    id: nextItemId(contract),
    contractId,
    product: input.product,
    quantityMt: input.quantityMt,
    lmePercent: input.lmePercent,
    lmeFixed: input.lmeFixed,
    fixedLmePrice: input.fixedLmePrice,
    premium: input.premium,
    incoterm: input.incoterm,
    status: input.status,
    notes: input.notes ?? '',
    // A brand-new line has shipped nothing yet.
    remainingMt: input.quantityMt,
    partners: input.partners ?? [],
  };
  contract.items.push(item);
  reindex();
  persistDb();
  return item;
}

export async function updateItem(itemId: string, input: ItemInput): Promise<Item> {
  await delay(180);
  let target: Item | undefined;
  for (const contract of db.contracts) {
    const found = contract.items.find((i) => i.id === itemId);
    if (found) {
      target = found;
      break;
    }
  }
  if (!target) throw new Error(`Item ${itemId} not found`);
  target.product = input.product;
  target.quantityMt = input.quantityMt;
  target.lmePercent = input.lmePercent;
  target.lmeFixed = input.lmeFixed;
  target.fixedLmePrice = input.fixedLmePrice;
  target.premium = input.premium;
  target.incoterm = input.incoterm;
  target.status = input.status;
  target.notes = input.notes ?? '';
  target.partners = input.partners ?? target.partners ?? [];
  // Remaining respects MT already invoiced against this item (spec §5) — NOT containers,
  // which carry no shipped-quantity meaning since the schema-v3 logistics reshape.
  target.remainingMt = Math.round(Math.max(input.quantityMt - shippedMtForItem(itemId), 0) * 1000) / 1000;
  reindex();
  persistDb();
  return target;
}

/* ----------------------------- Containers (mutations) --------------- *
 * Containers are pure logistics (spec §2): no money, no status, no single
 * contract/item — they carry a `goods` line array. They no longer drive
 * `Item.remainingMt` (that's invoice-based now, see `shippedMtForItem`/
 * `recomputeAllRemaining` below); a container mutation does NOT recompute it.
 * `updateContainer` enforces the goods-removal guard (`assertNoRemovedGoodInUse`,
 * spec §4/§8) before mutating.
 * ------------------------------------------------------------------- */

export interface ContainerInput {
  reference: string;
  /** ISO date string. */
  loadDate: string;
  /** ISO date string. */
  arrivalDate?: string;
  grossWeightKg?: number;
  netWeightKg?: number;
  blNumber?: string;
  bookingNumber?: string;
  sealNumber?: string;
  goods: ContainerGood[];
}

function nextContainerId(): string {
  const taken = new Set(db.containers.map((c) => c.id));
  let n = db.containers.length + 1;
  let id = `cnt-${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `cnt-${n}`;
  }
  return id;
}

export async function createContainer(input: ContainerInput): Promise<ContainerRow> {
  await delay(180);
  const container: Container = {
    id: nextContainerId(),
    reference: input.reference,
    goods: input.goods,
    loadDate: input.loadDate,
    arrivalDate: input.arrivalDate,
    grossWeightKg: input.grossWeightKg,
    netWeightKg: input.netWeightKg,
    blNumber: input.blNumber,
    bookingNumber: input.bookingNumber,
    sealNumber: input.sealNumber,
  };
  db.containers.push(container);
  reindex();
  persistDb();
  return buildContainerRows().find((c) => c.id === container.id)!;
}

/**
 * Enforces the goods-removal guard server-side (spec §4/§8): a good present on the persisted
 * container but absent from `nextGoods` may not be dropped while an invoice line still
 * references it. Throws `'good-in-use'` with `.invoices`/`.product` attached, BEFORE mutating.
 */
function assertNoRemovedGoodInUse(container: Container, nextGoods: ContainerGood[]): void {
  const nextIds = new Set(nextGoods.map((g) => g.contractItemId));
  for (const good of container.goods) {
    if (nextIds.has(good.contractItemId)) continue;
    const usage = goodContainerUsage(container.id, good.contractItemId);
    if (usage.length > 0) {
      const err = new Error('good-in-use') as Error & { invoices?: string[]; product?: string };
      err.invoices = usage;
      err.product = itemProduct.get(good.contractItemId) ?? good.contractItemId;
      throw err;
    }
  }
}

export async function updateContainer(id: string, input: ContainerInput): Promise<ContainerRow> {
  await delay(180);
  const container = db.containers.find((c) => c.id === id);
  if (!container) throw new Error(`Container ${id} not found`);
  assertNoRemovedGoodInUse(container, input.goods);
  container.reference = input.reference;
  container.goods = input.goods;
  container.loadDate = input.loadDate;
  container.arrivalDate = input.arrivalDate;
  container.grossWeightKg = input.grossWeightKg;
  container.netWeightKg = input.netWeightKg;
  container.blNumber = input.blNumber;
  container.bookingNumber = input.bookingNumber;
  container.sealNumber = input.sealNumber;
  reindex();
  persistDb();
  return buildContainerRows().find((c) => c.id === id)!;
}

/* ----------------------------- Customer CRUD ------------------------ */
export interface CustomerInput {
  name: string;
  code: string;
  defaultCurrency: Currency;
  customerType: CustomerType;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  paymentTermsDays: number;
  creditLimit: number;
  /** Scopes the customer portal login to this customer (spec §3). At most one customer may
   *  hold the flag — setting it here clears it from whichever other customer had it. */
  portalAccount?: boolean;
}

/** At most one customer may hold `portalAccount` (spec §3) — clear it from every other
 *  customer before assigning it here. No-op when `next` is falsy. */
function assignPortalAccount(customers: Customer[], keepId: string, next: boolean | undefined): void {
  if (!next) return;
  for (const c of customers) if (c.id !== keepId) c.portalAccount = undefined;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  await delay(200);
  const code = input.code.trim().toUpperCase();
  const id = `cust-${code.toLowerCase()}`;
  if (db.customers.some((c) => c.id === id)) throw new Error('duplicate-code');
  assignPortalAccount(db.customers, id, input.portalAccount);
  const customer: Customer = {
    id,
    name: input.name.trim(),
    code,
    defaultCurrency: input.defaultCurrency,
    customerType: input.customerType,
    contactName: input.contactName?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    country: input.country?.trim() || undefined,
    paymentTermsDays: input.paymentTermsDays,
    creditLimit: input.creditLimit,
    portalAccount: input.portalAccount || undefined,
    active: true,
    createdAt: dayjs().toISOString(),
  };
  db.customers.push(customer);
  reindex();
  persistDb();
  return customer;
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  await delay(200);
  const customer = db.customers.find((c) => c.id === id);
  if (!customer) throw new Error(`Customer ${id} not found`);
  assignPortalAccount(db.customers, id, input.portalAccount);
  // id, code, createdAt are immutable — mutate the rest in place.
  customer.name = input.name.trim();
  customer.defaultCurrency = input.defaultCurrency;
  customer.customerType = input.customerType;
  customer.contactName = input.contactName?.trim() || undefined;
  customer.email = input.email?.trim() || undefined;
  customer.phone = input.phone?.trim() || undefined;
  customer.country = input.country?.trim() || undefined;
  customer.paymentTermsDays = input.paymentTermsDays;
  customer.creditLimit = input.creditLimit;
  customer.portalAccount = input.portalAccount || undefined;
  reindex();
  persistDb();
  return customer;
}

export async function setCustomerActive(id: string, active: boolean): Promise<Customer> {
  await delay(160);
  const customer = db.customers.find((c) => c.id === id);
  if (!customer) throw new Error(`Customer ${id} not found`);
  customer.active = active;
  // A deactivated customer can't be a live portal login — the flag would otherwise point the
  // portal at an inactive record with no way to notice (spec §3).
  if (!active) customer.portalAccount = undefined;
  persistDb();
  return customer;
}

/* ----------------------------- Partner CRUD ------------------------- */
export interface PartnerInput {
  name: string;
  code: string;
}

export async function createPartner(input: PartnerInput): Promise<Partner> {
  await delay(180);
  const code = input.code.trim().toUpperCase();
  const id = `ptnr-${code.toLowerCase()}`;
  if (db.partners.some((p) => p.id === id)) throw new Error('duplicate-code');
  const partner: Partner = { id, name: input.name.trim(), code, active: true };
  db.partners.push(partner);
  persistDb();
  return partner; // no reindex — nothing in api.ts indexes partners
}

export async function updatePartner(id: string, input: PartnerInput): Promise<Partner> {
  await delay(160);
  const partner = db.partners.find((p) => p.id === id);
  if (!partner) throw new Error(`Partner ${id} not found`);
  partner.name = input.name.trim(); // code immutable
  persistDb();
  return partner;
}

export async function setPartnerActive(id: string, active: boolean): Promise<Partner> {
  await delay(140);
  const partner = db.partners.find((p) => p.id === id);
  if (!partner) throw new Error(`Partner ${id} not found`);
  partner.active = active;
  persistDb();
  return partner;
}

/* ----------------------------- Customer Portal ---------------------- */

export interface CustomerPortalSummary {
  customerId: string;
  name: string;
  code: string;
  country: string;
  defaultCurrency: Customer['defaultCurrency'];
  paymentTermsDays: number;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  overdue: number;
  /** paid / invoiced * 100 */
  settlementRatePct: number;
  /** (outstanding / invoiced) * 365 */
  dsoDays: number;
  /** current-bucket / outstanding * 100 — `undefined` when there's no invoicing history at
   *  all (spec §4): a customer with zero invoices has no "on time" record to report, and
   *  showing a green 100% would misleadingly read as a clean payment history. */
  onTimeSharePct: number | undefined;
  creditLimit: number;
  /** outstanding / creditLimit * 100 */
  creditUtilizationPct: number;
  availableCredit: number;
  aging: AgingBucket[];
  series: TimeSeriesPoint[];
  openInvoices: ReceivableInvoiceRow[];
  recentPayments: PaymentRow[];
  contracts: ContractRow[];
}

/**
 * Re-based onto trade invoices (spec §6): `openInvoices` = `getReceivableInvoices(customerId)`
 * rows (excluding PAID), and the aging/series are derived from that same invoice-based source
 * rather than re-scanning `db.invoices` directly.
 */
export async function getCustomerPortalSummary(
  customerId: string,
): Promise<CustomerPortalSummary | null> {
  await delay(200);
  const account = computeAccounts().find((a) => a.id === customerId);
  // `null`, not `undefined` — TanStack Query rejects `undefined` query data (console error);
  // `null` is a valid "resolved to nothing" result the portal page can render a 403 for.
  if (!account) return null;

  const myContracts = buildContractRows().filter((c) => c.customerId === customerId);

  const openInvoices = (await getReceivableInvoices(customerId)).filter(
    (row) => row.displayStatus !== 'PAID',
  );

  const recentPayments: PaymentRow[] = db.payments
    .filter((p) => p.customerId === customerId)
    .map(toPaymentRow)
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  // Aging buckets over this customer's open (unpaid) invoices.
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  for (const inv of openInvoices) {
    const outstanding = inv.totalAmount - inv.paidUSD;
    const overdueDays = TODAY.startOf('day').diff(dayjs(inv.dueDate).startOf('day'), 'day');
    if (overdueDays <= 0) buckets.current += outstanding;
    else if (overdueDays <= 30) buckets.d30 += outstanding;
    else if (overdueDays <= 60) buckets.d60 += outstanding;
    else if (overdueDays <= 90) buckets.d90 += outstanding;
    else buckets.d90p += outstanding;
  }
  const aging: AgingBucket[] = [
    { bucket: 'current', value: round(buckets.current) },
    { bucket: 'days30', value: round(buckets.d30) },
    { bucket: 'days60', value: round(buckets.d60) },
    { bucket: 'days90', value: round(buckets.d90) },
    { bucket: 'days90plus', value: round(buckets.d90p) },
  ];

  // 12-month invoiced-vs-collected series, scoped to this customer (same chain-leaf
  // CONFIRMED-sale universe as the global cashflow series).
  const myLeaves = receivableLeaves().filter((inv) => inv.customerId === customerId);
  const series: TimeSeriesPoint[] = [];
  const start = TODAY.subtract(11, 'month').startOf('month');
  for (let i = 0; i < 12; i++) {
    const m = start.add(i, 'month');
    const key = m.format('YYYY-MM');
    const invoiced = myLeaves
      .filter((inv) => dayjs(inv.invoiceDate).format('YYYY-MM') === key)
      .reduce((s, inv) => s + inv.totalAmount, 0);
    // Receivables only: exclude 'OUT' (supplier) payments from the collected series (spec §7).
    const collected = db.payments
      .filter(
        (p) =>
          isSettled(p) &&
          p.customerId === customerId &&
          dayjs(p.date).format('YYYY-MM') === key &&
          (p.direction ?? 'IN') === 'IN',
      )
      .reduce((s, p) => s + p.amountUSD, 0);
    series.push({ month: m.format('MMM'), invoiced: round(invoiced), collected: round(collected) });
  }

  const totalInvoiced = account.totalInvoiced;
  const totalPaid = account.totalPaid;
  const outstanding = account.totalOutstanding;
  const overdue = account.overdue;
  const creditLimit = account.creditLimit;

  return {
    customerId: account.id,
    name: account.name,
    code: account.code,
    country: account.country ?? '',
    defaultCurrency: account.defaultCurrency,
    paymentTermsDays: account.paymentTermsDays,
    totalInvoiced,
    totalPaid,
    outstanding,
    overdue,
    settlementRatePct: totalInvoiced > 0 ? round((totalPaid / totalInvoiced) * 100) : 0,
    dsoDays: totalInvoiced > 0 ? Math.round((outstanding / totalInvoiced) * 365) : 0,
    onTimeSharePct:
      totalInvoiced === 0 ? undefined : outstanding > 0 ? round((buckets.current / outstanding) * 100) : 100,
    creditLimit,
    creditUtilizationPct: creditLimit > 0 ? round((outstanding / creditLimit) * 100) : 0,
    availableCredit: round(Math.max(creditLimit - outstanding, 0)),
    aging,
    series,
    openInvoices,
    recentPayments,
    contracts: myContracts,
  };
}

/* ------------------------------------------------------------------ *
 * Trade documents (purchase/sale × order/provisional/invoice) + warehouse
 * + inventory + multi-payment settlement. See
 * docs/superpowers/specs/2026-07-05-invoices-warehouse-payments-design.md
 * (§3 pricing, §4 numbering, §5 lifecycle/chain, §6 warehouse/stock, §7
 * payments, §8 this function list). All mutations persist via `persistDb()`.
 * ------------------------------------------------------------------ */

function invoiceSide(type: InvoiceType): InvoiceSide {
  return type.startsWith('PURCHASE') ? 'PURCHASE' : 'SALE';
}

/** True when `type` belongs to the requested side. */
function isSide(type: InvoiceType, side: InvoiceSide): boolean {
  return invoiceSide(type) === side;
}

function findInvoice(id: string): Invoice | undefined {
  return db.invoices.find((inv) => inv.id === id);
}

function findInvoiceOrThrow(id: string): Invoice {
  const invoice = findInvoice(id);
  if (!invoice) throw new Error(`Invoice ${id} not found`);
  return invoice;
}

/** Recompute and persist an invoice's totals from its current items (spec §3). */
function recomputeInvoiceTotals(invoice: Invoice): void {
  invoice.totalAmount = round(invoice.items.reduce((s, it) => s + it.amount, 0));
  invoice.totalDiscount = round(
    invoice.items.reduce((s, it) => {
      const gross = round((invoiceItemUnitPrice(it) ?? 0) * it.quantityMt);
      return s + (gross - it.amount);
    }, 0),
  );
  invoice.totalWeightMt = round(invoice.items.reduce((s, it) => s + it.quantityMt, 0));
}

/** Recompute one item's `amount` from its current pricing fields (spec §3). */
function recomputeItemAmount(item: InvoiceItem): void {
  item.amount = round(invoiceItemAmount(item));
}

const INVOICE_NUMBER_PREFIX: Record<InvoiceType, string> = {
  PURCHASE_ORDER: 'PO',
  PURCHASE_PROVISIONAL: 'PP',
  PURCHASE_INVOICE: 'PI',
  SALE_ORDER: 'SO',
  SALE_PROVISIONAL: 'SP',
  SALE_INVOICE: 'SI',
};

const INVOICE_ID_PREFIX: Record<InvoiceType, string> = {
  PURCHASE_ORDER: 'po',
  PURCHASE_PROVISIONAL: 'pp',
  PURCHASE_INVOICE: 'pi',
  SALE_ORDER: 'so',
  SALE_PROVISIONAL: 'sp',
  SALE_INVOICE: 'si',
};

/** `<PFX>-<YYYY>-<NNNN>`, scan-until-unused against existing numbers of that type (spec §4). */
function nextInvoiceNumber(type: InvoiceType): string {
  const prefix = INVOICE_NUMBER_PREFIX[type];
  const year = TODAY.format('YYYY');
  const taken = new Set(
    db.invoices.filter((inv) => inv.invoiceType === type).map((inv) => inv.invoiceNumber),
  );
  for (let n = 1; n <= 9999; n++) {
    const candidate = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}-${year}-${db.invoices.length + 1}`;
}

/** Preview the next auto-generated number for a type (used by the create-invoice form). */
export async function previewInvoiceNumber(type: InvoiceType): Promise<string> {
  await delay(80);
  return nextInvoiceNumber(type);
}

function nextInvoiceId(type: InvoiceType): string {
  const prefix = `inv-${INVOICE_ID_PREFIX[type]}-`;
  let max = 0;
  for (const inv of db.invoices) {
    if (inv.id.startsWith(prefix)) {
      const n = Number(inv.id.slice(prefix.length));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

let invoiceItemSeq = db.invoices.reduce(
  (max, inv) =>
    inv.items.reduce((m, it) => {
      const match = /^invitem-(\d+)$/.exec(it.id);
      return match ? Math.max(m, Number(match[1])) : m;
    }, max),
  0,
);
function nextInvoiceItemId(): string {
  invoiceItemSeq += 1;
  return `invitem-${invoiceItemSeq}`;
}

/** RFC 4122 v4; falls back to getRandomValues on non-secure origins. Runtime only — never in the seed. */
function newGuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16); c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function nextInventoryDocId(): string {
  let max = 0;
  for (const doc of db.inventoryDocs) {
    const match = /^idoc-(\d+)$/.exec(doc.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `idoc-${String(max + 1).padStart(4, '0')}`;
}

/** `<GRN|GDN>-<YYYY>-<NNNN>`; the year comes from the document's own `date` (the user picks
 *  it), NOT `TODAY` — a receipt/issue backdated into a prior year must number into that year.
 *  Falls back to today's year when `date` is missing/invalid, so a bad date can't produce a
 *  literal "Invalid Date" inside the document number. */
function nextInventoryDocNumber(type: InventoryDocType, date: string): string {
  const prefix = type === 'IN' ? 'GRN' : 'GDN';
  const parsed = dayjs(date);
  const year = (parsed.isValid() ? parsed : dayjs()).format('YYYY');
  const taken = new Set(db.inventoryDocs.map((d) => d.docNumber));
  for (let n = 1; n <= 9999; n++) {
    const candidate = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}-${year}-${db.inventoryDocs.length + 1}`;
}

let inventoryDocItemSeq = db.inventoryDocs.reduce(
  (max, doc) =>
    doc.items.reduce((m, it) => {
      const match = /^idocitem-(\d+)$/.exec(it.id);
      return match ? Math.max(m, Number(match[1])) : m;
    }, max),
  0,
);
/** Monotonic max-scanning counter (mirrors `nextInvoiceItemId`) — NOT length-derived, so it
 *  can't repeat an id after a cancel/create interleave the way
 *  `` `idocitem-${db.inventoryDocs.length + 1}-${idx + 1}` `` would. */
function nextInventoryDocItemId(): string {
  inventoryDocItemSeq += 1;
  return `idocitem-${inventoryDocItemSeq}`;
}

/* --------------------------- Chain helpers --------------------------- */

/** Non-cancelled document whose `refInvoiceId` points at `id` (at most one, spec §5 invariant 1). */
function findSuccessor(id: string): Invoice | undefined {
  return db.invoices.find((inv) => inv.refInvoiceId === id && inv.status !== 'CANCELLED');
}

/** Full chain (root ancestor → … → deepest non-cancelled successor), for payment aggregation (spec §7). */
function invoiceChain(invoice: Invoice): Invoice[] {
  // Walk to the root via refInvoiceId.
  let root = invoice;
  const seen = new Set([invoice.id]);
  while (root.refInvoiceId) {
    const parent = findInvoice(root.refInvoiceId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    root = parent;
  }
  // Walk down from the root, following non-cancelled successors only (mirrors §5's chain notion).
  const chain: Invoice[] = [root];
  let current = root;
  for (;;) {
    const next = findSuccessor(current.id);
    if (!next || chain.some((c) => c.id === next.id)) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

/**
 * Closes the convert bypass (spec §3): re-adding a contract item to a converted DRAFT (one
 * with a `refInvoiceId`) must reuse the SAME `referenceDocumentItemId` an earlier chain
 * document already assigned that contract item — otherwise the same goods could be received
 * twice under two different ids. Returns `undefined` (mint a fresh id) when the invoice has no
 * chain ancestor, or no chain document has a line for this contract item yet.
 */
function chainReferenceDocumentItemId(invoice: Invoice, contractItemId: string): string | undefined {
  if (!invoice.refInvoiceId) return undefined;
  // A second line for the same good on this document is genuinely additional goods (spec §3
  // explicitly allows multiple lines per contract item on one document) → mint a fresh id so
  // the ledger doesn't bucket two distinct lines under one referenceDocumentItemId. The reuse
  // below only applies to close the delete+re-add bypass, which requires this document to have
  // NO line for the item yet.
  if (invoice.items.some((it) => it.contractItemId === contractItemId)) return undefined;
  for (const inv of invoiceChain(invoice)) {
    const match = inv.items.find((it) => it.contractItemId === contractItemId);
    if (match) return match.referenceDocumentItemId;
  }
  return undefined;
}

/**
 * Chain-leaf docs of `side`: leaf (no non-cancelled successor), excluding CANCELLED.
 * `includeDraft` counts DRAFT leaves too (default: CONFIRMED-only); `excludeInvoiceId` drops
 * one invoice's own claim. Provisional/invoice/order documents only — orders are unpriced but
 * still gated by `isPricedType` at call sites that mean "shipped" (spec §5).
 */
function chainLeafDocs(
  side: InvoiceSide,
  opts: { includeDraft?: boolean; excludeInvoiceId?: string } = {},
): Invoice[] {
  return db.invoices.filter(
    (inv) =>
      isSide(inv.invoiceType, side) &&
      inv.status !== 'CANCELLED' &&
      (opts.includeDraft ? true : inv.status === 'CONFIRMED') &&
      !findSuccessor(inv.id) &&
      inv.id !== opts.excludeInvoiceId,
  );
}

/**
 * Confirmed claims by contract item for `side`, one count per independent chain (FIX — closes a
 * hole bigger than Hole A/B: `findSuccessor`/`chainLeafDocs` treat ANY non-cancelled successor,
 * INCLUDING A DRAFT, as reason to drop a document from the "leaf" set. So the instant a CONFIRMED
 * doc is converted to a DRAFT, its still-live CONFIRMED claim used to vanish from the ceiling,
 * letting a third document re-claim the same quantity. Fix: walk each chain ONCE and count its
 * *deepest CONFIRMED member* (not "is it a leaf") — a confirmed provisional converted to a
 * confirmed final then counts once (the final supersedes the provisional), never twice. Every
 * document belonging to `excludeInvoiceId`'s OWN chain is skipped entirely — that document's own
 * claim is handled separately by the caller (`onThisDocMt` / the live hint), not folded in here.
 */
function confirmedClaimsByItem(side: InvoiceSide, excludeInvoiceId?: string): Map<string, number> {
  const ownChainIds = new Set<string>();
  if (excludeInvoiceId !== undefined) {
    const own = findInvoice(excludeInvoiceId);
    if (own) {
      for (const inv of invoiceChain(own)) ownChainIds.add(inv.id);
    } else {
      ownChainIds.add(excludeInvoiceId);
    }
  }

  const claimed = new Map<string, number>();
  const visitedRoots = new Set<string>();
  for (const inv of db.invoices) {
    if (!isSide(inv.invoiceType, side) || inv.status === 'CANCELLED' || ownChainIds.has(inv.id)) continue;
    const chain = invoiceChain(inv);
    const rootId = chain[0].id;
    if (visitedRoots.has(rootId)) continue;
    visitedRoots.add(rootId);
    // Deepest CONFIRMED member: the last CONFIRMED doc walking root → leaf. A DRAFT successor
    // (converted-but-not-yet-confirmed) does not supersede it; a later CONFIRMED successor does.
    let deepestConfirmed: Invoice | undefined;
    for (const c of chain) {
      if (c.status === 'CONFIRMED') deepestConfirmed = c;
    }
    if (!deepestConfirmed) continue;
    for (const it of deepestConfirmed.items) {
      claimed.set(it.contractItemId, round3((claimed.get(it.contractItemId) ?? 0) + it.quantityMt));
    }
  }
  return claimed;
}

/** Σ `InvoiceItem.quantityMt` for `contractItemId` across BOTH sides' chain-leaf, non-cancelled,
 *  draft-or-confirmed priced documents (spec §5 — "shipped" = chain-once, draft+confirmed). */
function shippedMtForItem(contractItemId: string): number {
  const leaves = [
    ...chainLeafDocs('PURCHASE', { includeDraft: true }),
    ...chainLeafDocs('SALE', { includeDraft: true }),
  ].filter((inv) => isPricedType(inv.invoiceType));
  return leaves.reduce(
    (s, inv) =>
      s +
      inv.items
        .filter((it) => it.contractItemId === contractItemId)
        .reduce((s2, it) => s2 + it.quantityMt, 0),
    0,
  );
}

/** Recompute every contract item's `remainingMt` from `shippedMtForItem` (spec §5). Call after
 *  any invoice mutation that changes item quantities/status/conversion. */
function recomputeAllRemaining(): void {
  for (const contract of db.contracts) {
    for (const item of contract.items) {
      item.remainingMt = Math.round(Math.max(item.quantityMt - shippedMtForItem(item.id), 0) * 1000) / 1000;
    }
  }
}

/* ------------------------------- Selectors ---------------------------- */

export interface TradeInvoiceRow extends Invoice {
  customerName: string;
  itemCount: number;
}

export async function getTradeInvoices(side: InvoiceSide): Promise<TradeInvoiceRow[]> {
  await delay();
  return db.invoices
    .filter((inv) => isSide(inv.invoiceType, side))
    .map((inv) => ({
      ...inv,
      customerName: customerById.get(inv.customerId)?.name ?? '—',
      itemCount: inv.items.length,
    }))
    .sort((a, b) => dayjs(b.invoiceDate).valueOf() - dayjs(a.invoiceDate).valueOf());
}

/** Every trade document for one person, both sides — the person-detail Invoices tab. Sides are
 *  NOT split here: a counterparty can be both buyer and supplier, and the tab shows their whole
 *  trading history in one list with a type column. */
export async function getInvoicesByCustomer(customerId: string): Promise<TradeInvoiceRow[]> {
  await delay(160);
  return db.invoices
    .filter((inv) => inv.customerId === customerId)
    .map((inv) => ({
      ...inv,
      customerName: customerById.get(inv.customerId)?.name ?? '—',
      itemCount: inv.items.length,
    }))
    .sort((a, b) => dayjs(b.invoiceDate).valueOf() - dayjs(a.invoiceDate).valueOf());
}

export interface TradeInvoiceDetail {
  invoice: Invoice;
  items: InvoiceItem[];
  contract?: Contract;
  customerName: string;
  refInvoice?: Invoice;
  successor?: Invoice;
  chain: Invoice[];
  payments: PaymentRow[];
  paidUSD: number;
  remainingUSD: number;
}

export async function getTradeInvoice(id: string): Promise<TradeInvoiceDetail | null> {
  await delay(160);
  const invoice = findInvoice(id);
  if (!invoice) return null;
  const contract = contractById.get(invoice.contractId);
  const chain = invoiceChain(invoice);
  const chainIds = new Set(chain.map((c) => c.id));
  const payments = db.payments
    .filter((p) => p.invoiceId && chainIds.has(p.invoiceId))
    .map(toPaymentRow)
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
  // §7: paidUSD is a straight sum over the chain's payments regardless of direction — a
  // purchase invoice settles via 'OUT' payments and must still show them as paid. The
  // direction EXCLUSION rule (§7) applies only to the separate receivables aggregations
  // (computeAccounts/getKpis/getExecutiveSummary/getCustomerPortalSummary), not here.
  const paidUSD = round(payments.reduce((s, p) => s + p.amountUSD, 0));
  const remainingUSD = round(Math.max(invoice.totalAmount - paidUSD, 0));
  return {
    invoice,
    items: invoice.items,
    contract,
    customerName: customerById.get(invoice.customerId)?.name ?? '—',
    refInvoice: invoice.refInvoiceId ? findInvoice(invoice.refInvoiceId) : undefined,
    successor: findSuccessor(invoice.id),
    chain,
    payments,
    paidUSD,
    remainingUSD,
  };
}

export interface ContractRemainingRow {
  itemId: string;
  product: string;
  quantityMt: number;
  uninvoicedMt: number;
}

/** Per contract item: quantityMt minus CONFIRMED claims of `side` (one per chain, via
 *  `confirmedClaimsByItem` — see its docstring for why a raw chain-leaf filter is wrong),
 *  optionally excluding one invoice's own chain (the doc currently being edited) (spec §5/§8).
 *  Rounded to 3dp (`round3`), matching `checkContractQty`'s guard — a 2dp `round()` here used to
 *  round UP, so the UI hint / input `max` could exceed the API ceiling and be rejected outright. */
export async function getContractRemaining(
  contractId: string,
  side: InvoiceSide,
  excludeInvoiceId?: string,
): Promise<ContractRemainingRow[]> {
  await delay(120);
  const contract = contractById.get(contractId);
  if (!contract) return [];
  const claimedByItem = confirmedClaimsByItem(side, excludeInvoiceId);
  return contract.items.map((item) => ({
    itemId: item.id,
    product: item.product,
    quantityMt: item.quantityMt,
    uninvoicedMt: round3(Math.max(item.quantityMt - (claimedByItem.get(item.id) ?? 0), 0)),
  }));
}

export async function getWarehouses(): Promise<Warehouse[]> {
  await delay(100);
  return [...db.warehouses];
}

export async function getInventoryDocuments() {
  await delay(140);
  return [...db.inventoryDocs].sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

export interface StockLevelRow {
  warehouseId: string;
  /** Normalized key: trim().toLowerCase() (spec §6). */
  productKey: string;
  /** First-seen display casing. */
  product: string;
  mt: number;
}

export async function getStockLevels(): Promise<StockLevelRow[]> {
  await delay(140);
  const rows = new Map<string, StockLevelRow>();
  for (const doc of db.inventoryDocs) {
    if (doc.status !== 'CONFIRMED') continue;
    const sign = doc.type === 'IN' ? 1 : -1;
    for (const item of doc.items) {
      const productKey = item.product.trim().toLowerCase();
      const key = `${doc.warehouseId}::${productKey}`;
      const existing = rows.get(key);
      if (existing) {
        existing.mt = round(existing.mt + sign * item.quantityMt);
      } else {
        rows.set(key, {
          warehouseId: doc.warehouseId,
          productKey,
          product: item.product,
          mt: round(sign * item.quantityMt),
        });
      }
    }
  }
  return [...rows.values()];
}

/** Current stock of `product` (normalized) at `warehouseId`, in MT. */
function stockOf(warehouseId: string, product: string, levels: StockLevelRow[]): number {
  const key = product.trim().toLowerCase();
  return levels.find((r) => r.warehouseId === warehouseId && r.productKey === key)?.mt ?? 0;
}

/* -------------------------- Invoice mutations ------------------------- */

export interface InvoiceInput {
  invoiceType: InvoiceType;
  contractId: string;
  invoiceDate: string;
  invoiceNumber?: string;
  currency?: Currency;
  exchangeRate?: number;
  description?: string;
}

export async function createInvoice(input: InvoiceInput): Promise<Invoice> {
  await delay(180);
  const contract = contractById.get(input.contractId);
  if (!contract) throw new Error(`Contract ${input.contractId} not found`);
  const trimmedNumber = input.invoiceNumber?.trim();
  if (trimmedNumber) {
    const collides = db.invoices.some(
      (inv) => inv.invoiceType === input.invoiceType && inv.invoiceNumber === trimmedNumber,
    );
    if (collides) throw new Error('duplicate-number');
  }
  const invoice: Invoice = {
    id: nextInvoiceId(input.invoiceType),
    invoiceNumber: trimmedNumber || nextInvoiceNumber(input.invoiceType),
    invoiceType: input.invoiceType,
    invoiceDate: input.invoiceDate,
    contractId: input.contractId,
    customerId: contract.customerId,
    status: 'DRAFT',
    currency: input.currency ?? 'USD',
    // `!== 'USD'`, not `=== 'AED'` — USD is the base, so every other currency carries a rate.
    exchangeRate: input.currency !== 'USD' ? (input.exchangeRate ?? db.fxRate) : 1,
    description: input.description?.trim() || undefined,
    totalAmount: 0,
    totalDiscount: 0,
    totalWeightMt: 0,
    createdAt: dayjs().toISOString(),
    items: [],
  };
  db.invoices.push(invoice);
  persistDb();
  return invoice;
}

export interface InvoiceHeaderPatch {
  invoiceNumber?: string;
  invoiceDate?: string;
  currency?: Currency;
  exchangeRate?: number;
  description?: string;
}

/** DRAFT only. Throws `'duplicate-number'` when the number collides within the same type. */
export async function updateInvoiceHeader(id: string, patch: InvoiceHeaderPatch): Promise<Invoice> {
  await delay(160);
  const invoice = findInvoiceOrThrow(id);
  if (invoice.status !== 'DRAFT') throw new Error('not-draft');
  if (patch.invoiceNumber !== undefined) {
    const number = patch.invoiceNumber.trim();
    const collides = db.invoices.some(
      (inv) => inv.id !== id && inv.invoiceType === invoice.invoiceType && inv.invoiceNumber === number,
    );
    if (collides) throw new Error('duplicate-number');
    invoice.invoiceNumber = number;
  }
  if (patch.invoiceDate !== undefined) invoice.invoiceDate = patch.invoiceDate;
  if (patch.currency !== undefined) {
    invoice.currency = patch.currency;
    invoice.exchangeRate = patch.currency !== 'USD' ? (patch.exchangeRate ?? db.fxRate) : 1;
  } else if (patch.exchangeRate !== undefined) {
    invoice.exchangeRate = patch.exchangeRate;
  }
  if (patch.description !== undefined) invoice.description = patch.description.trim() || undefined;
  persistDb();
  return invoice;
}

export interface InvoiceItemInput {
  contractItemId: string;
  quantityMt: number;
  /** Container this line's goods were shipped in (optional while drafting; spec §7). */
  containerId?: string;
  description?: string;
}

function findContractItem(contract: Contract, contractItemId: string): Item | undefined {
  return contract.items.find((i) => i.id === contractItemId);
}

/** Full breakdown behind a contract-quantity guard (spec §3.1/§3.2): what's contracted, what's
 *  already claimed elsewhere, what this document itself already carries, what's left, and what
 *  was requested. */
export interface ContractQtyCheck {
  /** The contract item's own `quantityMt`. */
  contractQuantityMt: number;
  /** Chain-leaf CONFIRMED claims for this contract item on `side`, excluding this invoice. */
  alreadyInvoicedMt: number;
  /** This document's own lines for the same contract item, excluding the line(s) under test. */
  onThisDocMt: number;
  /** max(contractQuantityMt − alreadyInvoicedMt − onThisDocMt, 0). */
  remainingMt: number;
  requestedMt: number;
  exceeds: boolean;
}

interface CheckContractQtyArgs {
  contract: Contract;
  contractItemId: string;
  side: InvoiceSide;
  invoiceId: string;
  requestedMt: number;
  /** Line(s) already reflected in `requestedMt`, so they don't count against themselves in
   *  `onThisDocMt` — a single line id when editing/adding one line, or a whole group's ids when
   *  `requestedMt` is already a group sum (confirmInvoice's per-contract-item total, spec §3.3). */
  excludeInvoiceItemId?: string | string[];
  /** Entries staged earlier in the same multi-entry call (addInvoiceItems), not yet pushed onto
   *  the document, so they must still count against the ceiling (spec §3.3). */
  extraOnDocMt?: number;
}

/**
 * Single source of truth for the contract-quantity guard (spec §3.1), replacing the ad-hoc math
 * that used to live at each of the three call sites (two of which were wrong — see design doc
 * "Hole A"/"Hole B"). `alreadyInvoicedMt` is CONFIRMED-only, one count per OTHER chain via
 * `confirmedClaimsByItem` (see its docstring) — a DRAFT never reserves contract quantity (spec §1
 * user decision; do not change that), but a CONFIRMED claim stays counted even after its document
 * is converted to a DRAFT successor (FIX — previously it vanished the instant conversion
 * happened, via the raw chain-leaf notion; `confirmedClaimsByItem` walks each chain once and
 * takes its deepest CONFIRMED member instead).
 */
function checkContractQty(args: CheckContractQtyArgs): ContractQtyCheck {
  const { contract, contractItemId, side, invoiceId, requestedMt, excludeInvoiceItemId, extraOnDocMt = 0 } = args;
  const contractItem = findContractItem(contract, contractItemId);
  const contractQuantityMt = contractItem?.quantityMt ?? 0;

  const claimed = confirmedClaimsByItem(side, invoiceId);
  const alreadyInvoicedMt = round3(claimed.get(contractItemId) ?? 0);

  const excludeIds = new Set(
    excludeInvoiceItemId === undefined
      ? []
      : Array.isArray(excludeInvoiceItemId)
        ? excludeInvoiceItemId
        : [excludeInvoiceItemId],
  );
  const invoice = findInvoice(invoiceId);
  const onThisDocOwnMt = invoice
    ? invoice.items
        .filter((it) => it.contractItemId === contractItemId && !excludeIds.has(it.id))
        .reduce((s, it) => s + it.quantityMt, 0)
    : 0;
  const onThisDocMt = round3(onThisDocOwnMt + extraOnDocMt);

  const remainingMt = round3(Math.max(contractQuantityMt - alreadyInvoicedMt - onThisDocMt, 0));
  const requested = round3(requestedMt);

  return {
    contractQuantityMt,
    alreadyInvoicedMt,
    onThisDocMt,
    remainingMt,
    requestedMt: requested,
    exceeds: requested > remainingMt + 1e-9,
  };
}

/** Throws `'qty-exceeds-remaining'` with the full breakdown attached (spec §3.2); `available` is
 *  kept as an alias of `remainingMt` so any pre-existing `.available` reader keeps working. */
function throwQtyExceeds(check: ContractQtyCheck, product: string): never {
  const err = new Error('qty-exceeds-remaining') as Error &
    ContractQtyCheck & { product: string; available: number };
  Object.assign(err, check, { product, available: check.remainingMt });
  throw err;
}

/** Copies the pricing snapshot from the contract item and validates remaining qty (spec §2/§5). */
export async function addInvoiceItems(
  invoiceId: string,
  items: InvoiceItemInput[],
): Promise<Invoice> {
  await delay(200);
  const invoice = findInvoiceOrThrow(invoiceId);
  if (invoice.status !== 'DRAFT') throw new Error('not-draft');
  const contract = contractById.get(invoice.contractId);
  if (!contract) throw new Error(`Contract ${invoice.contractId} not found`);
  const side = invoiceSide(invoice.invoiceType);

  // Round once at the boundary (FIX — the guard validated round3(requestedMt) but both call sites
  // used to STORE the caller's raw value, so up to +0.0005 MT per line the guard never saw could
  // accumulate across lines). `roundedQty[i]` is the single value both validated AND stored.
  const roundedQty = items.map((input) => round3(input.quantityMt));

  // Pass 1: validate EVERY entry before mutating the draft at all (atomicity fix — a multi-entry
  // call that would fail partway used to leave the earlier entries pushed). `extraByItem`
  // accumulates entries staged earlier in this same call so they still count against later
  // entries for the same contract item.
  const extraByItem = new Map<string, number>();
  items.forEach((input, i) => {
    const contractItem = findContractItem(contract, input.contractItemId);
    if (!contractItem) throw new Error(`Contract item ${input.contractItemId} not found`);
    const q = roundedQty[i];
    const check = checkContractQty({
      contract,
      contractItemId: contractItem.id,
      side,
      invoiceId: invoice.id,
      requestedMt: q,
      extraOnDocMt: extraByItem.get(contractItem.id) ?? 0,
    });
    if (check.exceeds) throwQtyExceeds(check, contractItem.product);
    extraByItem.set(contractItem.id, round3((extraByItem.get(contractItem.id) ?? 0) + q));
  });

  // Pass 2: every entry is now known-valid — build and push lines in order. This mirrors the
  // original per-line loop so `chainReferenceDocumentItemId` (which reads `invoice.items` as it
  // fills in) still sees each entry pushed before the next is evaluated.
  items.forEach((input, i) => {
    const contractItem = findContractItem(contract, input.contractItemId)!;
    const newItem: InvoiceItem = {
      id: nextInvoiceItemId(),
      invoiceId: invoice.id,
      contractItemId: contractItem.id,
      // Reuse the chain's existing id on a converted draft (closes the delete+re-add bypass,
      // spec §3); mint a fresh one only when this contract item has no prior chain line.
      referenceDocumentItemId: chainReferenceDocumentItemId(invoice, contractItem.id) ?? newGuid(),
      product: contractItem.product,
      quantityMt: roundedQty[i],
      lmePercent: contractItem.lmePercent,
      lmeFixed: contractItem.lmeFixed,
      fixedPrice: contractItem.fixedLmePrice,
      premium: contractItem.premium,
      containerId: input.containerId,
      description: input.description?.trim() || undefined,
      amount: 0,
    };
    recomputeItemAmount(newItem);
    invoice.items.push(newItem);
  });
  recomputeInvoiceTotals(invoice);
  recomputeAllRemaining();
  persistDb();
  return invoice;
}

export interface InvoiceItemPatch {
  quantityMt?: number;
  containerId?: string;
  description?: string;
  discountPercent?: number;
}

export async function updateInvoiceItem(
  invoiceId: string,
  itemId: string,
  patch: InvoiceItemPatch,
): Promise<Invoice> {
  await delay(180);
  const invoice = findInvoiceOrThrow(invoiceId);
  if (invoice.status !== 'DRAFT') throw new Error('not-draft');
  const item = invoice.items.find((it) => it.id === itemId);
  if (!item) throw new Error(`Invoice item ${itemId} not found`);

  if (patch.quantityMt !== undefined) {
    // Round once at the boundary (FIX 6 — see addInvoiceItems) so the stored value is exactly
    // what the guard validated, never +0.0005 MT more.
    const q = round3(patch.quantityMt);
    // Only guard genuine INCREASES (FIX 3): EditLineModal always resubmits quantityMt alongside
    // container/discount/description, so guarding every patch rejected a container-only edit the
    // instant a rival document shrank the ceiling below this line's unchanged quantity — and
    // because the throw happened before any field was applied, the container/discount/
    // description patch was silently discarded too. A non-increasing edit cannot worsen an
    // overshoot (confirmInvoice's group check remains the backstop), so it's always allowed.
    if (q > item.quantityMt + 1e-9) {
      const side = invoiceSide(invoice.invoiceType);
      const contract = contractById.get(invoice.contractId);
      if (!contract) throw new Error(`Contract ${invoice.contractId} not found`);
      // excludeInvoiceItemId: item.id — this line's own current quantity must NOT count against
      // itself (Hole A: the old formula added it back even though chainLeafDocs, CONFIRMED-only,
      // never subtracted it as a draft in the first place, inflating the ceiling).
      const check = checkContractQty({
        contract,
        contractItemId: item.contractItemId,
        side,
        invoiceId: invoice.id,
        requestedMt: q,
        excludeInvoiceItemId: item.id,
      });
      if (check.exceeds) throwQtyExceeds(check, item.product);
    }
    item.quantityMt = q;
  }
  if (patch.containerId !== undefined) item.containerId = patch.containerId || undefined;
  if (patch.description !== undefined) item.description = patch.description.trim() || undefined;
  if (patch.discountPercent !== undefined) item.discountPercent = patch.discountPercent;

  recomputeItemAmount(item);
  recomputeInvoiceTotals(invoice);
  recomputeAllRemaining();
  persistDb();
  return invoice;
}

export async function removeInvoiceItem(invoiceId: string, itemId: string): Promise<Invoice> {
  await delay(160);
  const invoice = findInvoiceOrThrow(invoiceId);
  if (invoice.status !== 'DRAFT') throw new Error('not-draft');
  invoice.items = invoice.items.filter((it) => it.id !== itemId);
  recomputeInvoiceTotals(invoice);
  recomputeAllRemaining();
  persistDb();
  return invoice;
}

export interface ApplyLmePriceInput {
  lmeDate: string;
  lmePrice: number;
  discountPercent?: number;
}

/**
 * Spec §3 EXACTLY: `lmeDate` on ALL items; `lmePrice` on FLOATING (`!lmeFixed`)
 * items only; `discountPercent`, when provided, overwrites ALL items.
 */
export async function applyLmePrice(invoiceId: string, input: ApplyLmePriceInput): Promise<Invoice> {
  await delay(180);
  const invoice = findInvoiceOrThrow(invoiceId);
  if (invoice.status !== 'DRAFT') throw new Error('not-draft');
  for (const item of invoice.items) {
    item.lmeDate = input.lmeDate;
    if (!item.lmeFixed) item.lmePrice = input.lmePrice;
    if (input.discountPercent !== undefined) item.discountPercent = input.discountPercent;
    recomputeItemAmount(item);
  }
  recomputeInvoiceTotals(invoice);
  persistDb();
  return invoice;
}

function isPricedType(type: InvoiceType): boolean {
  return type !== 'PURCHASE_ORDER' && type !== 'SALE_ORDER';
}

/**
 * Guards IN ORDER (spec §5/§7/§8, warehouse-decoupling spec §4): 'not-draft' → 'no-items' →
 * 'missing-lme-price' (provisional/final with a floating line lacking lmePrice) →
 * 'missing-container' (provisional/final: every line must carry a containerId; orders are
 * exempt) → 'qty-exceeds-remaining' (re-validate §5 invariant 3). Confirming an invoice no
 * longer touches warehouse stock or creates inventory documents — those are created by hand
 * via `createInventoryDocument` against a chain-leaf CONFIRMED invoice (warehouse spec §6.1).
 */
export async function confirmInvoice(id: string): Promise<Invoice> {
  await delay(200);
  const invoice = findInvoiceOrThrow(id);
  if (invoice.status !== 'DRAFT') throw new Error('not-draft');

  if (invoice.items.length === 0) throw new Error('no-items');

  if (isPricedType(invoice.invoiceType)) {
    const missing = invoice.items.some((it) => !it.lmeFixed && it.lmePrice === undefined);
    if (missing) throw new Error('missing-lme-price');
  }

  if (isPricedType(invoice.invoiceType)) {
    const noContainer = invoice.items.filter((it) => !it.containerId);
    if (noContainer.length > 0) {
      const err = new Error('missing-container') as Error & { products?: string[] };
      err.products = noContainer.map((i) => i.product);
      throw err;
    }
  }

  // Re-validate remaining contract quantity at confirm time (spec §5 invariant 3): two
  // DRAFTs can each pass edit-time checks; the second one to confirm must fail here. GROUP this
  // document's items by contractItemId and compare each group's SUM once (Hole B fix — the old
  // loop tested each line independently, so three lines each individually under the ceiling
  // could together blow past it undetected).
  const side = invoiceSide(invoice.invoiceType);
  const contract = contractById.get(invoice.contractId);
  if (!contract) throw new Error(`Contract ${invoice.contractId} not found`);
  const groups = new Map<string, { quantityMt: number; itemIds: string[] }>();
  for (const item of invoice.items) {
    const group = groups.get(item.contractItemId) ?? { quantityMt: 0, itemIds: [] };
    group.quantityMt = round3(group.quantityMt + item.quantityMt);
    group.itemIds.push(item.id);
    groups.set(item.contractItemId, group);
  }
  for (const [contractItemId, group] of groups) {
    const contractItem = findContractItem(contract, contractItemId);
    if (!contractItem) continue;
    const check = checkContractQty({
      contract,
      contractItemId,
      side,
      invoiceId: invoice.id,
      requestedMt: group.quantityMt,
      // The whole group is already folded into `requestedMt` above, so every line in it must be
      // excluded from `onThisDocMt` — otherwise the group's own lines would be double-counted.
      excludeInvoiceItemId: group.itemIds,
    });
    if (check.exceeds) throwQtyExceeds(check, contractItem.product);
  }

  invoice.status = 'CONFIRMED';
  recomputeAllRemaining();
  persistDb();
  return invoice;
}

/**
 * Throws `'cancel-blocked-successor'` when a non-cancelled successor exists (spec §5).
 * Cancelling an invoice no longer touches warehouse documents (warehouse spec §4) — any
 * inventory receipt/issue created against this invoice survives and must be cancelled
 * separately via `cancelInventoryDocument`, which carries its own stock guard. Throws
 * `'cancel-blocked-inventory-doc'` when a live (non-cancelled) inventory document still
 * references this invoice: without this guard, cancelling would free the contract's
 * remaining qty (recomputeAllRemaining) while the warehouse doc keeps its consumed-qty claim,
 * so a replacement invoice could mint a fresh referenceDocumentItemId and receive/issue the
 * same physical goods a second time.
 */
export async function cancelInvoice(id: string): Promise<Invoice> {
  await delay(180);
  const invoice = findInvoiceOrThrow(id);
  if (invoice.status === 'CANCELLED') return invoice;

  if (findSuccessor(invoice.id)) {
    throw new Error('cancel-blocked-successor');
  }
  if (db.inventoryDocs.some((d) => d.invoiceId === invoice.id && d.status !== 'CANCELLED')) {
    throw new Error('cancel-blocked-inventory-doc');
  }

  invoice.status = 'CANCELLED';
  recomputeAllRemaining();
  persistDb();
  return invoice;
}

/* ------------------------- Warehouse documents ------------------------ */

export interface InventoryDocItemInput {
  /** Chain-stable line identity (`InvoiceItem.referenceDocumentItemId`) — the dedupe/ledger key. */
  referenceDocumentItemId: string;
  quantityMt: number;
}

export interface InventoryDocInput {
  type: InventoryDocType;
  warehouseId: string;
  invoiceId: string;
  date: string;
  notes?: string;
  items: InventoryDocItemInput[];
}

/** Σ `InventoryDocumentItem.quantityMt` per `referenceDocumentItemId`, over documents where
 *  `status !== 'CANCELLED'` — written this way (not `=== 'CONFIRMED'`) so a future DRAFT
 *  inventory-doc status would still count toward the ledger (warehouse spec §6.1). */
function usedQtyByReferenceDocumentItemId(): Map<string, number> {
  const used = new Map<string, number>();
  for (const doc of db.inventoryDocs) {
    if (doc.status === 'CANCELLED') continue;
    for (const item of doc.items) {
      used.set(item.referenceDocumentItemId, (used.get(item.referenceDocumentItemId) ?? 0) + item.quantityMt);
    }
  }
  return used;
}

export interface InventoryDocLineRow {
  invoiceItemId: string;
  referenceDocumentItemId: string;
  product: string;
  quantityMt: number;
  usedMt: number;
  remainingMt: number;
  containerId?: string;
  /** docNumbers of the non-cancelled inventory documents that have consumed this line. */
  usedInDocNumbers: string[];
}

/** Per-line consumed-quantity ledger for one invoice — feeds the receipt/issue picker; a line
 *  is offered while `remainingMt > 1e-9` (warehouse spec §6.1). */
export async function getInvoiceLinesForInventory(invoiceId: string): Promise<InventoryDocLineRow[]> {
  await delay(140);
  const invoice = findInvoiceOrThrow(invoiceId);
  const used = usedQtyByReferenceDocumentItemId();
  return invoice.items.map((it) => {
    const usedMt = round3(used.get(it.referenceDocumentItemId) ?? 0);
    const usedInDocNumbers = db.inventoryDocs
      .filter(
        (d) =>
          d.status !== 'CANCELLED' &&
          d.items.some((di) => di.referenceDocumentItemId === it.referenceDocumentItemId),
      )
      .map((d) => d.docNumber);
    return {
      invoiceItemId: it.id,
      referenceDocumentItemId: it.referenceDocumentItemId,
      product: it.product,
      quantityMt: it.quantityMt,
      usedMt,
      remainingMt: round3(Math.max(it.quantityMt - usedMt, 0)),
      containerId: it.containerId,
      usedInDocNumbers,
    };
  });
}

export interface InventorySourceInvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  invoiceDate: string;
  customerName: string;
}

/** Chain-leaf CONFIRMED priced invoices of the side matching `type` (IN⇔PURCHASE, OUT⇔SALE) —
 *  feeds the receipt/issue invoice picker. Distinct from `getInvoiceOptions` below: this list
 *  is intentionally narrow (warehouse spec §6.1). */
export async function getInventorySourceInvoices(type: InventoryDocType): Promise<InventorySourceInvoiceRow[]> {
  await delay(140);
  const side: InvoiceSide = type === 'IN' ? 'PURCHASE' : 'SALE';
  return chainLeafDocs(side)
    .filter((inv) => isPricedType(inv.invoiceType))
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      invoiceDate: inv.invoiceDate,
      customerName: customerById.get(inv.customerId)?.name ?? '—',
    }))
    .sort((a, b) => dayjs(b.invoiceDate).valueOf() - dayjs(a.invoiceDate).valueOf());
}

export interface InvoiceOptionRow {
  id: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
}

/** ALL invoices, unfiltered — feeds the documents table's id→number label map, which must
 *  resolve even for cancelled/superseded invoices now that cancelling an invoice no longer
 *  cascades to its inventory documents (warehouse spec §6.1). Do NOT filter this one; that's
 *  what `getInventorySourceInvoices` is for. */
export async function getInvoiceOptions(): Promise<InvoiceOptionRow[]> {
  await delay(100);
  return db.invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceType: inv.invoiceType,
    status: inv.status,
  }));
}

/**
 * Creates a manual Receipt (IN) / Issue (OUT) document sourced from one invoice's lines,
 * consumption-tracked against `referenceDocumentItemId` (warehouse spec §6.1). `product` and
 * each line's ceiling are NEVER taken from the client — both are derived here from the
 * invoice line `referenceDocumentItemId` points at, so a caller can't mint phantom stock or
 * smuggle a negative quantity past the OUT-only stock guard.
 *
 * Guards IN ORDER: 'no-items' → 'warehouse-required' (id exists AND is active) →
 * 'invoice-side-mismatch' / 'invoice-not-confirmed' (must be a chain-leaf CONFIRMED priced
 * document of the matching side) → per line, in order: 'line-not-on-invoice' →
 * 'invalid-quantity' (qty <= 0) → 'exceeds-remaining' (err.product/err.remaining) → OUT only
 * 'insufficient-stock' (err.product/err.available), checked with a RUNNING deduction (a
 * mutable per-product map, lazily seeded from `stockOf`/`getStockLevels` and subtracted as
 * each line validates) so two lines of the same product that are jointly over stock are
 * caught — a fresh per-line snapshot read would let them both through.
 */
export async function createInventoryDocument(input: InventoryDocInput): Promise<InventoryDocument> {
  await delay(220);
  if (input.items.length === 0) throw new Error('no-items');

  const warehouse = db.warehouses.find((w) => w.id === input.warehouseId && w.active);
  if (!warehouse) throw new Error('warehouse-required');

  const invoice = findInvoiceOrThrow(input.invoiceId);
  const side: InvoiceSide = input.type === 'IN' ? 'PURCHASE' : 'SALE';
  if (!isSide(invoice.invoiceType, side)) throw new Error('invoice-side-mismatch');
  const isChainLeafConfirmed =
    isPricedType(invoice.invoiceType) && chainLeafDocs(side).some((inv) => inv.id === invoice.id);
  if (!isChainLeafConfirmed) throw new Error('invoice-not-confirmed');

  const lineByRefId = new Map(invoice.items.map((it) => [it.referenceDocumentItemId, it]));
  const used = usedQtyByReferenceDocumentItemId();
  const levels = input.type === 'OUT' ? await getStockLevels() : undefined;
  const stockByKey = new Map<string, number>();

  const docId = nextInventoryDocId();
  const items: InventoryDocumentItem[] = [];
  for (const line of input.items) {
    const invoiceItem = lineByRefId.get(line.referenceDocumentItemId);
    if (!invoiceItem) throw new Error('line-not-on-invoice');
    if (!Number.isFinite(line.quantityMt) || line.quantityMt <= 0) throw new Error('invalid-quantity');

    const usedMt = used.get(line.referenceDocumentItemId) ?? 0;
    const remainingMt = round3(Math.max(invoiceItem.quantityMt - usedMt, 0));
    if (line.quantityMt > remainingMt + 1e-9) {
      const err = new Error('exceeds-remaining') as Error & { product?: string; remaining?: number };
      err.product = invoiceItem.product;
      err.remaining = remainingMt;
      throw err;
    }
    // Accumulate into the running ledger (mirrors the OUT stock guard's stockByKey below) so
    // two input lines sharing one referenceDocumentItemId are checked jointly, not each against
    // a stale pre-loop snapshot.
    used.set(line.referenceDocumentItemId, usedMt + line.quantityMt);

    if (levels) {
      const productKey = invoiceItem.product.trim().toLowerCase();
      if (!stockByKey.has(productKey)) stockByKey.set(productKey, stockOf(warehouse.id, invoiceItem.product, levels));
      const available = stockByKey.get(productKey) ?? 0;
      if (line.quantityMt > available + 1e-9) {
        const err = new Error('insufficient-stock') as Error & { product?: string; available?: number };
        err.product = invoiceItem.product;
        err.available = round(Math.max(available, 0));
        throw err;
      }
      stockByKey.set(productKey, round(available - line.quantityMt));
    }

    items.push({
      id: nextInventoryDocItemId(),
      documentId: docId,
      invoiceItemId: invoiceItem.id,
      referenceDocumentItemId: line.referenceDocumentItemId,
      product: invoiceItem.product,
      quantityMt: line.quantityMt,
    });
  }

  const doc: InventoryDocument = {
    id: docId,
    docNumber: nextInventoryDocNumber(input.type, input.date),
    warehouseId: warehouse.id,
    invoiceId: invoice.id,
    type: input.type,
    date: input.date,
    status: 'CONFIRMED',
    notes: input.notes?.trim() || undefined,
    items,
  };
  db.inventoryDocs.push(doc);
  persistDb();
  return doc;
}

/**
 * Sets `status = 'CANCELLED'`. For an IN doc, throws `'cancel-blocked-stock'` (err.product)
 * when reversing it would drive any of its products' stock negative in the document's OWN
 * warehouse (a receipt only ever credited that one warehouse, so the check is correctly scoped
 * to `doc.warehouseId` rather than every warehouse the product is stocked in) — checked with
 * the same running-accumulation map as `createInventoryDocument`'s OUT guard, so two lines of
 * the same product within this one doc can't each pass against a stale snapshot.
 */
export async function cancelInventoryDocument(id: string): Promise<InventoryDocument> {
  await delay(180);
  const doc = db.inventoryDocs.find((d) => d.id === id);
  if (!doc) throw new Error(`Inventory document ${id} not found`);
  if (doc.status === 'CANCELLED') return doc;

  if (doc.type === 'IN') {
    const levels = await getStockLevels();
    const stockByKey = new Map<string, number>();
    for (const item of doc.items) {
      const productKey = item.product.trim().toLowerCase();
      if (!stockByKey.has(productKey)) stockByKey.set(productKey, stockOf(doc.warehouseId, item.product, levels));
      const current = stockByKey.get(productKey) ?? 0;
      if (current - item.quantityMt < -1e-9) {
        const err = new Error('cancel-blocked-stock') as Error & { product?: string };
        err.product = item.product;
        throw err;
      }
      stockByKey.set(productKey, round(current - item.quantityMt));
    }
  }

  doc.status = 'CANCELLED';
  persistDb();
  return doc;
}

const CONVERT_TARGETS: Record<InvoiceType, InvoiceType[]> = {
  PURCHASE_ORDER: ['PURCHASE_PROVISIONAL', 'PURCHASE_INVOICE'],
  PURCHASE_PROVISIONAL: ['PURCHASE_INVOICE'],
  PURCHASE_INVOICE: [],
  SALE_ORDER: ['SALE_PROVISIONAL', 'SALE_INVOICE'],
  SALE_PROVISIONAL: ['SALE_INVOICE'],
  SALE_INVOICE: [],
};

/**
 * Creates a new DRAFT of `targetType` copying header + items from `id` (spec §5).
 * Throws `'has-successor'` when a non-cancelled successor already exists.
 * PP→PI / SP→SI carry lmePrice/lmeDate/discount; PO/SO→* never carry (orders are unpriced).
 */
export async function convertInvoice(id: string, targetType: InvoiceType): Promise<Invoice> {
  await delay(200);
  const source = findInvoiceOrThrow(id);
  if (source.status !== 'CONFIRMED') throw new Error('not-confirmed');
  if (findSuccessor(source.id)) throw new Error('has-successor');
  if (!CONVERT_TARGETS[source.invoiceType].includes(targetType)) throw new Error('invalid-target');

  const carryPrices = source.invoiceType === 'PURCHASE_PROVISIONAL' || source.invoiceType === 'SALE_PROVISIONAL';

  const newId = nextInvoiceId(targetType);
  // The `...it` spread is what carries `referenceDocumentItemId` (and every other unlisted
  // field) from the source line to the new draft's line, unchanged — that is what makes the
  // ref id survive provisional→final conversion (spec §3 requirement 5). Replacing this spread
  // with an explicit field list would silently drop it: no type error, just a fresh id minted
  // wherever a line is next created against the same contract item, breaking warehouse dedupe.
  const newItems: InvoiceItem[] = source.items.map((it) => ({
    ...it,
    id: nextInvoiceItemId(),
    invoiceId: newId,
    lmePrice: carryPrices ? it.lmePrice : undefined,
    lmeDate: carryPrices ? it.lmeDate : undefined,
    discountPercent: carryPrices ? it.discountPercent : undefined,
  }));
  newItems.forEach((it) => recomputeItemAmount(it));

  const draft: Invoice = {
    id: newId,
    invoiceNumber: nextInvoiceNumber(targetType),
    invoiceType: targetType,
    invoiceDate: TODAY.toISOString(),
    contractId: source.contractId,
    customerId: source.customerId,
    status: 'DRAFT',
    currency: source.currency,
    exchangeRate: source.exchangeRate,
    description: source.description,
    refInvoiceId: source.id,
    totalAmount: 0,
    totalDiscount: 0,
    totalWeightMt: 0,
    createdAt: dayjs().toISOString(),
    items: newItems,
  };
  recomputeInvoiceTotals(draft);
  db.invoices.push(draft);
  recomputeAllRemaining();
  persistDb();
  return draft;
}

export async function markInvoiceSent(id: string): Promise<Invoice> {
  await delay(140);
  const invoice = findInvoiceOrThrow(id);
  invoice.sentAt = dayjs().toISOString();
  persistDb();
  return invoice;
}

export interface ApplyContainerToAllResult {
  invoice: Invoice;
  /** Number of lines the container was actually assigned to. */
  applied: number;
  /** Total lines on the invoice. */
  total: number;
}

/**
 * Sets `containerId` on every item of `invoiceId` whose good that container actually carries
 * — used by the convert-container step ("apply to all lines") so a freshly-converted draft can
 * carry a single container (spec §7). Carriage-checked (spec §5.2): every seeded container
 * carries exactly one good while many invoices span multiple goods, so an unconditional assign
 * mis-assigns by construction, and `confirmInvoice` never re-checks carriage. Returns
 * `applied`/`total` so the caller (ConvertContainerModal) can report coverage.
 */
export async function applyContainerToAll(
  invoiceId: string,
  containerId: string,
): Promise<ApplyContainerToAllResult> {
  await delay(160);
  const invoice = findInvoiceOrThrow(invoiceId);
  const container = db.containers.find((c) => c.id === containerId);
  const carriedItemIds = new Set(container?.goods.map((g) => g.contractItemId) ?? []);
  let applied = 0;
  for (const item of invoice.items) {
    if (carriedItemIds.has(item.contractItemId)) {
      item.containerId = containerId;
      applied++;
    }
  }
  persistDb();
  return { invoice, applied, total: invoice.items.length };
}

/* -------------------------- Warehouse mutations ------------------------ */

export interface WarehouseInput {
  name: string;
  code: string;
  location?: string;
}

export async function createWarehouse(input: WarehouseInput): Promise<Warehouse> {
  await delay(180);
  const code = input.code.trim().toUpperCase();
  const id = `wh-${code.toLowerCase()}`;
  if (db.warehouses.some((w) => w.id === id)) throw new Error('duplicate-code');
  const warehouse: Warehouse = {
    id,
    name: input.name.trim(),
    code,
    location: input.location?.trim() || undefined,
    active: true,
  };
  db.warehouses.push(warehouse);
  persistDb();
  return warehouse;
}

export async function updateWarehouse(id: string, input: WarehouseInput): Promise<Warehouse> {
  await delay(160);
  const warehouse = db.warehouses.find((w) => w.id === id);
  if (!warehouse) throw new Error(`Warehouse ${id} not found`);
  warehouse.name = input.name.trim(); // code immutable on edit
  warehouse.location = input.location?.trim() || undefined;
  persistDb();
  return warehouse;
}

export async function setWarehouseActive(id: string, active: boolean): Promise<Warehouse> {
  await delay(140);
  const warehouse = db.warehouses.find((w) => w.id === id);
  if (!warehouse) throw new Error(`Warehouse ${id} not found`);
  warehouse.active = active;
  persistDb();
  return warehouse;
}

/* -------------------------- Cost Centre CRUD --------------------------- *
 * Mirrors the Warehouse master exactly (spec §5): code trimmed+uppercased and immutable after
 * create, 'duplicate-code' guard, active/inactive toggle. Inactive centres are excluded from
 * pickers but retained on already-saved records that reference them (the picker filters
 * client-side; the id itself is never invalidated here).
 * ------------------------------------------------------------------ */

export interface CostCentreInput {
  name: string;
  code: string;
  description?: string;
}

function nextCostCentreId(): string {
  let max = 0;
  for (const cc of db.costCentres) {
    const match = /^cc-(\d+)$/.exec(cc.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `cc-${String(max + 1).padStart(4, '0')}`;
}

export async function getCostCentres(): Promise<CostCentre[]> {
  await delay(120);
  return [...db.costCentres];
}

export async function createCostCentre(input: CostCentreInput): Promise<CostCentre> {
  await delay(180);
  const code = input.code.trim().toUpperCase();
  if (db.costCentres.some((cc) => cc.code === code)) throw new Error('duplicate-code');
  const costCentre: CostCentre = {
    id: nextCostCentreId(),
    name: input.name.trim(),
    code,
    description: input.description?.trim() || undefined,
    active: true,
  };
  db.costCentres.push(costCentre);
  persistDb();
  return costCentre;
}

export async function updateCostCentre(id: string, input: CostCentreInput): Promise<CostCentre> {
  await delay(160);
  const costCentre = db.costCentres.find((cc) => cc.id === id);
  if (!costCentre) throw new Error(`Cost centre ${id} not found`);
  costCentre.name = input.name.trim(); // code immutable on edit
  costCentre.description = input.description?.trim() || undefined;
  persistDb();
  return costCentre;
}

export async function setCostCentreActive(id: string, active: boolean): Promise<CostCentre> {
  await delay(140);
  const costCentre = db.costCentres.find((cc) => cc.id === id);
  if (!costCentre) throw new Error(`Cost centre ${id} not found`);
  costCentre.active = active;
  persistDb();
  return costCentre;
}

/* ------------------------------ Goods CRUD ------------------------------ *
 * Master list of tradeable products (BaseInfo → Goods). Mirrors the cost-centre quintet above.
 *
 * Reference data, NOT a foreign key: `Item.product` remains a plain string, so nothing here can
 * orphan a contract line. Deactivating a good therefore only hides it from the suggestion list;
 * contracts, invoices and claims already holding that name are untouched — which is why there is
 * no delete, only `setGoodActive`.
 * ------------------------------------------------------------------------ */

export interface GoodInput {
  name: string;
  code: string;
  metalType: MetalType;
  form?: GoodForm;
  unit: GoodUnit;
  hsCode?: string;
  description?: string;
}

function nextGoodId(): string {
  let max = 0;
  for (const g of db.goods) {
    const match = /^good-(\d+)$/.exec(g.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `good-${String(max + 1).padStart(4, '0')}`;
}

export async function getGoods(): Promise<Good[]> {
  await delay(120);
  return [...db.goods];
}

/** Guards IN ORDER: `name-required` → `code-required` → `duplicate-code` → `duplicate-name`.
 *  Name is checked too, not just code: the whole point of this list is one spelling per
 *  product, and `Item.product` matches on the NAME, so two goods named the same defeat it. */
export async function createGood(input: GoodInput): Promise<Good> {
  await delay(180);
  const name = input.name.trim();
  if (!name) throw new Error('name-required');
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error('code-required');
  if (db.goods.some((g) => g.code === code)) throw new Error('duplicate-code');
  if (db.goods.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('duplicate-name');
  }
  const good: Good = {
    id: nextGoodId(),
    name,
    code,
    metalType: input.metalType,
    form: input.form,
    unit: input.unit,
    hsCode: input.hsCode?.trim() || undefined,
    description: input.description?.trim() || undefined,
    active: true,
  };
  db.goods.push(good);
  persistDb();
  return good;
}

/** Guards IN ORDER: not-found → `name-required` → `duplicate-name` (excluding itself).
 *  `code` is immutable after create, matching `updateCostCentre`/`updateChargeCategory`. */
export async function updateGood(id: string, input: GoodInput): Promise<Good> {
  await delay(160);
  const good = db.goods.find((g) => g.id === id);
  if (!good) throw new Error(`Good ${id} not found`);
  const name = input.name.trim();
  if (!name) throw new Error('name-required');
  if (db.goods.some((g) => g.id !== id && g.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('duplicate-name');
  }
  good.name = name;
  good.metalType = input.metalType;
  good.form = input.form;
  good.unit = input.unit;
  good.hsCode = input.hsCode?.trim() || undefined;
  good.description = input.description?.trim() || undefined;
  persistDb();
  return good;
}

export async function setGoodActive(id: string, active: boolean): Promise<Good> {
  await delay(140);
  const good = db.goods.find((g) => g.id === id);
  if (!good) throw new Error(`Good ${id} not found`);
  good.active = active;
  persistDb();
  return good;
}

/* ------------------------- Financial account CRUD ------------------------ *
 * Bank accounts and cash safes, one entity with a `type` discriminator (see `FinancialAccount`).
 * Money transfers and exchange revaluations will reference these by id.
 * ------------------------------------------------------------------------ */

export interface FinancialAccountInput {
  name: string;
  type: FinancialAccountType;
  currency: Currency;
  description?: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  address?: string;
}

function nextFinancialAccountId(): string {
  let max = 0;
  for (const a of db.financialAccounts) {
    const match = /^fa-(\d+)$/.exec(a.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `fa-${String(max + 1).padStart(4, '0')}`;
}

export async function getFinancialAccounts(type?: FinancialAccountType): Promise<FinancialAccount[]> {
  await delay(120);
  return db.financialAccounts.filter((a) => (type ? a.type === type : true));
}

/**
 * Shared by create and update. Guards IN ORDER: `name-required` → `duplicate-name` (within the
 * same type — a bank and a cash safe may legitimately share a name) → BANK only:
 * `account-number-required` → `iban-required` → `duplicate-account-number`.
 *
 * A cash safe's bank-only fields are STRIPPED rather than stored: leaving an IBAN behind after
 * someone fills the form, switches type and saves would put data on a record that can never
 * display it.
 */
function normalizeFinancialAccount(
  input: FinancialAccountInput,
  excludeId?: string,
): Omit<FinancialAccount, 'id' | 'active'> {
  const name = input.name.trim();
  if (!name) throw new Error('name-required');
  if (
    db.financialAccounts.some(
      (a) => a.id !== excludeId && a.type === input.type && a.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error('duplicate-name');
  }

  if (input.type !== 'BANK') {
    return { name, type: input.type, currency: input.currency, description: input.description?.trim() || undefined };
  }

  const accountNumber = input.accountNumber?.trim();
  if (!accountNumber) throw new Error('account-number-required');
  const iban = input.iban?.trim().toUpperCase();
  if (!iban) throw new Error('iban-required');
  if (
    db.financialAccounts.some(
      (a) => a.id !== excludeId && a.type === 'BANK' && a.accountNumber === accountNumber,
    )
  ) {
    throw new Error('duplicate-account-number');
  }
  return {
    name,
    type: 'BANK',
    currency: input.currency,
    description: input.description?.trim() || undefined,
    accountNumber,
    iban,
    swiftCode: input.swiftCode?.trim().toUpperCase() || undefined,
    address: input.address?.trim() || undefined,
  };
}

export async function createFinancialAccount(input: FinancialAccountInput): Promise<FinancialAccount> {
  await delay(180);
  const account: FinancialAccount = {
    id: nextFinancialAccountId(),
    ...normalizeFinancialAccount(input),
    active: true,
  };
  db.financialAccounts.push(account);
  persistDb();
  return account;
}

/**
 * `type` and `currency` are IMMUTABLE after create — both are silently ignored from the input
 * and re-read off the stored record. An account's currency defines what its balance means, so
 * changing it would silently reinterpret every transfer already booked against it.
 */
export async function updateFinancialAccount(
  id: string,
  input: FinancialAccountInput,
): Promise<FinancialAccount> {
  await delay(160);
  const account = db.financialAccounts.find((a) => a.id === id);
  if (!account) throw new Error(`Financial account ${id} not found`);
  const next = normalizeFinancialAccount(
    { ...input, type: account.type, currency: account.currency },
    id,
  );
  Object.assign(account, next);
  // A cash safe never has these, and `Object.assign` would leave stale values from an earlier
  // shape rather than clearing them.
  if (account.type !== 'BANK') {
    account.accountNumber = undefined;
    account.iban = undefined;
    account.swiftCode = undefined;
    account.address = undefined;
  }
  persistDb();
  return account;
}

export async function setFinancialAccountActive(id: string, active: boolean): Promise<FinancialAccount> {
  await delay(140);
  const account = db.financialAccounts.find((a) => a.id === id);
  if (!account) throw new Error(`Financial account ${id} not found`);
  account.active = active;
  persistDb();
  return account;
}

/* ------------------------ Charge Category CRUD -------------------------- *
 * Master data behind BaseInfo's Expense/Revenue category tabs (design spec §4). Mirrors the
 * Cost Centre CRUD immediately above almost exactly — same id/active/persist idioms — with one
 * deliberate difference: `duplicate-code` is scoped WITHIN a direction (spec §2), so the same
 * code may exist once under EXPENSE and once under REVENUE, since the two directions are
 * maintained as fully independent lists.
 * ------------------------------------------------------------------ */

export interface ChargeCategoryInput {
  name: string;
  code: string;
  direction: ChargeDirection;
  scope: ChargeScope;
  description?: string;
}

function nextChargeCategoryId(): string {
  let max = 0;
  for (const cc of db.chargeCategories) {
    const match = /^ccat-(\d+)$/.exec(cc.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `ccat-${String(max + 1).padStart(4, '0')}`;
}

export async function getChargeCategories(
  direction?: ChargeDirection,
  scope?: ChargeScope,
): Promise<ChargeCategory[]> {
  await delay(120);
  return db.chargeCategories.filter(
    (c) => (direction ? c.direction === direction : true) && (scope ? c.scope === scope : true),
  );
}

/** Guards IN ORDER (spec §4): `name-required` → `code-required` → `duplicate-code` (within the
 *  direction). The two required-checks are server-side on purpose — the modal marks both fields
 *  required, but every other master-data guard in this file validates independently of the form,
 *  and without them a blank code stores `code: ''` and the NEXT blank one reports `duplicate-code`
 *  ("this code is already in use") against an empty field. */
export async function createChargeCategory(input: ChargeCategoryInput): Promise<ChargeCategory> {
  await delay(180);
  const name = input.name.trim();
  if (!name) throw new Error('name-required');
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error('code-required');
  if (db.chargeCategories.some((c) => c.code === code && c.direction === input.direction)) {
    throw new Error('duplicate-code');
  }
  const category: ChargeCategory = {
    id: nextChargeCategoryId(),
    name,
    code,
    direction: input.direction,
    scope: input.scope,
    description: input.description?.trim() || undefined,
    active: true,
  };
  db.chargeCategories.push(category);
  persistDb();
  return category;
}

/** Guards IN ORDER (spec §4): not-found → `name-required` → `code-required`. `code` is immutable
 *  on edit and therefore ignored, but a blank one still rejects the whole payload rather than
 *  half-applying it — same reasoning as `createChargeCategory` above. */
export async function updateChargeCategory(id: string, input: ChargeCategoryInput): Promise<ChargeCategory> {
  await delay(160);
  const category = db.chargeCategories.find((c) => c.id === id);
  if (!category) throw new Error(`Charge category ${id} not found`);
  const name = input.name.trim();
  if (!name) throw new Error('name-required');
  if (!input.code.trim()) throw new Error('code-required');
  category.name = name; // code/direction/scope immutable on edit
  category.description = input.description?.trim() || undefined;
  persistDb();
  return category;
}

export async function setChargeCategoryActive(id: string, active: boolean): Promise<ChargeCategory> {
  await delay(140);
  const category = db.chargeCategories.find((c) => c.id === id);
  if (!category) throw new Error(`Charge category ${id} not found`);
  category.active = active;
  persistDb();
  return category;
}

/* ------------------------ Charge Documents (Expenses/Revenues) ---------------------- *
 * Booked expense/revenue documents against an invoice's goods, or general (no-invoice)
 * documents — see
 * docs/superpowers/specs/2026-07-27-expense-revenue-claim-rework-design.md §2 (shapes), §3
 * (split algorithm + money roll-up + re-split semantics), §4 (this API, guards IN ORDER).
 * Direction-parameterised: EXPENSE and REVENUE share this exact implementation (spec §5's
 * gate — if Revenue ever needs more than a thin UI wrapper around these functions, this file's
 * direction-parameterisation was wrong and Phase 4 needs fixing, not forking).
 * ------------------------------------------------------------------ */

export interface ChargeSourceInvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  invoiceDate: string;
  customerId: string;
  customerName: string;
  contractId: string;
  currency: Currency;
  totalAmount: number;
  totalWeightMt: number;
  itemCount: number;
}

/** Chain-leaf, CONFIRMED, priced documents — the ONLY universe a charge (expense or revenue
 *  document) may attach to (spec §4). Never use `getTradeInvoices`/`useTradeInvoices` for this:
 *  it returns DRAFT, CANCELLED and unpriced order documents unfiltered. (Renamed from the
 *  pre-rework `getExpenseSourceInvoices`, which this doc-comment's warning is carried over from
 *  verbatim; row widened with `contractId`/`currency`/`totalAmount`/`totalWeightMt`/`itemCount`
 *  so the picker can filter and show useful columns.)
 *
 *  `side` is OPTIONAL and defaults to BOTH sides: a charge document is side-agnostic. Only
 *  CLAIMS are side-restricted (spec §1's binding table; the user's requirements doc scopes the
 *  purchase/sale split to Supplier Claim / Customer Claim only, and defines an Invoice Expense as
 *  a cost related to "a purchase OR sale invoice"). Freight, insurance and handling are booked on
 *  sale invoices as readily as purchase ones. `createChargeDoc` has never had a side guard — it
 *  derives the side FROM the invoice — so restricting the picker was a UI-only invention.
 *  `getClaimSourceInvoices(side)` below is the side-restricted entry point. */
export async function getChargeSourceInvoices(side?: InvoiceSide): Promise<ChargeSourceInvoiceRow[]> {
  await delay(140);
  const sides: InvoiceSide[] = side ? [side] : ['PURCHASE', 'SALE'];
  return sides
    .flatMap((s) => chainLeafDocs(s))
    .filter((inv) => isPricedType(inv.invoiceType))
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      invoiceDate: inv.invoiceDate,
      customerId: inv.customerId,
      customerName: customerById.get(inv.customerId)?.name ?? '—',
      contractId: inv.contractId,
      currency: inv.currency,
      totalAmount: inv.totalAmount,
      totalWeightMt: inv.totalWeightMt,
      itemCount: inv.items.length,
    }))
    .sort((a, b) => dayjs(b.invoiceDate).valueOf() - dayjs(a.invoiceDate).valueOf());
}

export interface ChargeDocRow extends ChargeDoc {
  invoiceNumber?: string;
  customerName?: string;
  lineCount: number;
}

export interface ChargeDocDetail {
  doc: ChargeDoc;
  invoice?: Invoice;
  invoiceItems: InvoiceItem[];
  customerName?: string;
}

/** Includes CANCELLED docs (the UI strikes them through in Phase 4b) — date desc.
 *  `invoiceNumber`/`customerName` joined server-side (the `PaymentRow extends Payment` idiom
 *  above) so the list page doesn't rebuild its own id→label Maps. */
export async function getChargeDocs(
  direction: ChargeDirection,
  kind?: ChargeScope,
): Promise<ChargeDocRow[]> {
  await delay(160);
  return db.chargeDocs
    .filter((d) => d.direction === direction && (kind ? d.kind === kind : true))
    .map((d) => {
      const invoice = d.invoiceId ? findInvoice(d.invoiceId) : undefined;
      return {
        ...d,
        invoiceNumber: invoice?.invoiceNumber,
        customerName: invoice ? customerById.get(invoice.customerId)?.name : undefined,
        lineCount: d.lines.length,
      };
    })
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

/** `invoiceItems` come from the BOOKED invoice (`doc.invoiceId`), never the chain leaf — a
 *  charge's goods picker always shows the exact document it was created against, even after a
 *  later conversion moves the chain leaf elsewhere (spec §2's immutable-`invoiceId` decision). */
export async function getChargeDoc(id: string): Promise<ChargeDocDetail | null> {
  await delay(140);
  const doc = db.chargeDocs.find((d) => d.id === id);
  if (!doc) return null;
  const invoice = doc.invoiceId ? findInvoice(doc.invoiceId) : undefined;
  return {
    doc,
    invoice,
    invoiceItems: invoice ? invoice.items : [],
    customerName: invoice ? customerById.get(invoice.customerId)?.name : undefined,
  };
}

function nextChargeDocId(): string {
  let max = 0;
  for (const d of db.chargeDocs) {
    const match = /^chg-(\d+)$/.exec(d.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `chg-${String(max + 1).padStart(4, '0')}`;
}

/** Monotonic max-scanning counter (mirrors `nextInvoiceItemId`) — NOT length-derived, so a
 *  create/remove interleave across two docs can't mint a duplicate line id. */
let chargeLineSeq = db.chargeDocs.reduce(
  (max, doc) =>
    doc.lines.reduce((m, line) => {
      const match = /^chgline-(\d+)$/.exec(line.id);
      return match ? Math.max(m, Number(match[1])) : m;
    }, max),
  0,
);
function nextChargeLineId(): string {
  chargeLineSeq += 1;
  return `chgline-${chargeLineSeq}`;
}

/** Same idiom, one level deeper: allocations are inline on lines which are inline on docs. */
let chargeAllocationSeq = db.chargeDocs.reduce(
  (max, doc) =>
    doc.lines.reduce(
      (m, line) =>
        line.allocations.reduce((mm, alloc) => {
          const match = /^chgalloc-(\d+)$/.exec(alloc.id);
          return match ? Math.max(mm, Number(match[1])) : mm;
        }, m),
      max,
    ),
  0,
);
function nextChargeAllocationId(): string {
  chargeAllocationSeq += 1;
  return `chgalloc-${chargeAllocationSeq}`;
}

export interface ChargeDocInput {
  direction: ChargeDirection;
  kind: ChargeScope;
  title: string;
  invoiceId?: string;
  date: string;
  description?: string;
}

/**
 * Guards IN ORDER (spec §4): `title-required` → `date-required` → (kind==='INVOICE')
 * `invoice-required` → `invoice-not-found` → `invoice-not-confirmed` (must be `isPricedType`
 * AND a member of `chainLeafDocs(invoiceSide(inv.invoiceType))` — the `createInventoryDocument`
 * precedent). `invoiceId` is stripped server-side for GENERAL even if the client sent one —
 * kind and invoiceId travel together for the document's whole lifetime (spec §2).
 */
export async function createChargeDoc(input: ChargeDocInput): Promise<ChargeDoc> {
  await delay(200);
  const title = input.title.trim();
  if (!title) throw new Error('title-required');
  if (!input.date) throw new Error('date-required');

  let invoiceId: string | undefined;
  if (input.kind === 'INVOICE') {
    if (!input.invoiceId) throw new Error('invoice-required');
    const invoice = findInvoice(input.invoiceId);
    if (!invoice) throw new Error('invoice-not-found');
    const side = invoiceSide(invoice.invoiceType);
    const isChainLeafConfirmed =
      isPricedType(invoice.invoiceType) && chainLeafDocs(side).some((inv) => inv.id === invoice.id);
    if (!isChainLeafConfirmed) throw new Error('invoice-not-confirmed');
    invoiceId = invoice.id;
  }

  const doc: ChargeDoc = {
    id: nextChargeDocId(),
    direction: input.direction,
    kind: input.kind,
    title,
    invoiceId,
    date: input.date,
    description: input.description?.trim() || undefined,
    status: 'ACTIVE',
    createdAt: dayjs().toISOString(),
    lines: [],
    totalUSD: 0,
  };
  db.chargeDocs.push(doc);
  persistDb();
  return doc;
}

/**
 * Guards IN ORDER (spec §4): not-found → `doc-cancelled` → `title-required` → `date-required` →
 * `invoice-immutable` (`input.invoiceId !== doc.invoiceId`) → `kind-immutable` →
 * `direction-immutable`. Deliberately NO invoice re-validation — that is the whole point of the
 * immutable `invoiceId` (spec §2): editing a title after the booked provisional converts to a
 * final must never throw, unlike the old `validateAndNormalizeExpense` escape hatch it replaces.
 */
export async function updateChargeDoc(id: string, input: ChargeDocInput): Promise<ChargeDoc> {
  await delay(180);
  const doc = db.chargeDocs.find((d) => d.id === id);
  if (!doc) throw new Error(`Charge document ${id} not found`);
  if (doc.status === 'CANCELLED') throw new Error('doc-cancelled');
  const title = input.title.trim();
  if (!title) throw new Error('title-required');
  if (!input.date) throw new Error('date-required');
  if ((input.invoiceId ?? undefined) !== doc.invoiceId) throw new Error('invoice-immutable');
  if (input.kind !== doc.kind) throw new Error('kind-immutable');
  if (input.direction !== doc.direction) throw new Error('direction-immutable');

  doc.title = title;
  doc.date = input.date;
  doc.description = input.description?.trim() || undefined;
  persistDb();
  return doc;
}

/** Sets `status = 'CANCELLED'`. No hard delete (spec §4) — cancelled docs are excluded from
 *  every total/listing that matters via each reader's own filter, not by disappearing here. */
export async function cancelChargeDoc(id: string): Promise<ChargeDoc> {
  await delay(160);
  const doc = db.chargeDocs.find((d) => d.id === id);
  if (!doc) throw new Error(`Charge document ${id} not found`);
  if (doc.status === 'CANCELLED') return doc;
  doc.status = 'CANCELLED';
  persistDb();
  return doc;
}

/* -------------------------- Charge line recompute (spec §3) -------------------------- *
 * Three private helpers mirroring `recomputeItemAmount`/`recomputeInvoiceTotals` above.
 * "Convert at the leaf, roll up": every USD figure above an allocation is derived by SUMMING
 * already-converted USD children, never by converting a parent total once and splitting it —
 * that is what keeps `line.amountUSD === Σ allocation.amountUSD` and
 * `doc.totalUSD === Σ line.amountUSD` EXACT rather than off-by-a-cent from rounding twice.
 * Called at the end of every line mutation below; never exported, never callable from the
 * client.
 * ------------------------------------------------------------------ */

/** allocation.amountUSD = round(allocation.amount / line.fxRate) — the leaf conversion. */
function recomputeAllocationUSD(alloc: ChargeAllocation, line: ChargeLine): void {
  alloc.amountUSD = round(alloc.amount / line.fxRate);
}

/**
 * Rolls a line's allocations up into its totals, or converts `amount` directly for GENERAL
 * lines. Branches on `allocations.length` rather than taking a separate `kind` parameter:
 * GENERAL lines always carry `allocations: []`, INVOICE lines always carry ≥1 (the
 * `goods-required`/`last-allocation` guard below), so the array itself is the reliable signal.
 */
function recomputeLineTotals(line: ChargeLine): void {
  if (line.allocations.length > 0) {
    for (const alloc of line.allocations) recomputeAllocationUSD(alloc, line);
    line.amount = round(line.allocations.reduce((s, a) => s + a.amount, 0));
    line.amountUSD = round(line.allocations.reduce((s, a) => s + a.amountUSD, 0));
    line.quantityBasisMt = round3(line.allocations.reduce((s, a) => s + a.quantityMt, 0));
    line.unitPriceUSD = line.quantityBasisMt > 0 ? round(line.amountUSD / line.quantityBasisMt) : undefined;
  } else {
    line.amountUSD = round(line.amount / line.fxRate);
    line.quantityBasisMt = undefined;
    line.unitPriceUSD = undefined;
  }
}

/** doc.totalUSD = round(Σ lines[].amountUSD). */
function recomputeDocTotals(doc: ChargeDoc): void {
  doc.totalUSD = round(doc.lines.reduce((s, l) => s + l.amountUSD, 0));
}

export interface ChargeGoodInput {
  invoiceItemId: string;
  amount?: number;
}

export interface ChargeLineInput {
  categoryId: string;
  date: string;
  amount: number;
  currency: Currency;
  fxRate: number;
  /** Required — see the `person-required` guard. Optional in the TYPE only so a caller cannot
   *  be forced to invent one for a legacy line it is not changing. */
  personId?: string;
  costCentreId?: string;
  description?: string;
  /** INVOICE kind only; omitted → every item of the booked invoice (spec §4). */
  goods?: ChargeGoodInput[];
}

/**
 * Shared guard + build pipeline for `addChargeLine`/`updateChargeLine` (spec §4) — one atomic
 * mutation replaces the WHOLE allocation set rather than granular per-good calls, matching the
 * Phase 4b modal's UX and making two-pass validation trivial. This builds a brand-new
 * `ChargeLine` in a local variable and only ever throws before it is attached to `doc.lines` —
 * the two exported functions below attach it (push / index-replace) after this returns
 * successfully, which is what keeps a failed edit from leaving `doc.lines` half-mutated (the
 * `addInvoiceItems` atomicity idiom).
 *
 * `existing` is the line being replaced (undefined when creating) — consulted ONLY for the
 * `category-inactive` "only when the id changes" union idiom: an already-saved line pointing at
 * a category that has since been deactivated must survive an unrelated edit (e.g. just the
 * date), so the inactive check is skipped unless this call is actually switching categories.
 *
 * Guards IN ORDER: `category-required` → `category-not-found` → `category-inactive` (only when
 * the category id changes) → `category-mismatch` (`category.direction !== doc.direction ||
 * category.scope !== doc.kind`) → `date-required` → `invalid-amount` → `invalid-fx` (USD forces
 * fxRate = 1 server-side, skipping the check entirely) → `person-required` → `person-not-found`
 * → `cost-centre-not-found` (when supplied) → GENERAL: `goods-not-allowed` if goods supplied →
 * INVOICE PASS 1 (validate ALL
 * before building anything): resolve the goods set (supplied, else default = every item of the
 * booked invoice) → `goods-required` if empty (the `last-allocation` invariant: an INVOICE line
 * must keep ≥1 good, on create AND on update) → per good, in order: `good-not-on-invoice` →
 * `duplicate-good` (same `referenceDocumentItemId` twice) → `invalid-good-amount` (supplied and
 * < 0) → PASS 2: build allocations deriving `referenceDocumentItemId`/`product`/`quantityMt`
 * from the invoice line — NEVER the client (the `createInventoryDocument` precedent).
 */
function buildChargeLine(doc: ChargeDoc, input: ChargeLineInput, existing?: ChargeLine): ChargeLine {
  if (!input.categoryId) throw new Error('category-required');
  const category = db.chargeCategories.find((c) => c.id === input.categoryId);
  if (!category) throw new Error('category-not-found');
  const categoryChanged = !existing || existing.categoryId !== category.id;
  if (categoryChanged && !category.active) throw new Error('category-inactive');
  if (category.direction !== doc.direction || category.scope !== doc.kind) {
    throw new Error('category-mismatch');
  }
  if (!input.date) throw new Error('date-required');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('invalid-amount');

  const currency = input.currency;
  // USD FORCES fxRate = 1 server-side regardless of what the client sent — only a non-USD
  // line's fxRate is actually validated (spec §4).
  let fxRate = 1;
  if (currency !== 'USD') {
    if (!Number.isFinite(input.fxRate) || input.fxRate <= 0) throw new Error('invalid-fx');
    fxRate = input.fxRate;
  }

  // Person is REQUIRED on every charge line, expense and revenue alike. Applied to both rather
  // than expenses only: the two directions are one mirrored implementation, and "who was this
  // revenue from" is as meaningful as "who was this expense to" — a rule on one side only would
  // fork the module. Existence is checked, active is NOT: deactivating a person must not make
  // their historical lines unsaveable.
  if (!input.personId) throw new Error('person-required');
  if (!db.customers.some((c) => c.id === input.personId)) throw new Error('person-not-found');

  if (input.costCentreId && !db.costCentres.some((cc) => cc.id === input.costCentreId)) {
    throw new Error('cost-centre-not-found');
  }

  const lineId = existing?.id ?? nextChargeLineId();
  const line: ChargeLine = {
    id: lineId,
    docId: doc.id,
    categoryId: category.id,
    date: input.date,
    amount: round(input.amount),
    currency,
    fxRate,
    amountUSD: 0,
    personId: input.personId,
    costCentreId: input.costCentreId || undefined,
    description: input.description?.trim() || undefined,
    quantityBasisMt: undefined,
    unitPriceUSD: undefined,
    allocations: [],
  };

  if (doc.kind === 'GENERAL') {
    if (input.goods !== undefined) throw new Error('goods-not-allowed');
    recomputeLineTotals(line);
    return line;
  }

  // INVOICE kind: `doc.invoiceId` is guaranteed set here — validated at createChargeDoc and
  // immutable ever after (updateChargeDoc's whole point, spec §2) — guarded anyway rather than
  // trusting the invariant blindly.
  const invoice = doc.invoiceId ? findInvoice(doc.invoiceId) : undefined;
  if (!invoice) throw new Error(`Charge document ${doc.id} has no booked invoice`);

  // PASS 1 (addInvoiceItems atomicity idiom): resolve + validate the ENTIRE goods set before
  // building anything. Omitted goods → every item of the booked invoice (spec §4).
  const goodsInputs: ChargeGoodInput[] =
    input.goods !== undefined ? input.goods : invoice.items.map((it) => ({ invoiceItemId: it.id }));
  if (goodsInputs.length === 0) throw new Error('goods-required');

  const seenRef = new Set<string>();
  const resolved: Array<{ invoiceItem: InvoiceItem; amount?: number }> = [];
  for (const g of goodsInputs) {
    const invoiceItem = invoice.items.find((it) => it.id === g.invoiceItemId);
    if (!invoiceItem) throw new Error('good-not-on-invoice');
    if (seenRef.has(invoiceItem.referenceDocumentItemId)) throw new Error('duplicate-good');
    seenRef.add(invoiceItem.referenceDocumentItemId);
    // `Number.isFinite` FIRST, matching every sibling guard in this file (`invalid-amount`,
    // `invalid-fx`, `invalid-item-amount`): a bare `< 0` lets NaN/Infinity/"abc"/{} through, and
    // a non-finite per-good amount propagates through recomputeLineTotals → recomputeDocTotals
    // into `doc.totalUSD`, which `persistDb()` then serialises to JSON `null` — unrecoverable.
    if (g.amount !== undefined && (!Number.isFinite(g.amount) || g.amount < 0)) {
      throw new Error('invalid-good-amount');
    }
    resolved.push({ invoiceItem, amount: g.amount });
  }

  // PASS 2: every entry is now known-valid. An explicit amount on EVERY good is used as-is; a
  // missing amount on ANY good forces a full `splitEqually` across all of them, seeded from
  // `input.amount` — this mirrors the re-split table (spec §3): adding/removing a good re-splits
  // the WHOLE line, discarding any prior manual per-good edits, not just the touched row's.
  const allExplicit = resolved.every((r) => r.amount !== undefined);
  const amounts = allExplicit
    ? resolved.map((r) => round(r.amount!))
    : splitEqually(input.amount, resolved.length);

  line.allocations = resolved.map((r, i) => ({
    id: nextChargeAllocationId(),
    lineId,
    invoiceItemId: r.invoiceItem.id,
    // Derived from the invoice line, NEVER the client (createInventoryDocument precedent).
    referenceDocumentItemId: r.invoiceItem.referenceDocumentItemId,
    product: r.invoiceItem.product,
    quantityMt: r.invoiceItem.quantityMt,
    amount: amounts[i],
    amountUSD: 0,
  }));

  recomputeLineTotals(line);
  return line;
}

/** Guards IN ORDER: doc not-found → `doc-cancelled` → the `buildChargeLine` pipeline above.
 *  Recomputes doc totals and persists on success; a thrown guard never touches `doc.lines`. */
export async function addChargeLine(docId: string, input: ChargeLineInput): Promise<ChargeDoc> {
  await delay(200);
  const doc = db.chargeDocs.find((d) => d.id === docId);
  if (!doc) throw new Error(`Charge document ${docId} not found`);
  if (doc.status === 'CANCELLED') throw new Error('doc-cancelled');
  const line = buildChargeLine(doc, input);
  doc.lines.push(line);
  recomputeDocTotals(doc);
  persistDb();
  return doc;
}

/** Full replace of one line (incl. its whole allocation set) — see `buildChargeLine`'s header
 *  comment for why this is one atomic call rather than granular per-good mutations. */
export async function updateChargeLine(
  docId: string,
  lineId: string,
  input: ChargeLineInput,
): Promise<ChargeDoc> {
  await delay(200);
  const doc = db.chargeDocs.find((d) => d.id === docId);
  if (!doc) throw new Error(`Charge document ${docId} not found`);
  if (doc.status === 'CANCELLED') throw new Error('doc-cancelled');
  const index = doc.lines.findIndex((l) => l.id === lineId);
  if (index === -1) throw new Error(`Charge line ${lineId} not found`);
  const line = buildChargeLine(doc, input, doc.lines[index]);
  doc.lines[index] = line;
  recomputeDocTotals(doc);
  persistDb();
  return doc;
}

/** Hard remove — only headers soft-cancel (spec §4); a removed line has no independent
 *  lifecycle to preserve, unlike a cancelled doc which must stay visible (struck through). */
export async function removeChargeLine(docId: string, lineId: string): Promise<ChargeDoc> {
  await delay(180);
  const doc = db.chargeDocs.find((d) => d.id === docId);
  if (!doc) throw new Error(`Charge document ${docId} not found`);
  if (doc.status === 'CANCELLED') throw new Error('doc-cancelled');
  const exists = doc.lines.some((l) => l.id === lineId);
  if (!exists) throw new Error(`Charge line ${lineId} not found`);
  doc.lines = doc.lines.filter((l) => l.id !== lineId);
  recomputeDocTotals(doc);
  persistDb();
  return doc;
}

/* ------------------------------ Claims ---------------------------------- *
 * Per-item claims against one invoice's goods, typed as quantity or quality — see
 * docs/superpowers/specs/2026-07-27-expense-revenue-claim-rework-design.md §1 (claim sides:
 * expense-claim → PURCHASE invoices, revenue-claim → SALE), §2 (shapes, already declared in
 * types/index.ts), §4 (this API, guards IN ORDER). Deliberately its own flat `db.claims` table,
 * not folded into `chargeDocs` — a claim has exactly one line-shaped thing (its items), no
 * category/cost-centre, and its header amount is a pure read-only sum, so the doc/line/allocation
 * three-level shape above would be pointless indirection here.
 * ------------------------------------------------------------------ */

export interface ClaimItemInput {
  invoiceItemId: string;
  amount: number;
  description?: string;
}

export interface ClaimInput {
  side: ClaimSide;
  title: string;
  invoiceId: string;
  claimType: ClaimType;
  date: string;
  currency: Currency;
  fxRate: number;
  description?: string;
  items: ClaimItemInput[];
}

export interface ClaimRow extends Claim {
  invoiceNumber?: string;
  partyName?: string;
  itemCount: number;
}

export interface ClaimDetail {
  claim: Claim;
  invoice?: Invoice;
  invoiceItems: InvoiceItem[];
}

function nextClaimId(): string {
  let max = 0;
  for (const c of db.claims) {
    const match = /^clm-(\d+)$/.exec(c.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `clm-${String(max + 1).padStart(4, '0')}`;
}

/** Monotonic max-scanning counter (mirrors `nextChargeLineId`) — NOT length-derived. */
let claimItemSeq = db.claims.reduce(
  (max, c) =>
    c.items.reduce((m, it) => {
      const match = /^clmitem-(\d+)$/.exec(it.id);
      return match ? Math.max(m, Number(match[1])) : m;
    }, max),
  0,
);
function nextClaimItemId(): string {
  claimItemSeq += 1;
  return `clmitem-${claimItemSeq}`;
}

/** Thin wrapper (spec §4) — the claim picker's invoice universe is IDENTICAL to the charge-doc
 *  picker's. Since 2026-08-04 `ClaimSide` and `InvoiceSide` are the same two values with the
 *  same meaning, so this is an identity, not a mapping: a SALE claim offers sale invoices.
 *  The old `claimInvoiceSide` indirection (EXPENSE→PURCHASE) is deliberately gone — keeping a
 *  translation function around invites re-introducing the inversion it used to encode. */
export async function getClaimSourceInvoices(side: ClaimSide): Promise<ChargeSourceInvoiceRow[]> {
  return getChargeSourceInvoices(side);
}

/** Includes CANCELLED claims (the UI strikes them through) — date desc. `invoiceNumber`/
 *  `partyName` joined server-side (the `ChargeDocRow`/`PaymentRow` idiom above). */
export async function getClaims(side?: ClaimSide): Promise<ClaimRow[]> {
  await delay(160);
  return db.claims
    .filter((c) => (side ? c.side === side : true))
    .map((c) => {
      const invoice = findInvoice(c.invoiceId);
      return {
        ...c,
        invoiceNumber: invoice?.invoiceNumber,
        partyName: customerById.get(c.partyId)?.name,
        itemCount: c.items.length,
      };
    })
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

/**
 * Claims raised against one person — the person-detail Claims tab.
 *
 * Filters on `partyId`, which `buildClaim` derives from the claim's invoice rather than taking
 * from the client. So "claims for this person" and "claims on this person's invoices" are the
 * same set by construction, which is what the requirement asks for.
 */
export async function getClaimsByCustomer(customerId: string): Promise<ClaimRow[]> {
  await delay(160);
  return db.claims
    .filter((c) => c.partyId === customerId)
    .map((c) => {
      const invoice = findInvoice(c.invoiceId);
      return {
        ...c,
        invoiceNumber: invoice?.invoiceNumber,
        partyName: customerById.get(c.partyId)?.name,
        itemCount: c.items.length,
      };
    })
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

export async function getClaim(id: string): Promise<ClaimDetail | null> {
  await delay(140);
  const claim = db.claims.find((c) => c.id === id);
  if (!claim) return null;
  const invoice = findInvoice(claim.invoiceId);
  return { claim, invoice, invoiceItems: invoice ? invoice.items : [] };
}

/**
 * Shared guard + build pipeline for `createClaim`/`updateClaim`'s claim-type/FX/item half (spec
 * §4). Title/date validation and invoice resolution/validation are each CALLER's own
 * responsibility — they diverge (create validates the invoice fully; update never re-validates
 * it, the `updateChargeDoc` precedent) — so only the part both share lives here.
 *
 * Guards IN ORDER: `claim-type-required` (must be `QUANTITY` or `QUALITY`) → `invalid-fx` (USD
 * forces fxRate = 1 server-side, skipping the check entirely) → drop items whose `amount <= 0`
 * (client- AND server-side — a blank/zero row is simply not a claim, not an error) →
 * `no-claim-items` if none remain → PASS 1 (validate the WHOLE item set before building
 * anything, the `addInvoiceItems`/`buildChargeLine` atomicity idiom): `item-not-on-invoice` →
 * `invalid-item-amount` → `duplicate-item` (same `referenceDocumentItemId` twice) → PASS 2:
 * build items deriving `referenceDocumentItemId`/`product`/`quantityMt` from the invoice line —
 * NEVER the client (the `createInventoryDocument`/`buildChargeLine` precedent) — and
 * `amountUSD = round(amount / fxRate)` per item, leaf-converted like `recomputeAllocationUSD`.
 * `partyId = invoice.customerId` — SERVER-DERIVED, which is what deletes the old
 * `party-required`/`party-invoice-mismatch` codes entirely (spec §4). The header `amount`/
 * `amountUSD` are READ-ONLY sums of the items — never client-supplied.
 *
 * `existing` is present only on update, supplying `id`/`status`/`createdAt` to preserve rather
 * than mint/reset.
 */
function buildClaim(invoice: Invoice, input: ClaimInput, existing?: Claim): Claim {
  if (input.claimType !== 'QUANTITY' && input.claimType !== 'QUALITY') {
    throw new Error('claim-type-required');
  }

  const currency = input.currency;
  // USD FORCES fxRate = 1 server-side regardless of what the client sent (buildChargeLine
  // precedent) — only a non-USD claim's fxRate is actually validated.
  let fxRate = 1;
  if (currency !== 'USD') {
    if (!Number.isFinite(input.fxRate) || input.fxRate <= 0) throw new Error('invalid-fx');
    fxRate = input.fxRate;
  }

  const positiveItems = input.items.filter((it) => it.amount > 0);
  if (positiveItems.length === 0) throw new Error('no-claim-items');

  const seenRef = new Set<string>();
  const resolved: Array<{ invoiceItem: InvoiceItem; amount: number; description?: string }> = [];
  for (const it of positiveItems) {
    const invoiceItem = invoice.items.find((line) => line.id === it.invoiceItemId);
    if (!invoiceItem) throw new Error('item-not-on-invoice');
    if (!Number.isFinite(it.amount) || it.amount <= 0) throw new Error('invalid-item-amount');
    if (seenRef.has(invoiceItem.referenceDocumentItemId)) throw new Error('duplicate-item');
    seenRef.add(invoiceItem.referenceDocumentItemId);
    resolved.push({ invoiceItem, amount: it.amount, description: it.description?.trim() || undefined });
  }

  const claimId = existing?.id ?? nextClaimId();
  const items: ClaimItem[] = resolved.map((r) => ({
    id: nextClaimItemId(),
    claimId,
    invoiceItemId: r.invoiceItem.id,
    referenceDocumentItemId: r.invoiceItem.referenceDocumentItemId,
    product: r.invoiceItem.product,
    quantityMt: r.invoiceItem.quantityMt,
    amount: round(r.amount),
    amountUSD: round(r.amount / fxRate),
    description: r.description,
  }));

  return {
    id: claimId,
    side: input.side,
    title: input.title.trim(),
    invoiceId: invoice.id,
    partyId: invoice.customerId,
    claimType: input.claimType,
    date: input.date,
    currency,
    fxRate,
    amount: round(items.reduce((s, it) => s + it.amount, 0)),
    amountUSD: round(items.reduce((s, it) => s + it.amountUSD, 0)),
    description: input.description?.trim() || undefined,
    status: existing?.status ?? 'ACTIVE',
    createdAt: existing?.createdAt ?? dayjs().toISOString(),
    items,
  };
}

/**
 * Guards IN ORDER (spec §4): `title-required` → `date-required` → `invoice-required` →
 * `invoice-not-found` → `invoice-side-mismatch` (`invoiceSide(inv.invoiceType) !== input.side`,
 * a direct comparison now that the two unions carry the same meaning) → `invoice-not-confirmed`
 * (must be `isPricedType` AND a member of `chainLeafDocs` — the `createChargeDoc` precedent) →
 * then `buildClaim`'s claim-type/FX/item guards.
 */
export async function createClaim(input: ClaimInput): Promise<Claim> {
  await delay(200);
  const title = input.title.trim();
  if (!title) throw new Error('title-required');
  if (!input.date) throw new Error('date-required');
  if (!input.invoiceId) throw new Error('invoice-required');
  const invoice = findInvoice(input.invoiceId);
  if (!invoice) throw new Error('invoice-not-found');

  if (invoiceSide(invoice.invoiceType) !== input.side) throw new Error('invoice-side-mismatch');
  const isChainLeafConfirmed =
    isPricedType(invoice.invoiceType) &&
    chainLeafDocs(input.side).some((inv) => inv.id === invoice.id);
  if (!isChainLeafConfirmed) throw new Error('invoice-not-confirmed');

  const claim = buildClaim(invoice, input);
  db.claims.push(claim);
  persistDb();
  return claim;
}

/**
 * Guards IN ORDER (spec §4): not-found → `claim-cancelled` → `title-required` → `date-required`
 * → `invoice-immutable` (`input.invoiceId !== existing.invoiceId`) → `side-immutable` → then
 * `buildClaim`'s claim-type/FX/item guards. Deliberately SKIPS invoice-required/
 * invoice-not-found/invoice-side-mismatch/invoice-not-confirmed (the chain-leaf re-check)
 * ENTIRELY — the `updateChargeDoc` precedent (spec §2): editing a claim after its booked invoice
 * converts to a later document in the chain must never throw.
 */
export async function updateClaim(id: string, input: ClaimInput): Promise<Claim> {
  await delay(200);
  const index = db.claims.findIndex((c) => c.id === id);
  if (index === -1) throw new Error(`Claim ${id} not found`);
  const existing = db.claims[index];
  if (existing.status === 'CANCELLED') throw new Error('claim-cancelled');
  const title = input.title.trim();
  if (!title) throw new Error('title-required');
  if (!input.date) throw new Error('date-required');
  if (input.invoiceId !== existing.invoiceId) throw new Error('invoice-immutable');
  if (input.side !== existing.side) throw new Error('side-immutable');

  // Invoice is looked up fresh (never re-validated — see the guard comment above) purely to
  // source `invoice.items` for the item-validation pass; documents are never hard-deleted, so
  // this cannot fail in practice, but `findInvoiceOrThrow` fails loudly instead of silently
  // producing an empty items list if that invariant is ever broken.
  const invoice = findInvoiceOrThrow(existing.invoiceId);
  const claim = buildClaim(invoice, input, existing);
  db.claims[index] = claim;
  persistDb();
  return claim;
}

/** Sets `status = 'CANCELLED'`. No hard delete (`cancelChargeDoc` precedent, spec §4). */
export async function cancelClaim(id: string): Promise<Claim> {
  await delay(160);
  const claim = db.claims.find((c) => c.id === id);
  if (!claim) throw new Error(`Claim ${id} not found`);
  if (claim.status === 'CANCELLED') return claim;
  claim.status = 'CANCELLED';
  persistDb();
  return claim;
}

/* --------------------- Invoice charge reporting (spec §4) --------------------- *
 * Everything an invoice-detail page needs to show what has been booked against ITS CHAIN:
 * the expense documents, the revenue documents, the claims, their USD totals and a per-good
 * breakdown. Read-only aggregation — the create/edit affordances live on the charges and
 * claims modules themselves (spec §6, the `InvoiceChargesCard` design).
 * ------------------------------------------------------------------ */

export interface InvoiceChargeGoodRow {
  /** The chain-stable key (spec §2) — NOT `invoiceItemId`, which differs on every document of
   *  the chain and so would lose every allocation the moment a provisional converts. */
  referenceDocumentItemId: string;
  product: string;
  quantityMt: number;
  expenseUSD: number;
  revenueUSD: number;
  claimUSD: number;
  /** true when this good exists only on a charge/claim snapshot, not on the invoice being
   *  viewed — e.g. a line removed from the document after the charge was booked. Sorts last. */
  orphan: boolean;
}

export interface InvoiceChargeSummary {
  expenses: ChargeDocRow[];
  revenues: ChargeDocRow[];
  claims: Claim[];
  expenseUSD: number;
  revenueUSD: number;
  claimUSD: number;
  byGood: InvoiceChargeGoodRow[];
}

/**
 * Expense docs, revenue docs and claims booked ANYWHERE on `invoiceId`'s chain, with USD totals
 * and a per-good breakdown (spec §4). Returns `undefined` for an unknown id — the
 * `getTradeInvoice` precedent.
 *
 * CANCELLED charge documents and claims are excluded EVERYWHERE — from the lists, from the
 * totals and from `byGood` — matching how `ChargeListPage`/`ClaimsPage`'s tiles already treat
 * them (`rows.filter((r) => r.status !== 'CANCELLED')`).
 *
 * `byGood` is seeded from the VIEWED invoice's own items first, so goods with no charges still
 * appear (zeroed) and in document order; allocations/claim items are then folded in on
 * `referenceDocumentItemId`. Anything folded in whose key was not seeded is an `orphan` — it
 * only ever exists on a snapshot — and lands after the seeded rows by Map insertion order.
 *
 * Money is `amountUSD` only, `round`ed per total: the header figures come from the documents'
 * own server-derived `totalUSD`/`amountUSD`, the per-good figures from the leaf allocations, and
 * spec §3's convert-at-the-leaf-then-roll-up invariant (`doc.totalUSD === Σ line.amountUSD ===
 * Σ Σ allocation.amountUSD`, exact in cents) is what keeps the two sides equal rather than
 * off-by-a-cent.
 */
export async function getInvoiceChargeSummary(
  invoiceId: string,
): Promise<InvoiceChargeSummary | null> {
  await delay(180);
  const invoice = findInvoice(invoiceId);
  if (!invoice) return null;

  // Chain resolution, carried over VERBATIM from the pre-rework `getExpensesForInvoice`
  // (spec §4) — INCLUDING the `invoice.id` seed, which is NOT redundant: `invoiceChain` walks
  // down via `findSuccessor`, which skips CANCELLED documents, so a cancelled document is not a
  // member of its own chain and everything booked on it would silently vanish here without the
  // explicit seed. This is the most easily-broken line in the rework — do not "simplify" it.
  const chainIds = new Set([invoice.id, ...invoiceChain(invoice).map((c) => c.id)]);

  const toRow = (d: ChargeDoc): ChargeDocRow => {
    const bookedOn = d.invoiceId ? findInvoice(d.invoiceId) : undefined;
    return {
      ...d,
      invoiceNumber: bookedOn?.invoiceNumber,
      customerName: bookedOn ? customerById.get(bookedOn.customerId)?.name : undefined,
      lineCount: d.lines.length,
    };
  };

  const chainDocs = db.chargeDocs.filter(
    (d) => d.status !== 'CANCELLED' && !!d.invoiceId && chainIds.has(d.invoiceId),
  );
  const byDate = (a: { date: string }, b: { date: string }) =>
    dayjs(b.date).valueOf() - dayjs(a.date).valueOf();
  const expenses = chainDocs.filter((d) => d.direction === 'EXPENSE').map(toRow).sort(byDate);
  const revenues = chainDocs.filter((d) => d.direction === 'REVENUE').map(toRow).sort(byDate);
  const claims = db.claims
    .filter((c) => c.status !== 'CANCELLED' && chainIds.has(c.invoiceId))
    .sort(byDate);

  const byGoodMap = new Map<string, InvoiceChargeGoodRow>();
  // Seed pass: the viewed document's own goods, in its own line order, zeroed.
  for (const item of invoice.items) {
    if (byGoodMap.has(item.referenceDocumentItemId)) continue;
    byGoodMap.set(item.referenceDocumentItemId, {
      referenceDocumentItemId: item.referenceDocumentItemId,
      product: item.product,
      quantityMt: item.quantityMt,
      expenseUSD: 0,
      revenueUSD: 0,
      claimUSD: 0,
      orphan: false,
    });
  }
  // Fold pass: anything whose key wasn't seeded is an orphan, described by its own snapshot.
  const rowFor = (key: string, product: string, quantityMt: number): InvoiceChargeGoodRow => {
    const existing = byGoodMap.get(key);
    if (existing) return existing;
    const created: InvoiceChargeGoodRow = {
      referenceDocumentItemId: key,
      product,
      quantityMt,
      expenseUSD: 0,
      revenueUSD: 0,
      claimUSD: 0,
      orphan: true,
    };
    byGoodMap.set(key, created);
    return created;
  };
  for (const doc of chainDocs) {
    for (const line of doc.lines) {
      for (const alloc of line.allocations) {
        const row = rowFor(alloc.referenceDocumentItemId, alloc.product, alloc.quantityMt);
        if (doc.direction === 'EXPENSE') row.expenseUSD += alloc.amountUSD;
        else row.revenueUSD += alloc.amountUSD;
      }
    }
  }
  for (const claim of claims) {
    for (const item of claim.items) {
      const row = rowFor(item.referenceDocumentItemId, item.product, item.quantityMt);
      row.claimUSD += item.amountUSD;
    }
  }

  const byGood = [...byGoodMap.values()].map((r) => ({
    ...r,
    quantityMt: round3(r.quantityMt),
    expenseUSD: round(r.expenseUSD),
    revenueUSD: round(r.revenueUSD),
    claimUSD: round(r.claimUSD),
  }));

  return {
    expenses,
    revenues,
    claims,
    expenseUSD: round(expenses.reduce((s, d) => s + d.totalUSD, 0)),
    revenueUSD: round(revenues.reduce((s, d) => s + d.totalUSD, 0)),
    claimUSD: round(claims.reduce((s, c) => s + c.amountUSD, 0)),
    byGood,
  };
}

/* --------------------------- Payment mutations ------------------------- */

export interface PaymentInput {
  customerId: string;
  date: string;
  currency: Currency;
  amount: number;
  fxRate: number;
  method: Payment['method'];
  notes?: string;
  invoiceId?: string;
  /** Set by the header/items flow. Omitted by the legacy single-shot path, which stays
   *  CONFIRMED — see the note in `createPayment`. */
  type?: PaymentType;
}

/* ------------------- Money transfers + exchange revaluation ---------------- *
 * Two SEPARATE concepts (spec §1): a transfer moves money between company accounts; a
 * revaluation restates what a foreign-currency balance is worth. Neither requires an invoice,
 * contract or person, and a transfer can exist with no gain or loss attached at all.
 *
 * Rates throughout are "units of the currency per 1 USD", matching the rest of the app, and USD
 * is the base currency (spec §17).
 * -------------------------------------------------------------------------- */

/** Value of `amount` in the base currency. `rate` is units-per-USD, so USD passes through. */
function toBaseUSD(amount: number, currency: Currency, rate: number): number {
  return currency === 'USD' ? round(amount) : round(amount / rate);
}

function nextTransferId(): string {
  let max = 0;
  for (const tr of db.moneyTransfers) {
    const m = /^tr-(\d+)$/.exec(tr.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `tr-${String(max + 1).padStart(4, '0')}`;
}

let transferAllocSeq = 0;
let revalAllocSeq = 0;
function seedTransferChildCounters(): void {
  if (transferAllocSeq || revalAllocSeq) return;
  for (const tr of db.moneyTransfers) {
    for (const a of tr.allocations) {
      const m = /^tralloc-(\d+)$/.exec(a.id);
      if (m) transferAllocSeq = Math.max(transferAllocSeq, Number(m[1]));
    }
  }
  for (const rv of db.exchangeRevaluations) {
    for (const a of rv.allocations) {
      const m = /^revalloc-(\d+)$/.exec(a.id);
      if (m) revalAllocSeq = Math.max(revalAllocSeq, Number(m[1]));
    }
  }
}

/**
 * One movement of money into or out of a company account.
 *
 * Transfers and settled payments both produce these, so the balance, the book rate and the
 * revaluation allocations are all computed from ONE list. Without that, "what is in this
 * account" and "what produced the gain" would be two separate walks free to disagree.
 */
export interface AccountFeed {
  /** Signed, in the account's own currency. Positive is money in. */
  amount: number;
  /** Signed, in USD, at the rate the movement actually used. */
  baseUSD: number;
  source: 'TRANSFER' | 'PAYMENT';
  moneyTransferId?: string;
  /** Payment feeds carry these, which is what lets a gain trace back to a person (spec §13). */
  paymentId?: string;
  invoiceId?: string;
  invoiceItemId?: string;
}

/**
 * Every confirmed movement touching one account.
 *
 * TRANSFERS move money the moment they are confirmed.
 *
 * PAYMENTS move money per settlement line, and only when the line actually reached an account:
 *   • TT      — the line names the bank directly.
 *   • Cheque  — the account comes from the cheque, and ONLY once it is PAID. A pending cheque
 *               is a promise, not money in the bank.
 *   • Cash / Offset / Credit note — no account is named, so they touch no balance.
 *
 * DIRECTION is taken from the line's own invoice, not the payment header: a SALE invoice is
 * money coming in, a PURCHASE invoice is money going out. Per line, because one payment may
 * settle documents on either side.
 *
 * A line whose currency differs from the account's is SKIPPED rather than converted. Putting
 * dollars into a dirham account is a currency exchange, and this module keeps exchange as its
 * own concept — silently converting here at a rate nobody chose would produce a balance that
 * looks authoritative and is not. `unmatchedCurrencyCount` on the balance surfaces it.
 */
export function accountFeeds(accountId: string): { feeds: AccountFeed[]; skippedCurrency: number } {
  const account = db.financialAccounts.find((a) => a.id === accountId);
  const currency: Currency = account?.currency ?? 'USD';
  const feeds: AccountFeed[] = [];
  let skippedCurrency = 0;

  for (const tr of db.moneyTransfers) {
    if (tr.status !== 'CONFIRMED') continue;
    if (tr.fromAccountId === accountId) {
      feeds.push({ amount: -tr.fromAmount, baseUSD: -tr.baseAmount, source: 'TRANSFER', moneyTransferId: tr.id });
    }
    if (tr.toAccountId === accountId) {
      // The receiving side is worth exactly what the sending side gave up — that is what makes
      // the implied book rate come out as the transfer's own rate.
      feeds.push({ amount: tr.toAmount, baseUSD: tr.baseAmount, source: 'TRANSFER', moneyTransferId: tr.id });
    }
  }

  for (const p of db.payments) {
    if (!isSettled(p)) continue;
    for (const it of paymentItems(p)) {
      let target: string | undefined;
      if (it.method === 'TT') target = it.bankAccountId;
      else if (it.method === 'Cheque' && it.chequeId) {
        const cheque = db.cheques.find((c) => c.id === it.chequeId);
        if (cheque?.status === 'PAID') target = cheque.bankAccountId;
      }
      if (target !== accountId) continue;
      if (it.currency !== currency) {
        skippedCurrency += 1;
        continue;
      }
      const invoice = findInvoice(it.invoiceId);
      const sign = invoice && invoiceSide(invoice.invoiceType) === 'PURCHASE' ? -1 : 1;
      feeds.push({
        amount: sign * it.amount,
        baseUSD: sign * it.amountUSD,
        source: 'PAYMENT',
        paymentId: p.id,
        invoiceId: it.invoiceId,
        // Carried through when the line settles exactly one item, so the chain to a contract
        // and a person survives. Never guessed when several items share the line.
        invoiceItemId: it.allocations.length === 1 ? it.allocations[0].invoiceItemId : undefined,
      });
    }
  }

  return { feeds, skippedCurrency };
}

/**
 * An account's balance IN ITS OWN CURRENCY, and its carrying value in USD.
 *
 * Built from confirmed transfers and settled payment lines (see `accountFeeds`). `baseUSD`
 * additionally absorbs every confirmed revaluation's gain/loss, and that is the mechanism that
 * satisfies spec §16: after a revaluation books +3.33, the carrying value is 103.33, so the NEXT
 * revaluation measures from 103.33 rather than from the original 100 and cannot count the same
 * 3.33 twice.
 */
export interface AccountBalance {
  accountId: string;
  currency: Currency;
  /** In the account's own currency. */
  balance: number;
  /** What that balance is currently carried at, in USD. */
  baseUSD: number;
  /** balance / baseUSD — the rate the balance is currently on the books at. `undefined` when
   *  either side is zero, since no meaningful rate exists yet. */
  bookRate?: number;
  /** Settlement lines that named this account but were recorded in another currency, so they
   *  were left out. Surfaced rather than hidden — a silent omission looks like a wrong balance. */
  unmatchedCurrencyCount: number;
}

export function computeAccountBalance(accountId: string): AccountBalance {
  const account = db.financialAccounts.find((a) => a.id === accountId);
  const currency: Currency = account?.currency ?? 'USD';
  const { feeds, skippedCurrency } = accountFeeds(accountId);

  let balance = feeds.reduce((s, f) => s + f.amount, 0);
  let baseUSD = feeds.reduce((s, f) => s + f.baseUSD, 0);

  for (const rv of db.exchangeRevaluations) {
    if (rv.status !== 'CONFIRMED' || rv.accountId !== accountId) continue;
    baseUSD += rv.gainLossAmount;
  }
  balance = round(balance);
  baseUSD = round(baseUSD);
  const bookRate = balance !== 0 && baseUSD !== 0 ? round4(balance / baseUSD) : undefined;
  return { accountId, currency, balance, baseUSD, bookRate, unmatchedCurrencyCount: skippedCurrency };
}

/** 4dp, for rates. Money stays on `round`, quantities on `round3`. */
function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export interface MoneyTransferInput {
  date: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmount: number;
  /** Units of the destination currency per 1 unit of the source. 1 for same-currency. */
  exchangeRate: number;
  notes?: string;
  allocations?: Array<{ invoiceId?: string; invoiceItemId?: string; amount: number }>;
}

/**
 * Guards IN ORDER: `date-required` → `from-account-required` / `from-account-not-found` →
 * `to-account-required` / `to-account-not-found` → `same-account` → `account-inactive` →
 * `invalid-amount` → `invalid-rate` → per allocation `invalid-allocation-amount` →
 * `invoice-not-found` → `over-allocated` (allocations may not exceed the transfer).
 *
 * Allocations are entirely OPTIONAL and may cover part of the transfer — spec §12 requires the
 * unallocated remainder to stay valid, so there is deliberately no "must equal" check here.
 */
function buildTransfer(input: MoneyTransferInput, existing?: MoneyTransfer): MoneyTransfer {
  if (!input.date) throw new Error('date-required');
  if (!input.fromAccountId) throw new Error('from-account-required');
  const from = db.financialAccounts.find((a) => a.id === input.fromAccountId);
  if (!from) throw new Error('from-account-not-found');
  if (!input.toAccountId) throw new Error('to-account-required');
  const to = db.financialAccounts.find((a) => a.id === input.toAccountId);
  if (!to) throw new Error('to-account-not-found');
  if (from.id === to.id) throw new Error('same-account');
  if (!from.active || !to.active) throw new Error('account-inactive');
  if (!Number.isFinite(input.fromAmount) || input.fromAmount <= 0) throw new Error('invalid-amount');
  if (!Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0) throw new Error('invalid-rate');
  // Same currency can only ever be 1:1 — a rate here would silently create or destroy money.
  if (from.currency === to.currency && Math.abs(input.exchangeRate - 1) > 0.000001) {
    throw new Error('same-currency-rate');
  }

  const fromAmount = round(input.fromAmount);
  const toAmount = round(fromAmount * input.exchangeRate);
  // The sending side defines what left the company, so the base value is measured there. For a
  // USD source that is the amount itself; otherwise it converts at that account's book rate,
  // falling back to the transfer rate when the account has no history yet.
  const fromBook = computeAccountBalance(from.id).bookRate;
  const baseAmount =
    from.currency === 'USD'
      ? fromAmount
      : toBaseUSD(fromAmount, from.currency, fromBook ?? (to.currency === 'USD' ? input.exchangeRate : 1));

  seedTransferChildCounters();
  const id = existing?.id ?? nextTransferId();
  const allocations = (input.allocations ?? []).map((a) => {
    if (!Number.isFinite(a.amount) || a.amount <= 0) throw new Error('invalid-allocation-amount');
    if (a.invoiceId && !findInvoice(a.invoiceId)) throw new Error('invoice-not-found');
    transferAllocSeq += 1;
    return {
      id: `tralloc-${transferAllocSeq}`,
      transferId: id,
      invoiceId: a.invoiceId,
      invoiceItemId: a.invoiceItemId,
      amount: round(a.amount),
      currency: from.currency,
      baseAmount: toBaseUSD(a.amount, from.currency, fromBook ?? input.exchangeRate),
      baseCurrency: 'USD' as Currency,
    };
  });
  const allocTotal = round(allocations.reduce((s, a) => s + a.amount, 0));
  if (allocTotal > fromAmount + 0.005) throw new Error('over-allocated');

  return {
    id,
    number: existing?.number ?? `TR-${id.slice(3)}`,
    date: input.date,
    fromAccountId: from.id,
    toAccountId: to.id,
    fromCurrency: from.currency,
    toCurrency: to.currency,
    fromAmount,
    toAmount,
    exchangeRate: input.exchangeRate,
    baseAmount,
    status: existing?.status ?? 'DRAFT',
    notes: input.notes?.trim() || undefined,
    allocations,
  };
}

export async function createMoneyTransfer(input: MoneyTransferInput): Promise<MoneyTransfer> {
  await delay(200);
  const transfer = buildTransfer(input);
  db.moneyTransfers.push(transfer);
  persistDb();
  return transfer;
}

export async function updateMoneyTransfer(id: string, input: MoneyTransferInput): Promise<MoneyTransfer> {
  await delay(200);
  const idx = db.moneyTransfers.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error('transfer-not-found');
  const current = db.moneyTransfers[idx];
  if (current.status !== 'DRAFT') throw new Error('transfer-not-draft');
  db.moneyTransfers[idx] = buildTransfer(input, current);
  persistDb();
  return db.moneyTransfers[idx];
}

/** DRAFT → CONFIRMED → CANCELLED. Confirming is what actually moves the balance. */
export async function setTransferStatus(id: string, status: TransferStatus): Promise<MoneyTransfer> {
  await delay(160);
  const transfer = db.moneyTransfers.find((t) => t.id === id);
  if (!transfer) throw new Error('transfer-not-found');
  if (transfer.status === status) return transfer;
  if (transfer.status === 'CANCELLED') throw new Error('transfer-cancelled');
  // Cancelling a confirmed transfer that a revaluation has already measured would silently
  // rewrite the balance those gains were computed from.
  if (transfer.status === 'CONFIRMED' && status === 'CANCELLED') {
    const measured = db.exchangeRevaluations.some(
      (rv) =>
        rv.status === 'CONFIRMED' &&
        (rv.accountId === transfer.fromAccountId || rv.accountId === transfer.toAccountId),
    );
    if (measured) throw new Error('transfer-revalued');
  }
  transfer.status = status;
  persistDb();
  return transfer;
}

export interface MoneyTransferRow extends MoneyTransfer {
  fromAccountName: string;
  toAccountName: string;
  allocatedAmount: number;
  unallocatedAmount: number;
}

export async function getMoneyTransfers(status?: TransferStatus): Promise<MoneyTransferRow[]> {
  await delay(160);
  const nameOf = (id: string) => db.financialAccounts.find((a) => a.id === id)?.name ?? '—';
  return db.moneyTransfers
    .filter((t) => (status ? t.status === status : true))
    .map((t) => {
      const allocated = round(t.allocations.reduce((s, a) => s + a.amount, 0));
      return {
        ...t,
        fromAccountName: nameOf(t.fromAccountId),
        toAccountName: nameOf(t.toAccountId),
        allocatedAmount: allocated,
        unallocatedAmount: round(Math.max(t.fromAmount - allocated, 0)),
      };
    })
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

/* ----------------------------- Revaluation ----------------------------- */

/** A transfer's invoice, but only when it points at exactly one — with several, no single
 *  invoice can honestly be named as the source. */
function transferSingleInvoice(transferId: string): string | undefined {
  const tr = db.moneyTransfers.find((t) => t.id === transferId);
  return tr && tr.allocations.length === 1 ? tr.allocations[0].invoiceId : undefined;
}

function nextRevaluationId(): string {
  let max = 0;
  for (const rv of db.exchangeRevaluations) {
    const m = /^rev-(\d+)$/.exec(rv.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `rev-${String(max + 1).padStart(4, '0')}`;
}

export interface RevaluationPreview {
  accountId: string;
  accountName: string;
  currency: Currency;
  balance: number;
  oldExchangeRate?: number;
  oldBaseAmount: number;
  newExchangeRate: number;
  newBaseAmount: number;
  gainLossAmount: number;
  type: ExchangeGainLossType;
  /** Transfers that fed this account, so the confirm screen can show what is being revalued. */
  sourceTransferIds: string[];
  /** Payments that fed it. A balance may be built from either, or both. */
  sourcePaymentIds: string[];
  /** Settlement lines naming this account in another currency, left out of the balance. */
  unmatchedCurrencyCount: number;
}

/**
 * What a revaluation WOULD book, without writing anything — spec §19 wants the calculation
 * shown before confirming.
 *
 * `oldExchangeRate` comes from the account's current carrying value, NOT from the original
 * transfer, which is the whole of spec §16.
 */
export async function previewRevaluation(accountId: string, newRate: number): Promise<RevaluationPreview> {
  await delay(140);
  const account = db.financialAccounts.find((a) => a.id === accountId);
  if (!account) throw new Error('account-not-found');
  if (account.currency === 'USD') throw new Error('base-currency-account');
  if (!Number.isFinite(newRate) || newRate <= 0) throw new Error('invalid-rate');

  const { balance, baseUSD, bookRate, unmatchedCurrencyCount } = computeAccountBalance(accountId);
  if (balance <= 0) throw new Error('no-balance');

  const inflows = accountFeeds(accountId).feeds.filter((f) => f.baseUSD > 0);
  const newBaseAmount = round(balance / newRate);
  const gainLossAmount = round(newBaseAmount - baseUSD);
  return {
    accountId,
    accountName: account.name,
    currency: account.currency,
    balance,
    oldExchangeRate: bookRate,
    oldBaseAmount: baseUSD,
    newExchangeRate: newRate,
    newBaseAmount,
    gainLossAmount,
    type: gainLossAmount >= 0 ? 'GAIN' : 'LOSS',
    sourceTransferIds: [...new Set(inflows.map((f) => f.moneyTransferId).filter(Boolean) as string[])],
    sourcePaymentIds: [...new Set(inflows.map((f) => f.paymentId).filter(Boolean) as string[])],
    unmatchedCurrencyCount,
  };
}

export interface RevaluationInput {
  accountId: string;
  date: string;
  newExchangeRate: number;
  realization?: ExchangeRealization;
  notes?: string;
}

/**
 * Creates a DRAFT revaluation from the same figures `previewRevaluation` showed.
 *
 * Allocations are derived, not asked for: the gain is split across the money that fed this
 * account — confirmed transfers and settled payment lines alike — in proportion to what each
 * contributed. That is spec §11's "allocated proportionally", and it means traceability exists
 * without forcing the user to enter it. An account funded by nothing traceable simply gets no
 * allocations, which spec §9 requires to stay valid.
 */
export async function createRevaluation(input: RevaluationInput): Promise<ExchangeRevaluation> {
  await delay(220);
  const preview = await previewRevaluation(input.accountId, input.newExchangeRate);
  if (!input.date) throw new Error('date-required');

  seedTransferChildCounters();
  const id = nextRevaluationId();
  // Inflows only. What is held came from money that arrived; an outflow reduced the balance and
  // has no share of the gain sitting on what remains.
  const inflows = accountFeeds(input.accountId).feeds.filter((f) => f.baseUSD > 0);
  const feedTotal = round(inflows.reduce((s, f) => s + f.baseUSD, 0));

  const allocations = feedTotal > 0
    ? inflows.map((f) => {
        revalAllocSeq += 1;
        const share = f.baseUSD / feedTotal;
        const original = round(preview.oldBaseAmount * share);
        const revalued = round(preview.newBaseAmount * share);
        return {
          id: `revalloc-${revalAllocSeq}`,
          revaluationId: id,
          moneyTransferId: f.moneyTransferId,
          paymentId: f.paymentId,
          // References, never copies — spec §14 forbids duplicating source data into the
          // gain/loss record. A payment feed carries its invoice, which is what completes the
          // chain to a contract and a person (spec §13).
          invoiceId:
            f.invoiceId ??
            (f.moneyTransferId ? transferSingleInvoice(f.moneyTransferId) : undefined),
          invoiceItemId: f.invoiceItemId,
          originalBaseAmount: original,
          revaluedBaseAmount: revalued,
          gainLossAmount: round(revalued - original),
        };
      })
    : [];

  const revaluation: ExchangeRevaluation = {
    id,
    number: `REV-${id.slice(4)}`,
    date: input.date,
    accountId: input.accountId,
    currency: preview.currency,
    oldExchangeRate: preview.oldExchangeRate ?? preview.newExchangeRate,
    newExchangeRate: preview.newExchangeRate,
    balance: preview.balance,
    oldBaseAmount: preview.oldBaseAmount,
    newBaseAmount: preview.newBaseAmount,
    gainLossAmount: preview.gainLossAmount,
    type: preview.type,
    realization: input.realization ?? 'UNREALIZED',
    status: 'DRAFT',
    notes: input.notes?.trim() || undefined,
    allocations,
  };
  db.exchangeRevaluations.push(revaluation);
  persistDb();
  return revaluation;
}

export async function setRevaluationStatus(id: string, status: TransferStatus): Promise<ExchangeRevaluation> {
  await delay(160);
  const rv = db.exchangeRevaluations.find((r) => r.id === id);
  if (!rv) throw new Error('revaluation-not-found');
  if (rv.status === status) return rv;
  if (rv.status === 'CANCELLED') throw new Error('revaluation-cancelled');
  // A later revaluation measured from the carrying value THIS one produced. Undoing it now
  // would leave that one measuring from a book value that never existed.
  if (rv.status === 'CONFIRMED') {
    const laterConfirmed = db.exchangeRevaluations.some(
      (o) =>
        o.id !== rv.id &&
        o.accountId === rv.accountId &&
        o.status === 'CONFIRMED' &&
        dayjs(o.date).valueOf() >= dayjs(rv.date).valueOf(),
    );
    if (laterConfirmed) throw new Error('revaluation-superseded');
  }
  rv.status = status;
  persistDb();
  return rv;
}

export interface RevaluationRow extends ExchangeRevaluation {
  accountName: string;
}

export async function getRevaluations(status?: TransferStatus): Promise<RevaluationRow[]> {
  await delay(160);
  return db.exchangeRevaluations
    .filter((r) => (status ? r.status === status : true))
    .map((r) => ({
      ...r,
      accountName: db.financialAccounts.find((a) => a.id === r.accountId)?.name ?? '—',
    }))
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

/* ------------------------------ Reporting ------------------------------ */

export interface GainLossGroup {
  key: string;
  label: string;
  gain: number;
  loss: number;
  net: number;
}

export type GainLossGrouping = 'person' | 'contract' | 'invoice' | 'currency' | 'account';

/**
 * Gain/loss totalled by one dimension (spec §21). Walks the traceability chain
 * revaluation → allocation → invoice → contract → person, and drops anything that cannot
 * reach the requested dimension rather than inventing an "unknown" bucket — a standalone
 * cash-safe gain genuinely has no person, and showing it under one would be a lie.
 */
export async function getGainLossReport(grouping: GainLossGrouping): Promise<GainLossGroup[]> {
  await delay(200);
  const groups = new Map<string, GainLossGroup>();
  const add = (key: string, label: string, amount: number) => {
    const g = groups.get(key) ?? { key, label, gain: 0, loss: 0, net: 0 };
    if (amount >= 0) g.gain += amount;
    else g.loss += Math.abs(amount);
    g.net += amount;
    groups.set(key, g);
  };

  for (const rv of db.exchangeRevaluations) {
    if (rv.status !== 'CONFIRMED') continue;

    if (grouping === 'currency') {
      add(rv.currency, rv.currency, rv.gainLossAmount);
      continue;
    }
    if (grouping === 'account') {
      const acc = db.financialAccounts.find((a) => a.id === rv.accountId);
      add(rv.accountId, acc?.name ?? rv.accountId, rv.gainLossAmount);
      continue;
    }

    for (const alloc of rv.allocations) {
      const invoice = alloc.invoiceId ? findInvoice(alloc.invoiceId) : undefined;
      if (!invoice) continue;
      if (grouping === 'invoice') {
        add(invoice.id, invoice.invoiceNumber, alloc.gainLossAmount);
      } else if (grouping === 'contract') {
        add(invoice.contractId, invoice.contractId, alloc.gainLossAmount);
      } else {
        const person = customerById.get(invoice.customerId);
        add(invoice.customerId, person?.name ?? invoice.customerId, alloc.gainLossAmount);
      }
    }
  }

  return [...groups.values()]
    .map((g) => ({ ...g, gain: round(g.gain), loss: round(g.loss), net: round(g.net) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

/* -------------------------------- Cheques -------------------------------- *
 * A cheque is its own record because one may settle lines on several invoices — the spec's
 * "maybe use this cheque for other invoice". Payment lines point at it by id.
 * -------------------------------------------------------------------------- */

export interface ChequeInput {
  type: ChequeType;
  number: string;
  bankName: string;
  dueDate: string;
  amount: number;
  currency: Currency;
  ownerName: string;
  notes?: string;
}

function nextChequeId(): string {
  let max = 0;
  for (const c of db.cheques) {
    const match = /^chq-(\d+)$/.exec(c.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `chq-${String(max + 1).padStart(4, '0')}`;
}

/**
 * Every status is reachable from every other. This replaces a transition map in which PAID and
 * CHANGED were dead ends — which made a mistyped cheque unfixable forever, and left no way to
 * un-clear a cheque that was marked paid by accident.
 *
 * The rules that actually protect the money are enforced in `setChequeStatus`/`updateCheque`
 * instead, where they belong: entering PAID demands a live account, leaving PAID drops it, and
 * the record's data is editable only while PENDING. A cheque's status is a statement about the
 * real world, and the real world can be corrected.
 */
export const CHEQUE_STATUSES: ChequeStatus[] = ['PENDING', 'PAID', 'RETURNED', 'EXPIRED', 'CHANGED'];

/**
 * Cheque numbers are unique PER ISSUING BANK, not globally — two banks may legitimately issue
 * the same number. The one exception, straight from the spec: a RETURNED cheque's number may be
 * re-entered, because the customer replaces a bounced cheque with a fresh one bearing the same
 * number. Comparison is trimmed and case-insensitive on the bank so "ENBD" and "enbd " do not
 * create a second namespace.
 */
function assertChequeNumberFree(number: string, bankName: string, excludeId?: string): void {
  const n = number.trim().toLowerCase();
  const b = bankName.trim().toLowerCase();
  const clash = db.cheques.some(
    (c) =>
      c.id !== excludeId &&
      c.status !== 'RETURNED' &&
      c.number.trim().toLowerCase() === n &&
      c.bankName.trim().toLowerCase() === b,
  );
  if (clash) throw new Error('duplicate-cheque-number');
}

/** Guards IN ORDER: `number-required` → `bank-name-required` → `owner-required` →
 *  `due-date-required` → `invalid-amount` → `duplicate-cheque-number`. */
export async function createCheque(input: ChequeInput): Promise<Cheque> {
  await delay(180);
  const number = input.number.trim();
  if (!number) throw new Error('number-required');
  const bankName = input.bankName.trim();
  if (!bankName) throw new Error('bank-name-required');
  const ownerName = input.ownerName.trim();
  if (!ownerName) throw new Error('owner-required');
  if (!input.dueDate) throw new Error('due-date-required');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('invalid-amount');
  assertChequeNumberFree(number, bankName);

  const cheque: Cheque = {
    id: nextChequeId(),
    type: input.type,
    number,
    bankName,
    dueDate: input.dueDate,
    amount: round(input.amount),
    currency: input.currency,
    ownerName,
    status: 'PENDING',
    notes: input.notes?.trim() || undefined,
  };
  db.cheques.push(cheque);
  persistDb();
  return cheque;
}

/**
 * Editable ONLY while PENDING — `cheque-not-pending` otherwise.
 *
 * A cheque that has been cleared, bounced, expired or replaced is a historical fact, and its
 * amount is what the payment lines pointing at it are worth. To correct one, move it back to
 * PENDING first (which un-banks it, see `setChequeStatus`), edit, then mark it paid again. That
 * two-step is deliberate: it makes "I am changing a settled record" an explicit act rather than
 * a side effect of opening a form.
 */
export async function updateCheque(id: string, input: ChequeInput): Promise<Cheque> {
  await delay(160);
  const cheque = db.cheques.find((c) => c.id === id);
  if (!cheque) throw new Error('cheque-not-found');
  if (cheque.status !== 'PENDING') throw new Error('cheque-not-pending');
  const number = input.number.trim();
  if (!number) throw new Error('number-required');
  const bankName = input.bankName.trim();
  if (!bankName) throw new Error('bank-name-required');
  const ownerName = input.ownerName.trim();
  if (!ownerName) throw new Error('owner-required');
  if (!input.dueDate) throw new Error('due-date-required');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('invalid-amount');
  assertChequeNumberFree(number, bankName, id);

  Object.assign(cheque, {
    type: input.type,
    number,
    bankName,
    dueDate: input.dueDate,
    amount: round(input.amount),
    currency: input.currency,
    ownerName,
    notes: input.notes?.trim() || undefined,
  });
  persistDb();
  return cheque;
}

/**
 * Moves a cheque through its lifecycle. Any status may follow any other (see
 * `CHEQUE_STATUSES`); what is guarded is the money, not the graph.
 *
 * Guards IN ORDER: `cheque-not-found` → PAID only: `bank-account-required` →
 * `bank-account-not-found` → `bank-account-inactive`.
 *
 * Naming the receiving account when a cheque is marked paid is enforced here rather than left
 * to the UI, because PAID is the moment the money lands: it is the status that makes the cheque
 * count towards an account balance (`accountFeeds`) and towards a person's ledger.
 *
 * Leaving PAID CLEARS `bankAccountId`. Without that, an un-cleared cheque keeps reporting a
 * bank through `ChequeRow.bankAccountName`, and re-paying it into a different account would
 * silently keep the old one if the caller omitted the argument.
 */
export async function setChequeStatus(
  id: string,
  status: ChequeStatus,
  bankAccountId?: string,
): Promise<Cheque> {
  await delay(160);
  const cheque = db.cheques.find((c) => c.id === id);
  if (!cheque) throw new Error('cheque-not-found');
  if (cheque.status === status) return cheque;

  if (status === 'PAID') {
    if (!bankAccountId) throw new Error('bank-account-required');
    const account = db.financialAccounts.find((a) => a.id === bankAccountId);
    if (!account) throw new Error('bank-account-not-found');
    if (!account.active) throw new Error('bank-account-inactive');
    cheque.bankAccountId = bankAccountId;
  } else if (cheque.status === 'PAID') {
    cheque.bankAccountId = undefined;
  }
  cheque.status = status;
  persistDb();
  return cheque;
}

export interface ChequeRow extends Cheque {
  /** Company account it was banked into, resolved server-side. */
  bankAccountName?: string;
  /** How many payment lines rely on this cheque — a cheque may settle several invoices. */
  usageCount: number;
  /** True once `dueDate` has passed and it is still uncleared, so the tab can surface exactly
   *  the cheques the spec says need a bank chosen. */
  dueForAction: boolean;
}

export async function getCheques(status?: ChequeStatus): Promise<ChequeRow[]> {
  await delay(160);
  const today = dayjs();
  const usage = new Map<string, number>();
  for (const p of db.payments) {
    for (const it of paymentItems(p)) {
      if (it.chequeId) usage.set(it.chequeId, (usage.get(it.chequeId) ?? 0) + 1);
    }
  }
  return db.cheques
    .filter((c) => (status ? c.status === status : true))
    .map((c) => ({
      ...c,
      bankAccountName: c.bankAccountId
        ? db.financialAccounts.find((a) => a.id === c.bankAccountId)?.name
        : undefined,
      usageCount: usage.get(c.id) ?? 0,
      dueForAction: c.status === 'PENDING' && dayjs(c.dueDate).isBefore(today, 'day'),
    }))
    .sort((a, b) => dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf());
}

/* ------------------------- Payment header/items rework -------------------- *
 * Read every legacy-optional field through these three, never raw. A payment written before the
 * rework has no `status`, no `type` and no `items`; reading `p.status === 'CONFIRMED'` directly
 * would treat all of that real, banked money as unconfirmed and wipe it out of every balance,
 * KPI and aging bucket in the app. Same defaulting discipline as `direction ?? 'IN'`.
 * -------------------------------------------------------------------------- */

/** Legacy rows predate DRAFT, so they are CONFIRMED — they represent money already recorded. */
function paymentStatus(p: Payment): PaymentStatus {
  return p.status ?? 'CONFIRMED';
}

/** Legacy rows are INVOICE when they were linked to a document, GENERAL otherwise. */
function paymentType(p: Payment): PaymentType {
  return p.type ?? (p.invoiceId ? 'INVOICE' : 'GENERAL');
}

function paymentItems(p: Payment): PaymentItem[] {
  return p.items ?? [];
}

/** Only confirmed money moves a balance. The single predicate every aggregate must go through. */
function isSettled(p: Payment): boolean {
  return paymentStatus(p) === 'CONFIRMED';
}

function nextPaymentId(): string {
  let max = 0;
  for (const p of db.payments) {
    const match = /^NIZ(\d+)$/.exec(p.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `NIZ${String(max + 1).padStart(3, '0')}`;
}

let paymentItemSeq = 0;
let paymentAllocSeq = 0;

/** Max-scan seeded, like every other child counter — never length-derived, so deleting a line
 *  can never make the next one collide with a live id. */
function seedPaymentChildCounters(): void {
  if (paymentItemSeq || paymentAllocSeq) return;
  for (const p of db.payments) {
    for (const it of paymentItems(p)) {
      const m = /^payitem-(\d+)$/.exec(it.id);
      if (m) paymentItemSeq = Math.max(paymentItemSeq, Number(m[1]));
      for (const a of it.allocations) {
        const am = /^payalloc-(\d+)$/.exec(a.id);
        if (am) paymentAllocSeq = Math.max(paymentAllocSeq, Number(am[1]));
      }
    }
  }
}

function nextPaymentItemId(): string {
  seedPaymentChildCounters();
  paymentItemSeq += 1;
  return `payitem-${paymentItemSeq}`;
}

function nextPaymentAllocId(): string {
  seedPaymentChildCounters();
  paymentAllocSeq += 1;
  return `payalloc-${paymentAllocSeq}`;
}

/** header.amountUSD = round(Σ items[].amountUSD) once items exist — that sum is what every
 *  balance reads. A payment with no items keeps its own declared converted amount, which is
 *  what legacy rows and simple GENERAL payments rely on. */
function recomputePaymentTotals(p: Payment): void {
  const items = paymentItems(p);
  if (items.length === 0) return;
  p.amountUSD = round(items.reduce((s, it) => s + it.amountUSD, 0));
}

/**
 * What one invoice item still owes, in USD.
 *
 * Counts allocations from every payment EXCEPT the one being edited, and only from CONFIRMED
 * payments plus the draft being worked on — otherwise two open drafts could each be validated
 * against the full outstanding and together overpay the invoice.
 */
function invoiceItemRemainingUSD(invoiceItemId: string, excludePaymentId?: string): number {
  const item = db.invoices.flatMap((i) => i.items).find((it) => it.id === invoiceItemId);
  if (!item) return 0;
  let allocated = 0;
  for (const p of db.payments) {
    if (p.id === excludePaymentId) continue;
    if (!isSettled(p)) continue;
    for (const it of paymentItems(p)) {
      for (const a of it.allocations) {
        if (a.invoiceItemId === invoiceItemId) allocated += a.amountUSD;
      }
    }
  }
  return round(Math.max(item.amount - allocated, 0));
}

export interface PaymentItemInput {
  invoiceId: string;
  date: string;
  amount: number;
  currency: Currency;
  fxRate: number;
  method: PaymentMethod;
  bankAccountId?: string;
  chequeId?: string;
  /** Per invoice-item split. Omitted → auto-filled from the first item down, each taking what
   *  it still owes until the line's amount runs out (the spec's "start from item 1 to end"). */
  allocations?: Array<{ invoiceItemId: string; amount: number }>;
}

/**
 * Fills a line's amount across an invoice's items, first to last, each taking what it still
 * owes — the spec's "by default start from item 1 to end fill the amount for each row".
 * Returns USD amounts; the caller converts back to the line currency.
 */
function autoFillAllocations(
  invoice: Invoice,
  amountUSD: number,
  excludePaymentId?: string,
): Array<{ invoiceItemId: string; amountUSD: number }> {
  let left = round(amountUSD);
  const out: Array<{ invoiceItemId: string; amountUSD: number }> = [];
  for (const item of invoice.items) {
    if (left <= 0) break;
    const owed = invoiceItemRemainingUSD(item.id, excludePaymentId);
    if (owed <= 0) continue;
    const take = round(Math.min(owed, left));
    out.push({ invoiceItemId: item.id, amountUSD: take });
    left = round(left - take);
  }
  return out;
}

/**
 * Guards IN ORDER: `payment-not-found` → `payment-confirmed` (a confirmed payment is reopened
 * before editing) → `invoice-required` → `invoice-not-found` → `date-required` →
 * `invalid-amount` → `invalid-fx` (USD forces 1) → method: TT `bank-account-required` /
 * `bank-account-not-found` / `bank-account-inactive`; Cheque `cheque-required` /
 * `cheque-not-found` → then per allocation `item-not-on-invoice` → `invalid-allocation-amount`
 * → `over-allocated` (an item may not receive more than it still owes) → `allocation-mismatch`
 * (Σ allocations must equal the line amount).
 */
export async function addPaymentItem(paymentId: string, input: PaymentItemInput): Promise<Payment> {
  await delay(200);
  const payment = db.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error('payment-not-found');
  if (paymentStatus(payment) === 'CONFIRMED') throw new Error('payment-confirmed');

  const item = buildPaymentItem(payment, input);
  payment.items = [...paymentItems(payment), item];
  recomputePaymentTotals(payment);
  persistDb();
  return payment;
}

export async function updatePaymentItem(
  paymentId: string,
  itemId: string,
  input: PaymentItemInput,
): Promise<Payment> {
  await delay(200);
  const payment = db.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error('payment-not-found');
  if (paymentStatus(payment) === 'CONFIRMED') throw new Error('payment-confirmed');
  const idx = paymentItems(payment).findIndex((i) => i.id === itemId);
  if (idx < 0) throw new Error('payment-item-not-found');

  const rebuilt = buildPaymentItem(payment, input, paymentItems(payment)[idx]);
  const next = [...paymentItems(payment)];
  next[idx] = rebuilt;
  payment.items = next;
  recomputePaymentTotals(payment);
  persistDb();
  return payment;
}

export async function removePaymentItem(paymentId: string, itemId: string): Promise<Payment> {
  await delay(160);
  const payment = db.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error('payment-not-found');
  if (paymentStatus(payment) === 'CONFIRMED') throw new Error('payment-confirmed');
  payment.items = paymentItems(payment).filter((i) => i.id !== itemId);
  recomputePaymentTotals(payment);
  persistDb();
  return payment;
}

/**
 * Builds one payment line, validating everything BEFORE anything is attached — the
 * `buildChargeLine` atomicity idiom, so a rejected edit cannot leave `payment.items` half
 * mutated. `existing` is the line being replaced, so its own allocations are excluded from the
 * remaining-owed maths and editing a line does not fight itself.
 */
function buildPaymentItem(payment: Payment, input: PaymentItemInput, existing?: PaymentItem): PaymentItem {
  if (!input.invoiceId) throw new Error('invoice-required');
  const invoice = findInvoice(input.invoiceId);
  if (!invoice) throw new Error('invoice-not-found');
  if (!input.date) throw new Error('date-required');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('invalid-amount');

  let fxRate = 1;
  if (input.currency !== 'USD') {
    if (!Number.isFinite(input.fxRate) || input.fxRate <= 0) throw new Error('invalid-fx');
    fxRate = input.fxRate;
  }

  if (input.method === 'TT') {
    if (!input.bankAccountId) throw new Error('bank-account-required');
    const account = db.financialAccounts.find((a) => a.id === input.bankAccountId);
    if (!account) throw new Error('bank-account-not-found');
    if (!account.active) throw new Error('bank-account-inactive');
  }
  if (input.method === 'Cheque') {
    if (!input.chequeId) throw new Error('cheque-required');
    if (!db.cheques.some((c) => c.id === input.chequeId)) throw new Error('cheque-not-found');
  }

  const amount = round(input.amount);
  const amountUSD = round(amount / fxRate);
  const itemId = existing?.id ?? nextPaymentItemId();

  // Auto-fill when the caller sent nothing, else honour their split. `payment.id` is excluded
  // from the remaining-owed maths so this payment's own existing lines do not count against it.
  const requested =
    input.allocations ??
    autoFillAllocations(invoice, amountUSD, payment.id).map((a) => ({
      invoiceItemId: a.invoiceItemId,
      amount: round(a.amountUSD * fxRate),
    }));

  const invoiceItemIds = new Set(invoice.items.map((i) => i.id));
  const seen = new Set<string>();
  for (const a of requested) {
    if (!invoiceItemIds.has(a.invoiceItemId)) throw new Error('item-not-on-invoice');
    if (seen.has(a.invoiceItemId)) throw new Error('duplicate-allocation');
    seen.add(a.invoiceItemId);
    if (!Number.isFinite(a.amount) || a.amount <= 0) throw new Error('invalid-allocation-amount');
    // The spec's validation: a line may never pay an item more than it still owes. `existing`
    // is excluded via `payment.id` above so re-saving an unchanged line is not self-blocking.
    const owedUSD = invoiceItemRemainingUSD(a.invoiceItemId, payment.id);
    if (round(a.amount / fxRate) > owedUSD + 0.005) throw new Error('over-allocated');
  }
  if (requested.length === 0) throw new Error('allocations-required');
  const allocTotal = round(requested.reduce((s, a) => s + a.amount, 0));
  if (Math.abs(allocTotal - amount) > 0.005) throw new Error('allocation-mismatch');

  return {
    id: itemId,
    paymentId: payment.id,
    invoiceId: invoice.id,
    date: input.date,
    amount,
    currency: input.currency,
    fxRate,
    amountUSD,
    method: input.method,
    bankAccountId: input.method === 'TT' ? input.bankAccountId : undefined,
    chequeId: input.method === 'Cheque' ? input.chequeId : undefined,
    allocations: requested.map((a) => {
      const line = invoice.items.find((i) => i.id === a.invoiceItemId)!;
      return {
        id: nextPaymentAllocId(),
        paymentItemId: itemId,
        invoiceItemId: line.id,
        // Derived from the invoice, never the client — survives provisional→final conversion.
        referenceDocumentItemId: line.referenceDocumentItemId,
        product: line.product,
        amount: round(a.amount),
        amountUSD: round(a.amount / fxRate),
      };
    }),
  };
}

/** DRAFT ⇄ CONFIRMED. Confirming is reversible, which is the spec's "open payment". */
export async function setPaymentStatus(id: string, status: PaymentStatus): Promise<Payment> {
  await delay(160);
  const payment = db.payments.find((p) => p.id === id);
  if (!payment) throw new Error('payment-not-found');
  // Confirming an INVOICE payment with nothing allocated would move a balance by zero and read
  // as a real settlement in every report.
  if (status === 'CONFIRMED' && paymentType(payment) === 'INVOICE' && paymentItems(payment).length === 0) {
    throw new Error('no-payment-items');
  }
  payment.status = status;
  persistDb();
  return payment;
}

/**
 * Direction is `'OUT'` when the linked invoice is PURCHASE-side, `'IN'` otherwise
 * (SALE or unlinked). `reference` is set to the invoice number when linked (spec §7).
 */
export async function createPayment(input: PaymentInput): Promise<Payment> {
  await delay(180);
  // Guard the same unguarded `amount / fxRate` division the charge-line API closes (rework spec
  // §4) — an AED payment recorded with fxRate 0 (or NaN/negative) would otherwise silently
  // produce an Infinity/NaN amountUSD that then poisons every aggregate that sums payments.
  if (input.currency !== 'USD' && (!Number.isFinite(input.fxRate) || input.fxRate <= 0)) {
    throw new Error('invalid-fx');
  }
  const linkedInvoice = input.invoiceId ? findInvoice(input.invoiceId) : undefined;
  const direction: 'IN' | 'OUT' =
    linkedInvoice && invoiceSide(linkedInvoice.invoiceType) === 'PURCHASE' ? 'OUT' : 'IN';
  const amountUSD = input.currency === 'USD' ? input.amount : round(input.amount / input.fxRate);
  const payment: Payment = {
    id: nextPaymentId(),
    customerId: input.customerId,
    date: input.date,
    currency: input.currency,
    amount: input.amount,
    fxRate: input.fxRate,
    amountUSD,
    method: input.method,
    reference: linkedInvoice?.invoiceNumber,
    notes: input.notes ?? '',
    invoiceId: input.invoiceId,
    direction,
    // Headers created through the new flow start as a DRAFT with an explicit type. Callers that
    // omit `type` are the old single-shot path, which stays CONFIRMED so nothing that worked
    // before starts landing in a draft nobody looks at.
    type: input.type,
    status: input.type ? 'DRAFT' : undefined,
    items: input.type ? [] : undefined,
  };
  db.payments.push(payment);
  persistDb();
  return payment;
}

/** Header edits only. The amount stays the user-declared control total; `amountUSD` is left to
 *  `recomputePaymentTotals` whenever items exist. */
export async function updatePaymentHeader(id: string, input: PaymentHeaderInput): Promise<Payment> {
  await delay(180);
  const payment = db.payments.find((p) => p.id === id);
  if (!payment) throw new Error('payment-not-found');
  if (paymentStatus(payment) === 'CONFIRMED') throw new Error('payment-confirmed');
  if (!input.date) throw new Error('date-required');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('invalid-amount');
  if (!input.customerId || !db.customers.some((c) => c.id === input.customerId)) {
    throw new Error('person-not-found');
  }
  payment.customerId = input.customerId;
  payment.date = input.date;
  payment.amount = round(input.amount);
  payment.currency = input.currency;
  payment.notes = input.notes?.trim() ?? '';
  if (paymentItems(payment).length === 0) {
    payment.amountUSD = payment.currency === 'USD' ? payment.amount : round(payment.amount / payment.fxRate);
  }
  persistDb();
  return payment;
}

export interface PaymentHeaderInput {
  customerId: string;
  date: string;
  amount: number;
  currency: Currency;
  notes?: string;
}

export interface PaymentItemRow extends PaymentItem {
  invoiceNumber?: string;
  bankAccountName?: string;
  chequeNumber?: string;
  chequeStatus?: ChequeStatus;
}

export interface PaymentDetail {
  payment: Payment;
  customerName: string;
  type: PaymentType;
  status: PaymentStatus;
  items: PaymentItemRow[];
  /** Declared header amount minus what the items already allocate, in the header currency —
   *  what the item form offers as the next line's default. */
  unallocated: number;
}

export async function getPayment(id: string): Promise<PaymentDetail | null> {
  await delay(160);
  const payment = db.payments.find((p) => p.id === id);
  if (!payment) return null;
  const items = paymentItems(payment).map((it) => {
    const cheque = it.chequeId ? db.cheques.find((c) => c.id === it.chequeId) : undefined;
    return {
      ...it,
      invoiceNumber: findInvoice(it.invoiceId)?.invoiceNumber,
      bankAccountName: it.bankAccountId
        ? db.financialAccounts.find((a) => a.id === it.bankAccountId)?.name
        : undefined,
      chequeNumber: cheque?.number,
      chequeStatus: cheque?.status,
    };
  });
  const allocated = round(items.reduce((s, it) => s + it.amount, 0));
  return {
    payment,
    customerName: customerById.get(payment.customerId)?.name ?? '—',
    type: paymentType(payment),
    status: paymentStatus(payment),
    items,
    unallocated: round(Math.max(payment.amount - allocated, 0)),
  };
}
