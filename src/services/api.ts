import dayjs from 'dayjs';
import { db } from '@/mock/data';
import type {
  Container,
  Contract,
  CustomerAccount,
  DashboardKpis,
  Invoice,
  Payment,
  ProductVolume,
  StatusBreakdown,
  TimeSeriesPoint,
} from '@/types';
import { contractValue } from '@/utils/calc';

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms));

const customerById = new Map(db.customers.map((c) => [c.id, c]));
const contractById = new Map(db.contracts.map((c) => [c.id, c]));
const itemProduct = new Map(
  db.contracts.flatMap((c) => c.items.map((i) => [i.id, i.product] as const)),
);

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
export function buildInvoices(): Invoice[] {
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

export async function getInvoices(): Promise<Invoice[]> {
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
