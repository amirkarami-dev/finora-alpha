import dayjs from 'dayjs';
import { db, persistDb } from '@/mock/data';
import type {
  Container,
  ContainerStatus,
  Contract,
  ContractStatus,
  ContractType,
  Currency,
  Customer,
  CustomerAccount,
  CustomerType,
  DashboardKpis,
  Incoterm,
  Item,
  ItemPartner,
  ItemStatus,
  Partner,
  Payment,
  ProductVolume,
  ShipmentInvoice,
  StatusBreakdown,
  TimeSeriesPoint,
} from '@/types';
import { containerInvoice, contractValue, shippedMt } from '@/utils/calc';

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms));

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

function customerOfContract(contractId: string) {
  const contract = contractById.get(contractId);
  return contract ? customerById.get(contract.customerId) : undefined;
}

/* ----------------------------- Customers ---------------------------- */
export function computeAccounts(): CustomerAccount[] {
  return db.customers.map((customer) => {
    const contractIds = new Set(
      db.contracts.filter((c) => c.customerId === customer.id).map((c) => c.id),
    );
    const conts = db.containers.filter((c) => contractIds.has(c.contractId));
    const pays = db.payments.filter((p) => p.customerId === customer.id);

    const totalInvoiced = conts.reduce((s, c) => s + c.invoiceUSD, 0);
    const totalPaid = pays.reduce((s, p) => s + p.amountUSD, 0);
    const totalOutstanding = conts
      .filter((c) => c.status !== 'PAID')
      .reduce((s, c) => s + c.invoiceUSD, 0);
    const overdue = conts
      .filter((c) => c.status === 'OVERDUE')
      .reduce((s, c) => s + c.invoiceUSD, 0);
    const openContainers = conts.filter((c) => c.status !== 'PAID').length;

    return {
      ...customer,
      totalInvoiced: round(totalInvoiced),
      totalPaid: round(totalPaid),
      totalOutstanding: round(totalOutstanding),
      overdue: round(overdue),
      openContainers,
      contractCount: contractIds.size,
    };
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

export async function getAccounts(): Promise<CustomerAccount[]> {
  await delay();
  return computeAccounts().sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}

export async function getAccount(id: string): Promise<CustomerAccount | undefined> {
  await delay(160);
  return computeAccounts().find((a) => a.id === id);
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

export async function getContract(id: string): Promise<ContractRow | undefined> {
  await delay(160);
  return buildContractRows().find((c) => c.id === id);
}

export async function getContractsByCustomer(customerId: string): Promise<ContractRow[]> {
  await delay(160);
  return buildContractRows().filter((c) => c.customerId === customerId);
}

/* ----------------------------- Containers --------------------------- */
export interface ContainerRow extends Container {
  customerName: string;
  product: string;
}

export function buildContainerRows(): ContainerRow[] {
  return db.containers.map((c) => ({
    ...c,
    customerName: customerOfContract(c.contractId)?.name ?? '—',
    product: itemProduct.get(c.itemId) ?? '—',
  }));
}

export async function getContainers(): Promise<ContainerRow[]> {
  await delay();
  return buildContainerRows().sort(
    (a, b) => dayjs(b.shipmentDate).valueOf() - dayjs(a.shipmentDate).valueOf(),
  );
}

export async function getContainersByContract(contractId: string): Promise<ContainerRow[]> {
  await delay(140);
  return buildContainerRows().filter((c) => c.contractId === contractId);
}

/* ----------------------------- Invoices ----------------------------- */
export function buildInvoices(): ShipmentInvoice[] {
  return db.containers.map((c) => {
    const customer = customerOfContract(c.contractId);
    return {
      id: `INV-${c.reference}`,
      containerReference: c.reference,
      contractId: c.contractId,
      customerId: customer?.id ?? '',
      customerName: customer?.name ?? '—',
      product: itemProduct.get(c.itemId) ?? '—',
      quantityMt: c.quantityMt,
      amountUSD: c.invoiceUSD,
      issueDate: c.shipmentDate,
      dueDate: c.dueDate,
      status: c.status,
    };
  });
}

export async function getInvoices(): Promise<ShipmentInvoice[]> {
  await delay();
  return buildInvoices().sort((a, b) => dayjs(b.issueDate).valueOf() - dayjs(a.issueDate).valueOf());
}

/* ----------------------------- Payments ----------------------------- */
export interface PaymentRow extends Payment {
  customerName: string;
}

export async function getPayments(): Promise<PaymentRow[]> {
  await delay();
  return db.payments
    .map((p) => ({ ...p, customerName: customerById.get(p.customerId)?.name ?? '—' }))
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

export async function getPaymentsByCustomer(customerId: string): Promise<PaymentRow[]> {
  await delay(140);
  return db.payments
    .filter((p) => p.customerId === customerId)
    .map((p) => ({ ...p, customerName: customerById.get(p.customerId)?.name ?? '—' }))
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
  const openContainers = db.containers.filter((c) => c.status !== 'PAID').length;
  const totalVolumeMt = db.containers.reduce((s, c) => s + c.quantityMt, 0);
  const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

  return {
    totalOutstanding: round(totalOutstanding),
    overdue: round(overdue),
    totalPaid: round(totalPaid),
    totalInvoiced: round(totalInvoiced),
    activeContracts,
    openContainers,
    customers: db.customers.length,
    totalVolumeMt: round(totalVolumeMt),
    collectionRate: round(collectionRate),
  };
}

export async function getCashflowSeries(): Promise<TimeSeriesPoint[]> {
  await delay(180);
  const months: TimeSeriesPoint[] = [];
  const start = dayjs('2026-06-13').subtract(11, 'month').startOf('month');
  for (let i = 0; i < 12; i++) {
    const m = start.add(i, 'month');
    const key = m.format('YYYY-MM');
    const invoiced = db.containers
      .filter((c) => dayjs(c.shipmentDate).format('YYYY-MM') === key)
      .reduce((s, c) => s + c.invoiceUSD, 0);
    const collected = db.payments
      .filter((p) => dayjs(p.date).format('YYYY-MM') === key)
      .reduce((s, p) => s + p.amountUSD, 0);
    months.push({ month: m.format('MMM'), invoiced: round(invoiced), collected: round(collected) });
  }
  return months;
}

export async function getProductVolumes(): Promise<ProductVolume[]> {
  await delay(180);
  const map = new Map<string, ProductVolume>();
  for (const c of db.containers) {
    const product = itemProduct.get(c.itemId) ?? '—';
    const entry = map.get(product) ?? { product, volumeMt: 0, valueUSD: 0 };
    entry.volumeMt += c.quantityMt;
    entry.valueUSD += c.invoiceUSD;
    map.set(product, entry);
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

export async function getAgingBuckets(): Promise<AgingBucket[]> {
  await delay(160);
  const today = dayjs('2026-06-13');
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  for (const c of db.containers) {
    if (c.status === 'PAID') continue;
    const overdueDays = today.startOf('day').diff(dayjs(c.dueDate).startOf('day'), 'day');
    if (overdueDays <= 0) buckets.current += c.invoiceUSD;
    else if (overdueDays <= 30) buckets.d30 += c.invoiceUSD;
    else if (overdueDays <= 60) buckets.d60 += c.invoiceUSD;
    else if (overdueDays <= 90) buckets.d90 += c.invoiceUSD;
    else buckets.d90p += c.invoiceUSD;
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
  invoicedGrowthPct: number;
  collectedGrowthPct: number;
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
  const growth = (sel: (p: TimeSeriesPoint) => number) => {
    if (series.length < 2) return 0;
    const last = sel(series[series.length - 1]);
    const prev = sel(series[series.length - 2]);
    return prev > 0 ? round(((last - prev) / prev) * 100) : 0;
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

/** Distinct product names seen across the dataset — used to seed the goods form. */
export async function getProductNames(): Promise<string[]> {
  await delay(120);
  const names = new Set<string>();
  for (const contract of db.contracts) {
    for (const item of contract.items) if (item.product) names.add(item.product);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
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
  // Remaining respects MT already shipped on existing containers.
  const shipped = shippedMt(itemId, db.containers);
  target.remainingMt = Math.round(Math.max(input.quantityMt - shipped, 0) * 1000) / 1000;
  reindex();
  persistDb();
  return target;
}

/* ----------------------------- Containers (mutations) --------------- */

export interface ContainerInput {
  contractId: string;
  itemId: string;
  reference: string;
  quantityMt: number;
  lmePrice: number;
  premium: number;
  /** ISO date string. */
  shipmentDate: string;
  /** ISO date string. */
  arrivalDate?: string;
  /** ISO date string. */
  dueDate: string;
  status: ContainerStatus;
  blNumber?: string;
  bookingNumber?: string;
  sealNumber?: string;
}

function findItemById(itemId: string): Item | undefined {
  for (const contract of db.contracts) {
    const item = contract.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return undefined;
}

/** Recompute a parent item's remaining MT from the containers currently shipped against it. */
function recomputeItemRemaining(itemId: string): void {
  const item = findItemById(itemId);
  if (!item) return;
  const shipped = shippedMt(itemId, db.containers);
  item.remainingMt = Math.round(Math.max(item.quantityMt - shipped, 0) * 1000) / 1000;
}

function nextContainerId(contractId: string): string {
  const prefix = `cnt-${contractId}-`;
  let max = 0;
  for (const c of db.containers) {
    if (c.id.startsWith(prefix)) {
      const n = Number(c.id.slice(prefix.length));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `${prefix}${max + 1}`;
}

export async function createContainer(input: ContainerInput): Promise<ContainerRow> {
  await delay(180);
  const container: Container = {
    id: nextContainerId(input.contractId),
    contractId: input.contractId,
    itemId: input.itemId,
    reference: input.reference,
    quantityMt: input.quantityMt,
    lmePrice: input.lmePrice,
    premium: input.premium,
    shipmentDate: input.shipmentDate,
    arrivalDate: input.arrivalDate,
    dueDate: input.dueDate,
    invoiceUSD: round(
      containerInvoice({
        quantityMt: input.quantityMt,
        lmePrice: input.lmePrice,
        premium: input.premium,
      }),
    ),
    status: input.status,
    blNumber: input.blNumber,
    bookingNumber: input.bookingNumber,
    sealNumber: input.sealNumber,
  };
  db.containers.push(container);
  recomputeItemRemaining(input.itemId);
  reindex();
  persistDb();
  return buildContainerRows().find((c) => c.id === container.id)!;
}

export async function updateContainer(id: string, input: ContainerInput): Promise<ContainerRow> {
  await delay(180);
  const container = db.containers.find((c) => c.id === id);
  if (!container) throw new Error(`Container ${id} not found`);
  const previousItemId = container.itemId;
  container.contractId = input.contractId;
  container.itemId = input.itemId;
  container.reference = input.reference;
  container.quantityMt = input.quantityMt;
  container.lmePrice = input.lmePrice;
  container.premium = input.premium;
  container.shipmentDate = input.shipmentDate;
  container.arrivalDate = input.arrivalDate;
  container.dueDate = input.dueDate;
  container.invoiceUSD = round(
    containerInvoice({
      quantityMt: input.quantityMt,
      lmePrice: input.lmePrice,
      premium: input.premium,
    }),
  );
  container.status = input.status;
  container.blNumber = input.blNumber;
  container.bookingNumber = input.bookingNumber;
  container.sealNumber = input.sealNumber;
  // Moving a container between items frees the old item and draws down the new one.
  if (previousItemId !== input.itemId) recomputeItemRemaining(previousItemId);
  recomputeItemRemaining(input.itemId);
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
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  await delay(200);
  const code = input.code.trim().toUpperCase();
  const id = `cust-${code.toLowerCase()}`;
  if (db.customers.some((c) => c.id === id)) throw new Error('duplicate-code');
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
  reindex();
  persistDb();
  return customer;
}

export async function setCustomerActive(id: string, active: boolean): Promise<Customer> {
  await delay(160);
  const customer = db.customers.find((c) => c.id === id);
  if (!customer) throw new Error(`Customer ${id} not found`);
  customer.active = active;
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
  /** current-bucket / outstanding * 100 */
  onTimeSharePct: number;
  creditLimit: number;
  /** outstanding / creditLimit * 100 */
  creditUtilizationPct: number;
  availableCredit: number;
  aging: AgingBucket[];
  series: TimeSeriesPoint[];
  openInvoices: ShipmentInvoice[];
  recentPayments: PaymentRow[];
  contracts: ContractRow[];
}

export async function getCustomerPortalSummary(
  customerId: string,
): Promise<CustomerPortalSummary | undefined> {
  await delay(200);
  const account = computeAccounts().find((a) => a.id === customerId);
  if (!account) return undefined;

  const today = dayjs('2026-06-13');

  const myContracts = buildContractRows().filter((c) => c.customerId === customerId);
  const contractIds = new Set(myContracts.map((c) => c.id));

  const myInvoices = buildInvoices().filter((inv) => inv.customerId === customerId);
  const openInvoices = myInvoices
    .filter((inv) => inv.status !== 'PAID')
    .sort((a, b) => dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf());

  const recentPayments: PaymentRow[] = db.payments
    .filter((p) => p.customerId === customerId)
    .map((p) => ({ ...p, customerName: account.name }))
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  // Aging buckets over this customer's unpaid invoices.
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  for (const inv of openInvoices) {
    const overdueDays = today.startOf('day').diff(dayjs(inv.dueDate).startOf('day'), 'day');
    if (overdueDays <= 0) buckets.current += inv.amountUSD;
    else if (overdueDays <= 30) buckets.d30 += inv.amountUSD;
    else if (overdueDays <= 60) buckets.d60 += inv.amountUSD;
    else if (overdueDays <= 90) buckets.d90 += inv.amountUSD;
    else buckets.d90p += inv.amountUSD;
  }
  const aging: AgingBucket[] = [
    { bucket: 'current', value: round(buckets.current) },
    { bucket: 'days30', value: round(buckets.d30) },
    { bucket: 'days60', value: round(buckets.d60) },
    { bucket: 'days90', value: round(buckets.d90) },
    { bucket: 'days90plus', value: round(buckets.d90p) },
  ];

  // 12-month invoiced-vs-collected series, scoped to this customer.
  const myContainerIds = new Set(
    db.containers.filter((c) => contractIds.has(c.contractId)).map((c) => c.id),
  );
  const series: TimeSeriesPoint[] = [];
  const start = today.subtract(11, 'month').startOf('month');
  for (let i = 0; i < 12; i++) {
    const m = start.add(i, 'month');
    const key = m.format('YYYY-MM');
    const invoiced = db.containers
      .filter((c) => myContainerIds.has(c.id) && dayjs(c.shipmentDate).format('YYYY-MM') === key)
      .reduce((s, c) => s + c.invoiceUSD, 0);
    const collected = db.payments
      .filter((p) => p.customerId === customerId && dayjs(p.date).format('YYYY-MM') === key)
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
    onTimeSharePct: outstanding > 0 ? round((buckets.current / outstanding) * 100) : 100,
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
