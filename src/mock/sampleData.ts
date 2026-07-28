import dayjs, { type Dayjs } from 'dayjs';
import type {
  ChargeCategory,
  ChargeDirection,
  ChargeDoc,
  ChargeLine,
  ChargeScope,
  Claim,
  ClaimItem,
  ClaimSide,
  ClaimType,
  Container,
  ContainerStatus,
  Contract,
  ContractStatus,
  ContractType,
  CostCentre,
  Currency,
  Customer,
  CustomerType,
  Incoterm,
  InventoryDocument,
  Invoice,
  InvoiceItem,
  InvoiceType,
  Item,
  ItemPartner,
  Partner,
  Payment,
  Warehouse,
} from '@/types';
import { DEFAULT_FX_AED_PER_USD } from '@/config/constants';
import { invoiceItemAmount, invoiceItemUnitPrice, splitEqually, unitPrice } from '@/utils/calc';
import type { Db } from './data';

/**
 * The full deterministic demo dataset (spec §2.1), extracted from the app's original seed
 * generator and wired behind the "Load sample data" button (`SettingsPage.tsx`) instead of
 * running unconditionally at import time.
 *
 * Every date below is expressed RELATIVE to `anchor` (via the `rel()` helper) rather than as
 * an absolute literal — the original generator baked every date from a pinned
 * `TODAY = dayjs('2026-06-13')`, which rots over time: its last invoice/payment eventually
 * falls outside every rolling 12-month/aging window and every chart empties. Calling
 * `buildSampleData()` with no argument always re-centres the dataset on the real today.
 *
 * The PRNG and every mutable counter are local to `buildSampleData` (not module state), so
 * two calls with the same `anchor` produce byte-identical output, and calling it twice in a
 * row can never leak state from the first call into the second.
 */

/* ------------------------------------------------------------------ *
 * OLD (pre-schema-v3) container shape — the generation loop below still produces this
 * exact shape, in the exact same order, consuming the exact same `rnd()` draws it always
 * has (determinism anchor: `cust-am` creditLimit === 2,750,000 — unaffected by `anchor`,
 * since every date derived from it is a PRNG-independent, anchor-relative offset). A later,
 * zero-`rnd()` post-pass reshapes these into the new logistics `Container[]` and synthesizes
 * historical trade invoices from them (docs/superpowers/specs/2026-07-05-invoices-warehouse-
 * payments-design.md §3). Never persisted directly.
 * ------------------------------------------------------------------ */
interface RawContainerSeed {
  id: string;
  contractId: string;
  itemId: string;
  reference: string;
  quantityMt: number;
  lmePrice: number;
  premium: number;
  loadDate: string;
  arrivalDate?: string;
  dueDate: string;
  invoiceUSD: number;
  status: ContainerStatus;
  blNumber?: string;
  bookingNumber?: string;
  sealNumber?: string;
}

/* ------------------------------------------------------------------ *
 * Deterministic PRNG — reseeded fresh on every `buildSampleData()` call (see `rnd` below),
 * so the demo dataset is stable across reloads but never leaks state between calls.
 * ------------------------------------------------------------------ */
function mulberry32(seed: number) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * Reference catalogs
 * ------------------------------------------------------------------ */
interface ProductRef {
  name: string;
  metal: string;
  lme: number;
  lmePct: number;
}

const PRODUCTS: ProductRef[] = [
  { name: '98% Copper Ingots', metal: 'Copper', lme: 11685, lmePct: 94.76 },
  { name: 'Copper Cathode', metal: 'Copper', lme: 11820, lmePct: 100 },
  { name: 'Copper Scrap (Berry)', metal: 'Copper', lme: 11200, lmePct: 88 },
  { name: 'Copper Scrap (Birch/Cliff)', metal: 'Copper', lme: 11200, lmePct: 84 },
  { name: 'Aluminum Ingots', metal: 'Aluminum', lme: 2485, lmePct: 98 },
  { name: 'Aluminum Scrap (Tense)', metal: 'Aluminum', lme: 2420, lmePct: 86 },
  { name: 'Brass Ingots', metal: 'Brass', lme: 6250, lmePct: 92 },
  { name: 'Brass Honey Scrap', metal: 'Brass', lme: 6100, lmePct: 85 },
  { name: 'Zinc Ingots', metal: 'Zinc', lme: 2880, lmePct: 96 },
  { name: 'Lead Ingots', metal: 'Lead', lme: 2095, lmePct: 97 },
];

const DESTINATIONS = [
  'NINGBO',
  'SHANGHAI',
  'QINGDAO',
  'TIANJIN',
  'JEBEL ALI',
  'MUNDRA',
  'PORT KLANG',
  'BUSAN',
];

const INCOTERMS: Incoterm[] = ['FOB', 'CIF', 'CFR', 'CNF', 'EXW', 'DAP'];

const CONTAINER_PREFIXES = ['MSNU', 'DFSU', 'TGHU', 'CAIU', 'TCNU', 'BMOU', 'FCIU', 'GESU'];

const BL_PREFIXES = ['MAEU', 'MSCU', 'COSU', 'HLCU', 'ONEY'];
const SEAL_PREFIXES = ['SL', 'CN', 'ML'];

const PARTNER_SEEDS: Array<{ name: string; code: string }> = [
  { name: 'Crescent Capital Partners', code: 'CC' },
  { name: 'Gulf Metals JV', code: 'GM' },
  { name: 'Orion Commodities', code: 'OR' },
  { name: 'Meridian Trading Co', code: 'MT' },
  { name: 'Apex Resource Partners', code: 'AX' },
];

interface CustomerSeed {
  name: string;
  code: string;
  currency: Currency;
  country: string;
  contact: string;
  terms: number;
  contracts: number;
  type: CustomerType;
}

const CUSTOMER_SEEDS: CustomerSeed[] = [
  { name: 'Alco Metal Trading', code: 'AM', currency: 'AED', country: 'UAE', contact: 'Khalid Nasser', terms: 7, contracts: 4, type: 'BUYER' },
  { name: 'Million Gen Tr', code: 'MG', currency: 'AED', country: 'UAE', contact: 'Rashid Al Falasi', terms: 15, contracts: 5, type: 'BUYER' },
  { name: 'Al Jesr Scrap Metal Tr', code: 'AJ', currency: 'AED', country: 'UAE', contact: 'Yousef Karim', terms: 10, contracts: 3, type: 'SUPPLIER' },
  { name: 'Sun Metals Casting LLC', code: 'SM', currency: 'AED', country: 'UAE', contact: 'Imran Sheikh', terms: 30, contracts: 4, type: 'BOTH' },
  { name: 'Zurich Metal', code: 'ZM', currency: 'USD', country: 'Switzerland', contact: 'Lukas Meier', terms: 30, contracts: 3, type: 'BUYER' },
  { name: 'Transmetals Trading DMCC', code: 'TM', currency: 'USD', country: 'UAE', contact: 'Daniel Costa', terms: 21, contracts: 5, type: 'BOTH' },
  { name: 'Ningbo Goosen International', code: 'NG', currency: 'USD', country: 'China', contact: 'Wei Zhang', terms: 14, contracts: 6, type: 'BUYER' },
  { name: 'Shar International TL', code: 'SH', currency: 'USD', country: 'Turkey', contact: 'Emre Demir', terms: 21, contracts: 3, type: 'SUPPLIER' },
  { name: 'Abdul Rahman Lobnani', code: 'AR', currency: 'AED', country: 'Lebanon', contact: 'Abdul Rahman', terms: 7, contracts: 2, type: 'SUPPLIER' },
  { name: 'The Nile Metals', code: 'NM', currency: 'USD', country: 'Egypt', contact: 'Tarek Fouad', terms: 30, contracts: 3, type: 'BUYER' },
  { name: 'Quick Sea Freight', code: 'QS', currency: 'USD', country: 'India', contact: 'Anil Mehta', terms: 14, contracts: 2, type: 'BOTH' },
  { name: 'Advanced Cargo & Shipping', code: 'AC', currency: 'USD', country: 'India', contact: 'Vikram Rao', terms: 14, contracts: 2, type: 'BUYER' },
  { name: 'Goldline Recyclers FZE', code: 'GL', currency: 'AED', country: 'UAE', contact: 'Sara Haddad', terms: 30, contracts: 3, type: 'SUPPLIER' },
  { name: 'Eurasia Metals GmbH', code: 'EM', currency: 'USD', country: 'Germany', contact: 'Hannah Vogel', terms: 45, contracts: 3, type: 'BOTH' },
];

/**
 * Historical shipment-invoice value: `lmePrice` already net of % in the workbook + premium.
 * Used only by this seed generator — containers themselves carry no money since the
 * schema-v3 logistics reshape (docs/superpowers/specs/2026-07-05-invoices-warehouse-payments-
 * design.md §2/§3). Moved here from `utils/calc.ts` (spec §2.1) — it lost its only caller.
 */
function containerInvoice(
  container: { quantityMt: number; lmePrice: number; premium: number },
): number {
  return (container.lmePrice + container.premium) * container.quantityMt;
}

/**
 * Builds the full deterministic demo dataset, re-centred on `anchor` (defaults to "now").
 * Every date is derived relative to `anchor` via `rel()`, so the dataset always sits inside
 * every rolling 12-month/aging window on the day it's generated — no matter how much later
 * "Load sample data" is pressed. Sets `portalAccount: true` on `cust-am` in a zero-`rnd()`
 * post-pass so the seeded Customer-role demo login (`roles.ts`) has somewhere to resolve to.
 */
export function buildSampleData(anchor: Dayjs = dayjs()): Db {
  // The generator's original literals were all baked from this pinned date — `rel()`
  // re-expresses each one as an offset from `anchor` instead of hand-computing day counts.
  const SEED_TODAY = dayjs('2026-06-13');
  const rel = (iso: string): Dayjs => anchor.add(dayjs(iso).diff(SEED_TODAY, 'day'), 'day');

  const rnd = mulberry32(20260613);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const between = (min: number, max: number) => min + rnd() * (max - min);
  const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
  const round = (n: number, d = 2) => {
    const f = 10 ** d;
    return Math.round(n * f) / f;
  };

  const partners: Partner[] = PARTNER_SEEDS.map((p) => ({
    id: `ptnr-${p.code.toLowerCase()}`,
    name: p.name,
    code: p.code,
    active: true,
  }));

  /* ------------------------------------------------------------------ *
   * Generation
   * ------------------------------------------------------------------ */
  const customers: Customer[] = [];
  const contracts: Contract[] = [];
  const rawContainers: RawContainerSeed[] = [];
  const payments: Payment[] = [];

  function makeContainerRef(): string {
    return `${pick(CONTAINER_PREFIXES)}${intBetween(1000000, 9999999)}`;
  }

  /** Deterministic shipping-doc numbers derived from the container reference (no PRNG impact). */
  function docNumbersFor(reference: string) {
    let h = 0;
    for (let i = 0; i < reference.length; i++) h = (h * 31 + reference.charCodeAt(i)) >>> 0;
    return {
      blNumber: `${BL_PREFIXES[h % BL_PREFIXES.length]}${100000000 + (h % 900000000)}`,
      bookingNumber: `BK${10000000 + (h % 90000000)}`,
      sealNumber: `${SEAL_PREFIXES[(h >> 3) % SEAL_PREFIXES.length]}${1000000 + (h % 9000000)}`,
    };
  }

  function contractStatusFromItems(items: Item[]): ContractStatus {
    if (items.every((i) => i.remainingMt <= 0.001)) return 'CLOSED';
    if (items.some((i) => i.status === 'ON HOLD')) return 'ON HOLD';
    if (items.every((i) => i.status === 'CANCELLED')) return 'CANCELLED';
    return 'ACTIVE';
  }

  CUSTOMER_SEEDS.forEach((seed, ci) => {
    const customer: Customer = {
      id: `cust-${seed.code.toLowerCase()}`,
      name: seed.name,
      code: seed.code,
      defaultCurrency: seed.currency,
      contactName: seed.contact,
      email: `${seed.code.toLowerCase()}@${seed.name.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
      phone: `+971 5${intBetween(0, 9)} ${intBetween(100, 999)} ${intBetween(1000, 9999)}`,
      country: seed.country,
      paymentTermsDays: seed.terms,
      creditLimit: 0,
      customerType: seed.type,
      active: true,
      createdAt: anchor.subtract(intBetween(120, 900), 'day').toISOString(),
    };
    customers.push(customer);

    for (let k = 0; k < seed.contracts; k++) {
      const contractType: ContractType =
        seed.type === 'BUYER'
          ? 'SELL'
          : seed.type === 'SUPPLIER'
            ? 'PURCHASE'
            : k % 2 === 0
              ? 'SELL'
              : 'PURCHASE';
      const contractDate = anchor.subtract(intBetween(5, 420), 'day');
      const contractId = `${seed.code}-P-${contractDate.format('YYMMDD')}${intBetween(100, 999)}`;
      const destination = pick(DESTINATIONS);
      const itemCount = intBetween(1, 4);
      const items: Item[] = [];

      for (let it = 0; it < itemCount; it++) {
        const product = pick(PRODUCTS);
        const quantityMt = round(between(40, 320), 0);
        const lmeFixed = rnd() > 0.25;
        const fixedLmePrice = round(product.lme * between(0.96, 1.05), 0);
        const premium = round(between(0, 240), 0);
        const item: Item = {
          id: `${contractId}-I${it + 1}`,
          contractId,
          product: product.name,
          quantityMt,
          lmePercent: round(product.lmePct + between(-1.5, 1.5), 2),
          lmeFixed,
          fixedLmePrice,
          premium,
          incoterm: pick(INCOTERMS),
          status: 'ACTIVE',
          notes: '',
          remainingMt: quantityMt,
          partners: [],
        };
        items.push(item);
      }

      const contract: Contract = {
        id: contractId,
        customerId: customer.id,
        contractType,
        date: contractDate.toISOString(),
        destination,
        status: 'ACTIVE',
        notes: '',
        items,
      };

      // Ship a portion of each item across 0–3 containers.
      // Counter spans all of a contract's items so every container id is unique.
      let containerSeq = 0;
      items.forEach((item) => {
        const price = unitPrice(item);
        const shipments = intBetween(0, 3);
        let shippedSoFar = 0;
        for (let s = 0; s < shipments; s++) {
          const maxRemaining = item.quantityMt - shippedSoFar;
          if (maxRemaining < 1) break;
          const qty =
            s === shipments - 1 && rnd() > 0.4
              ? round(maxRemaining, 3)
              : round(Math.min(maxRemaining, between(20, 30)), 3);
          if (qty < 0.5) break;
          shippedSoFar += qty;

          // Clamp to `anchor` (spec C0 fix): a recent contract date + up to 60 days can spill
          // PAST anchor, pushing this shipment's invoice date into the NEXT calendar month —
          // which sits outside every rolling 12-month window while the CURRENT month goes
          // empty (observed: current month $0, next month non-zero, both against `anchor`).
          // Deriving arrival/due from the clamped value (not the raw one) keeps them consistent.
          const rawLoadDate = dayjs(contract.date).add(intBetween(5, 60), 'day');
          const loadDate = rawLoadDate.isAfter(anchor) ? anchor : rawLoadDate;
          const arrival = loadDate.add(intBetween(10, 35), 'day');
          const due = arrival.add(customer.paymentTermsDays, 'day');
          const invoice = round(containerInvoice({ quantityMt: qty, lmePrice: price, premium: 0 }), 2);

          let status: ContainerStatus;
          const paidRoll = rnd();
          if (due.isBefore(anchor)) {
            status = paidRoll > 0.22 ? 'PAID' : 'OVERDUE';
          } else {
            status = paidRoll > 0.7 ? 'PAID' : 'OPEN';
          }

          const reference = makeContainerRef();
          const container: RawContainerSeed = {
            id: `cnt-${contractId}-${++containerSeq}`,
            contractId,
            itemId: item.id,
            reference,
            quantityMt: qty,
            lmePrice: round(price, 2),
            premium: 0,
            loadDate: loadDate.toISOString(),
            arrivalDate: arrival.toISOString(),
            dueDate: due.toISOString(),
            invoiceUSD: invoice,
            status,
            ...docNumbersFor(reference),
          };
          rawContainers.push(container);

          // Collection-rate fix: this used to ALSO push an IN payment here (for `invoice`, the
          // container-value formula) whenever `status === 'PAID'`. The historical-invoice pass
          // further below derives a real SALE_INVOICE from `rawContainers` and settles every
          // PAID container there too, from that invoice's own `invoiceItemAmount` totals — so
          // both passes were paying for the same shipment and `collected` could exceed
          // `invoiced`. Payment generation for PAID containers now lives solely in that later,
          // invoice-linked pass. Both draws below are kept — unused — purely so the PRNG
          // sequence (and `cust-am`'s creditLimit) stays byte-identical.
          if (status === 'PAID') {
            intBetween(0, 6);
            pick(['TT', 'TT', 'TT', 'Cash', 'Cheque', 'Offset']);
          }
        }
        item.remainingMt = round(Math.max(item.quantityMt - shippedSoFar, 0), 3);
        if (item.remainingMt <= 0.001) item.status = 'CLOSED';
      });

      // A few contracts get manual statuses for variety.
      contract.status = contractStatusFromItems(items);
      if (ci % 9 === 4 && k === 0) {
        contract.status = 'ON HOLD';
        contract.items.forEach((i) => (i.status = 'ON HOLD'));
      }
      contracts.push(contract);
    }
  });

  /* ------------------------------------------------------------------ *
   * Authentic anchor: the real Alco Metal contract from the workbook.
   * ------------------------------------------------------------------ */
  (() => {
    const alco = customers.find((c) => c.code === 'AM')!;
    const contractId = 'AM-P-251101156';
    const item: Item = {
      id: `${contractId}-I1`,
      contractId,
      product: '98% Copper Ingots',
      quantityMt: 55,
      lmePercent: 94.76,
      lmeFixed: true,
      fixedLmePrice: 11685,
      premium: 0,
      incoterm: 'CNF',
      status: 'CLOSED',
      notes: 'Reference contract migrated from the legacy workbook.',
      remainingMt: 0,
      partners: [],
    };
    const contract: Contract = {
      id: contractId,
      customerId: alco.id,
      contractType: 'SELL',
      date: rel('2025-11-19').toISOString(),
      destination: 'NINGBO',
      status: 'CLOSED',
      notes: 'Two containers shipped and fully settled.',
      items: [item],
    };
    contracts.unshift(contract);

    const c1: RawContainerSeed = {
      id: `cnt-${contractId}-1`,
      contractId,
      itemId: item.id,
      reference: 'MSNU8018095',
      quantityMt: 27.705,
      lmePrice: 11071.9,
      premium: 0,
      loadDate: rel('2025-12-15').toISOString(),
      arrivalDate: rel('2025-12-17').toISOString(),
      dueDate: rel('2025-12-20').toISOString(),
      invoiceUSD: 306736.95,
      status: 'PAID',
      blNumber: 'MAEU604815097',
      bookingNumber: 'BK20461185',
      sealNumber: 'SL3392041',
    };
    const c2: RawContainerSeed = {
      id: `cnt-${contractId}-2`,
      contractId,
      itemId: item.id,
      reference: 'DFSU7152890',
      quantityMt: 27.935,
      lmePrice: 11071.9,
      premium: 0,
      loadDate: rel('2025-12-15').toISOString(),
      arrivalDate: rel('2025-12-17').toISOString(),
      dueDate: rel('2025-12-20').toISOString(),
      invoiceUSD: 309283.4,
      status: 'PAID',
      blNumber: 'MSCU518327744',
      bookingNumber: 'BK20461186',
      sealNumber: 'CN7741250',
    };
    rawContainers.unshift(c2, c1);

    payments.unshift(
      {
        id: 'NIZ002',
        customerId: alco.id,
        date: rel('2025-12-19').toISOString(),
        currency: 'AED',
        amount: 1125725,
        fxRate: DEFAULT_FX_AED_PER_USD,
        amountUSD: 306737.06,
        method: 'TT',
        reference: 'MSNU8018095',
        notes: 'Settled in AED.',
      },
      {
        id: 'NIZ001',
        customerId: alco.id,
        date: rel('2025-12-18').toISOString(),
        currency: 'AED',
        amount: 1135068,
        fxRate: DEFAULT_FX_AED_PER_USD,
        amountUSD: 309282.83,
        method: 'TT',
        reference: 'DFSU7152890',
        notes: 'Settled in AED.',
      },
    );
  })();

  /* ------------------------------------------------------------------ *
   * Credit limits — deterministic, derived from each customer's exposure.
   * Runs after every container exists; the extra PRNG draws are appended
   * to the end of the sequence, so earlier seeded values are unchanged.
   * ------------------------------------------------------------------ */
  const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;
  customers.forEach((customer) => {
    const myContractIds = new Set(
      contracts.filter((c) => c.customerId === customer.id).map((c) => c.id),
    );
    const myContainers = rawContainers.filter((c) => myContractIds.has(c.contractId));
    const invoiced = myContainers.reduce((s, c) => s + c.invoiceUSD, 0);
    const outstanding = myContainers
      .filter((c) => c.status !== 'PAID')
      .reduce((s, c) => s + c.invoiceUSD, 0);
    const base = Math.max(outstanding, invoiced * 0.4, 100_000);
    const util = 0.5 + rnd() * 0.35; // target utilization 0.50–0.85
    customer.creditLimit = ceilTo(base / util, 250_000);
  });

  /* ------------------------------------------------------------------ *
   * Partner allocations on purchase-contract goods. Appended AFTER the
   * credit-limit post-pass so earlier PRNG draws (and seeded credit
   * limits) stay byte-identical. Iterate the live arrays in declaration
   * order — no sort/filter-into-new-order — to keep determinism.
   * ------------------------------------------------------------------ */
  for (const contract of contracts) {
    if (contract.contractType !== 'PURCHASE') continue;
    for (const item of contract.items) {
      if (rnd() < 0.6) {
        const count = rnd() < 0.5 ? 1 : 2;
        const pool = [...partners];
        const chosen: ItemPartner[] = [];
        let sum = 0;
        for (let i = 0; i < count && pool.length > 0; i++) {
          const partner = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
          const percent = 5 * intBetween(3, 8); // 15–40
          if (sum + percent > 80) break; // company keeps ≥ 20%
          sum += percent;
          chosen.push({ partnerId: partner.id, percent });
        }
        item.partners = chosen;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Trade documents + warehouse seed. ZERO PRNG draws — appended after
   * all rnd()-consuming post-passes; earlier values (e.g. cust-am
   * creditLimit 2,750,000) must stay byte-identical.
   * ------------------------------------------------------------------ */
  const warehouses: Warehouse[] = [
    { id: 'wh-mw', name: 'Main Warehouse', code: 'MW', location: 'Jebel Ali, Dubai', active: true },
  ];
  const invoices: Invoice[] = [];
  const inventoryDocs: InventoryDocument[] = [];

  let invoiceItemCounter = 0;
  function nextInvoiceItemId(): string {
    invoiceItemCounter += 1;
    return `invitem-${invoiceItemCounter}`;
  }

  /* ------------------------------------------------------------------ *
   * Deterministic UUID-shaped ids for `referenceDocumentItemId`.
   * Zero PRNG draws — pure hash of a caller-supplied key. The salt is
   * PREFIXED (not appended) so the four FNV-1a passes are independent;
   * appending makes FNV-1a suffix-extend and collapses effective strength
   * to 32 bits (a real collision was demonstrated with an appended salt).
   * ------------------------------------------------------------------ */
  function fnv1a(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  /** Deterministic UUID-shaped id (~120-bit). Version+variant nibbles forced to '0' → can never
   *  equal a runtime v4 GUID. Salt is PREFIXED so the four passes are independent. */
  function seedUuid(key: string): string {
    const h = hex8(fnv1a(`0|finora-ref|${key}`)) + hex8(fnv1a(`1|finora-ref|${key}`))
            + hex8(fnv1a(`2|finora-ref|${key}`)) + hex8(fnv1a(`3|finora-ref|${key}`));
    return [h.slice(0,8), h.slice(8,12), '0'+h.slice(13,16), '0'+h.slice(17,20), h.slice(20,32)].join('-');
  }

  /** Build one InvoiceItem snapshot from a contract goods line. `refKey` seeds
   *  `referenceDocumentItemId` via `seedUuid` — callers that must SHARE one id across a chain
   *  (PO/PP/PI) pass the same key at every call site. */
  function makeInvoiceItem(
    invoiceId: string,
    contractItem: Item,
    opts: { lmeDate?: string; lmePrice?: number; discountPercent?: number },
    refKey: string,
  ): InvoiceItem {
    const quantityMt = contractItem.quantityMt;
    const lmePercent = contractItem.lmePercent;
    const lmeFixed = contractItem.lmeFixed;
    const fixedPrice = contractItem.fixedLmePrice;
    const premium = contractItem.premium;
    const lmePrice = !lmeFixed ? opts.lmePrice : undefined;
    const lmeDate = opts.lmeDate;
    const discountPercent = opts.discountPercent;
    const amount = round(
      invoiceItemAmount({ lmeFixed, fixedPrice, lmePrice, lmePercent, premium, quantityMt, discountPercent }),
      2,
    );
    return {
      id: nextInvoiceItemId(),
      invoiceId,
      contractItemId: contractItem.id,
      referenceDocumentItemId: seedUuid(refKey),
      product: contractItem.product,
      quantityMt,
      lmePercent,
      lmeFixed,
      fixedPrice,
      premium,
      lmePrice,
      lmeDate,
      discountPercent,
      amount,
    };
  }

  /** Sum item.amount / discount-value / quantityMt for header totals (never hardcoded). */
  function invoiceTotals(items: InvoiceItem[]) {
    const totalAmount = round(items.reduce((s, it) => s + it.amount, 0), 2);
    const totalDiscount = round(
      items.reduce((s, it) => {
        const gross = round((invoiceItemUnitPrice(it) ?? 0) * it.quantityMt, 2);
        return s + (gross - it.amount);
      }, 0),
      2,
    );
    const totalWeightMt = round(items.reduce((s, it) => s + it.quantityMt, 0), 2);
    return { totalAmount, totalDiscount, totalWeightMt };
  }

  const PURCHASE_ORDER_DATE = rel('2026-05-10').toISOString();
  const PURCHASE_PROVISIONAL_DATE = rel('2026-05-21').toISOString();
  const PURCHASE_INVOICE_DATE = rel('2026-05-25').toISOString();
  const SALE_ORDER_DATE = rel('2026-06-05').toISOString();
  const LME_QUOTE_DATE = rel('2026-05-20').toISOString();
  const LME_QUOTE_PRICE = 2450;

  // First PURCHASE contract (array order): full PO → PP → PI chain.
  const firstPurchaseContract = contracts.find((c) => c.contractType === 'PURCHASE');
  if (firstPurchaseContract) {
    const contract = firstPurchaseContract;

    // PO-2026-0001: unpriced, full qty per item.
    const poId = 'inv-po-0001';
    // PO/PP/PI SHARE one referenceDocumentItemId per contract item.
    const poItems = contract.items.map((item) => makeInvoiceItem(poId, item, {}, `${poId}|${item.id}`));
    const poTotals = invoiceTotals(poItems);
    const po: Invoice = {
      id: poId,
      invoiceNumber: 'PO-2026-0001',
      invoiceType: 'PURCHASE_ORDER',
      invoiceDate: PURCHASE_ORDER_DATE,
      contractId: contract.id,
      customerId: contract.customerId,
      status: 'CONFIRMED',
      currency: 'USD',
      exchangeRate: 1,
      totalAmount: poTotals.totalAmount,
      totalDiscount: poTotals.totalDiscount,
      totalWeightMt: poTotals.totalWeightMt,
      createdAt: PURCHASE_ORDER_DATE,
      items: poItems,
    };
    invoices.push(po);

    // PP-2026-0001: lmeDate on ALL items, lmePrice 2450 on FLOATING items only, discount 0.
    const ppId = 'inv-pp-0001';
    const ppItems = contract.items.map((item) =>
      makeInvoiceItem(
        ppId,
        item,
        { lmeDate: LME_QUOTE_DATE, lmePrice: LME_QUOTE_PRICE, discountPercent: 0 },
        `${poId}|${item.id}`,
      ),
    );
    const ppTotals = invoiceTotals(ppItems);
    const pp: Invoice = {
      id: ppId,
      invoiceNumber: 'PP-2026-0001',
      invoiceType: 'PURCHASE_PROVISIONAL',
      invoiceDate: PURCHASE_PROVISIONAL_DATE,
      contractId: contract.id,
      customerId: contract.customerId,
      status: 'CONFIRMED',
      currency: 'USD',
      exchangeRate: 1,
      refInvoiceId: poId,
      totalAmount: ppTotals.totalAmount,
      totalDiscount: ppTotals.totalDiscount,
      totalWeightMt: ppTotals.totalWeightMt,
      createdAt: PURCHASE_PROVISIONAL_DATE,
      items: ppItems,
    };
    invoices.push(pp);

    // PI-2026-0001: same prices as PP (ref PP).
    const piId = 'inv-pi-0001';
    const piItems = contract.items.map((item) =>
      makeInvoiceItem(
        piId,
        item,
        { lmeDate: LME_QUOTE_DATE, lmePrice: LME_QUOTE_PRICE, discountPercent: 0 },
        `${poId}|${item.id}`,
      ),
    );
    const piTotals = invoiceTotals(piItems);
    const pi: Invoice = {
      id: piId,
      invoiceNumber: 'PI-2026-0001',
      invoiceType: 'PURCHASE_INVOICE',
      invoiceDate: PURCHASE_INVOICE_DATE,
      contractId: contract.id,
      customerId: contract.customerId,
      status: 'CONFIRMED',
      currency: 'USD',
      exchangeRate: 1,
      refInvoiceId: ppId,
      totalAmount: piTotals.totalAmount,
      totalDiscount: piTotals.totalDiscount,
      totalWeightMt: piTotals.totalWeightMt,
      createdAt: PURCHASE_INVOICE_DATE,
      items: piItems,
    };
    invoices.push(pi);

    // GRN-2026-0001: CONFIRMED IN inventory doc for the PI into wh-mw.
    const grnId = 'idoc-0001';
    const grn: InventoryDocument = {
      id: grnId,
      docNumber: 'GRN-2026-0001',
      warehouseId: 'wh-mw',
      invoiceId: piId,
      type: 'IN',
      date: PURCHASE_INVOICE_DATE,
      status: 'CONFIRMED',
      items: piItems.map((it, idx) => ({
        id: `idocitem-${idx + 1}`,
        documentId: grnId,
        invoiceItemId: it.id,
        // Copy — never mint — so the GRN's dedupe key matches the PI line it receives.
        referenceDocumentItemId: it.referenceDocumentItemId,
        product: it.product,
        quantityMt: it.quantityMt,
      })),
    };
    inventoryDocs.push(grn);

    // One payment: 50% of PI totalAmount, currency USD, fxRate 1, method 'TT',
    // date 2026-06-01 (relative to anchor), invoiceId = PI id, direction 'OUT', reference = 'PI-2026-0001'.
    const paymentAmount = round(pi.totalAmount * 0.5, 2);
    payments.push({
      id: `NIZ${String(payments.length + 1).padStart(3, '0')}`,
      customerId: pi.customerId,
      date: rel('2026-06-01').toISOString(),
      currency: 'USD',
      amount: paymentAmount,
      fxRate: 1,
      amountUSD: paymentAmount,
      method: 'TT',
      reference: 'PI-2026-0001',
      invoiceId: piId,
      direction: 'OUT',
      notes: '',
    });
  }

  // First SELL contract (array order): DRAFT SO-2026-0001, first item only, 50% qty.
  const firstSellContract = contracts.find((c) => c.contractType === 'SELL');
  if (firstSellContract && firstSellContract.items.length > 0) {
    const contract = firstSellContract;
    const firstItem = contract.items[0];
    const soId = 'inv-so-0001';
    const halfQtyItem: Item = { ...firstItem, quantityMt: round(firstItem.quantityMt * 0.5, 2) };
    const soItems = [makeInvoiceItem(soId, halfQtyItem, {}, `${soId}|${firstItem.id}`)];
    const soTotals = invoiceTotals(soItems);
    const so: Invoice = {
      id: soId,
      invoiceNumber: 'SO-2026-0001',
      invoiceType: 'SALE_ORDER',
      invoiceDate: SALE_ORDER_DATE,
      contractId: contract.id,
      customerId: contract.customerId,
      status: 'DRAFT',
      currency: 'USD',
      exchangeRate: 1,
      totalAmount: soTotals.totalAmount,
      totalDiscount: soTotals.totalDiscount,
      totalWeightMt: soTotals.totalWeightMt,
      createdAt: SALE_ORDER_DATE,
      items: soItems,
    };
    invoices.push(so);
  }

  /* ------------------------------------------------------------------ *
   * Container reshape (raw → logistics) + historical trade invoices.
   * ZERO PRNG draws — runs after every rnd()-consuming pass (credit-limit,
   * partner allocation) AND after the PO/PP/PI/SO seed above, so
   * historical invoice numbering can scan-until-unique against those ids
   * too. Earlier seeded values (e.g. cust-am creditLimit 2,750,000) are
   * untouched: this pass only READS `rawContainers`/`contracts`/`invoices`
   * and WRITES the new `containers` plus appends to `invoices`/`payments`.
   * ------------------------------------------------------------------ */
  const containers: Container[] = rawContainers.map((raw) => ({
    id: raw.id,
    reference: raw.reference,
    goods: [{ contractItemId: raw.itemId, quantityMt: raw.quantityMt }],
    loadDate: raw.loadDate,
    arrivalDate: raw.arrivalDate,
    blNumber: raw.blNumber,
    bookingNumber: raw.bookingNumber,
    sealNumber: raw.sealNumber,
    netWeightKg: Math.round(raw.quantityMt * 1000),
    grossWeightKg: Math.round(raw.quantityMt * 1000 * 1.02),
  }));

  const itemById = new Map<string, Item>();
  for (const c of contracts) for (const it of c.items) itemById.set(it.id, it);

  const rawByContract = new Map<string, RawContainerSeed[]>();
  for (const raw of rawContainers) {
    const list = rawByContract.get(raw.contractId) ?? [];
    list.push(raw);
    rawByContract.set(raw.contractId, list);
  }

  const historicalInvoiceIds = new Set(invoices.map((inv) => inv.id));
  const historicalInvoiceNumbers = new Set(invoices.map((inv) => inv.invoiceNumber));

  /**
   * `<PFX>-<YYYY>-<NNNN>` / `inv-<pfx>-<NNNN>`, scan-until-unused against every invoice id/number
   * created so far in the seed (identical schemes to api.ts's runtime `nextInvoiceNumber`/
   * `nextInvoiceId`, reimplemented locally since this module cannot import api.ts).
   */
  function nextHistoricalInvoiceIds(prefix: 'SI' | 'PI'): { id: string; number: string } {
    const year = anchor.format('YYYY');
    let n = 1;
    for (;;) {
      const number = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
      const id = `inv-${prefix.toLowerCase()}-${String(n).padStart(4, '0')}`;
      if (!historicalInvoiceIds.has(id) && !historicalInvoiceNumbers.has(number)) {
        historicalInvoiceIds.add(id);
        historicalInvoiceNumbers.add(number);
        return { id, number };
      }
      n += 1;
    }
  }

  /** Snapshot InvoiceItem from a raw container + its contract-item pricing. */
  function makeHistoricalInvoiceItem(invoiceId: string, raw: RawContainerSeed): InvoiceItem {
    const contractItem = itemById.get(raw.itemId)!;
    const lmePercent = contractItem.lmePercent;
    const lmeFixed = contractItem.lmeFixed;
    const fixedPrice = contractItem.fixedLmePrice;
    const premium = contractItem.premium;
    const lmePrice = !lmeFixed ? raw.lmePrice : undefined;
    const quantityMt = raw.quantityMt;
    const discountPercent = 0;
    const amount = round(
      invoiceItemAmount({ lmeFixed, fixedPrice, lmePrice, lmePercent, premium, quantityMt, discountPercent }),
      2,
    );
    return {
      id: nextInvoiceItemId(),
      invoiceId,
      contractItemId: raw.itemId,
      referenceDocumentItemId: seedUuid(raw.id),
      product: contractItem.product,
      quantityMt,
      lmePercent,
      lmeFixed,
      fixedPrice,
      premium,
      lmePrice,
      lmeDate: raw.loadDate,
      discountPercent,
      amount,
      containerId: raw.id,
    };
  }

  // One CONFIRMED historical invoice per contract that has raw shipments — SALE_INVOICE for
  // SELL contracts, PURCHASE_INVOICE for PURCHASE — one line per raw container.
  for (const contract of contracts) {
    const raws = rawByContract.get(contract.id);
    if (!raws || raws.length === 0) continue;

    const invoiceType: InvoiceType = contract.contractType === 'SELL' ? 'SALE_INVOICE' : 'PURCHASE_INVOICE';
    const prefix = invoiceType === 'SALE_INVOICE' ? 'SI' : 'PI';
    const { id, number } = nextHistoricalInvoiceIds(prefix);
    const items = raws.map((raw) => makeHistoricalInvoiceItem(id, raw));
    const totals = invoiceTotals(items);
    const invoiceDate = raws
      .reduce(
        (latest, raw) => (dayjs(raw.loadDate).isAfter(latest) ? dayjs(raw.loadDate) : latest),
        dayjs(raws[0].loadDate),
      )
      .toISOString();

    const invoice: Invoice = {
      id,
      invoiceNumber: number,
      invoiceType,
      invoiceDate,
      contractId: contract.id,
      customerId: contract.customerId,
      status: 'CONFIRMED',
      currency: 'USD',
      exchangeRate: 1,
      totalAmount: totals.totalAmount,
      totalDiscount: totals.totalDiscount,
      totalWeightMt: totals.totalWeightMt,
      createdAt: invoiceDate,
      items,
    };
    invoices.push(invoice);

    // No warehouse docs are seeded for these historical invoices — seed-only shortcut.
    if (invoiceType === 'SALE_INVOICE') {
      // Settle exactly the shipments that were already marked PAID back when their container
      // was generated — deriving the amount from THIS invoice's own line totals (`item.amount`,
      // i.e. `invoiceItemAmount`) rather than the container-value formula, and linking the
      // payment to `invoice.id` so it can never be attributed to more than one document. Skip
      // any container that already has an explicit payment recorded against it by `reference`
      // (the Alco reference contract's containers are settled verbatim from the workbook,
      // above) so the same shipment is never paid twice. This keeps collected <= invoiced for
      // every invoice, and therefore for every customer and overall.
      const paidAmount = round(
        raws
          .filter((raw) => raw.status === 'PAID' && !payments.some((p) => p.reference === raw.reference))
          .reduce((s, raw) => s + (items.find((it) => it.containerId === raw.id)?.amount ?? 0), 0),
        2,
      );
      if (paidAmount > 0) {
        payments.push({
          id: `NIZ${String(payments.length + 1).padStart(3, '0')}`,
          customerId: invoice.customerId,
          date: invoiceDate,
          currency: 'USD',
          amount: paidAmount,
          fxRate: 1,
          amountUSD: paidAmount,
          method: 'TT',
          reference: invoice.invoiceNumber,
          invoiceId: invoice.id,
          direction: 'IN',
          notes: '',
        });
      }
    }
    // Purchase invoices are payables — no payment seeded here.
  }

  // Recompute every item's remainingMt from the historical invoice lines just created, so the
  // seed matches the runtime `shippedMtForItem` formula exactly. The 1:1 raw-container →
  // invoice-line repackaging means this coincides with the original container-derived
  // remainingMt (same quantities, same summation order).
  const shippedByItem = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status === 'CANCELLED') continue;
    for (const it of inv.items) {
      shippedByItem.set(it.contractItemId, (shippedByItem.get(it.contractItemId) ?? 0) + it.quantityMt);
    }
  }
  for (const item of itemById.values()) {
    item.remainingMt = round(Math.max(item.quantityMt - (shippedByItem.get(item.id) ?? 0), 0), 3);
  }

  /* ------------------------------------------------------------------ *
   * Portal linking anchor: the Customer-role demo login (`portal@alcometal.ae`, roles.ts) is
   * scoped to whichever customer holds `portalAccount: true` — without this post-pass the
   * portal login has nothing to resolve to even with sample data loaded. ZERO rnd() draws,
   * so it doesn't disturb determinism.
   * ------------------------------------------------------------------ */
  const portalCustomer = customers.find((c) => c.code === 'AM');
  if (portalCustomer) portalCustomer.portalAccount = true;

  /* ------------------------------------------------------------------ *
   * Charge master data (cost centres + the 2×2 of charge categories) and a handful of demo
   * charge documents and claims — docs/superpowers/specs/2026-07-27-expense-revenue-claim-
   * rework-design.md §7 (`mock/sampleData.ts`: "seed real categories + cost centres … the old
   * hard-coded lists become data"), deferred there to §9's Phase 8. Without the categories,
   * "Load sample data" gives invoices but every charge flow dead-ends at an empty picker.
   *
   * ZERO rnd() draws — appended after every draw-consuming pass, exactly like the
   * `portalCustomer` post-pass above, so `cust-am`'s creditLimit (2,750,000) and every other
   * previously-generated value stay byte-identical.
   *
   * Ids are minted LITERALLY, in the exact formats `api.ts`'s `next*` helpers max-scan for
   * (`ccat-0001`, `cc-0001`, `chg-0001`, `chgline-<n>`, `chgalloc-<n>`, `clm-0001`,
   * `clmitem-<n>`), so a record the user creates after loading sample data continues the
   * sequence instead of colliding. Never by CALLING those helpers: they read `db`, a store
   * that does not exist yet at generation time.
   *
   * Every date is derived from `anchor` (via `rel()`) or from the booked invoice's own
   * already-anchor-relative date — never an absolute literal and never the clock. A previous
   * release shipped baked absolute dates and produced a permanent −100% trend.
   * ------------------------------------------------------------------ */
  const costCentres: CostCentre[] = [
    { id: 'cc-0001', name: 'Logistics', code: 'LOG', description: 'Freight, port handling and haulage', active: true },
    { id: 'cc-0002', name: 'Trading Desk', code: 'TRD', description: 'Deal-side costs and recoveries', active: true },
    { id: 'cc-0003', name: 'Administration', code: 'ADM', description: 'Office and general overheads', active: true },
    { id: 'cc-0004', name: 'Finance', code: 'FIN', description: 'Banking, insurance and treasury', active: true },
  ];

  // The 2×2 of spec §2: `direction` EXPENSE|REVENUE × `scope` INVOICE|GENERAL. `code` is
  // trimmed+uppercased and unique WITHIN a direction (so REVENUE may reuse an EXPENSE code) —
  // the `createChargeCategory` guard these literals must satisfy.
  const chargeCategories: ChargeCategory[] = [
    // EXPENSE / INVOICE — costs booked against a specific trade document's goods.
    { id: 'ccat-0001', name: 'Ocean Freight', code: 'FRT', direction: 'EXPENSE', scope: 'INVOICE', description: 'Sea freight per shipment', active: true },
    { id: 'ccat-0002', name: 'Customs Duty', code: 'DUTY', direction: 'EXPENSE', scope: 'INVOICE', description: 'Import/export duty and clearance', active: true },
    { id: 'ccat-0003', name: 'Inspection & Assay', code: 'INSP', direction: 'EXPENSE', scope: 'INVOICE', description: 'Third-party survey, sampling and assay', active: true },
    { id: 'ccat-0004', name: 'Port Handling', code: 'PORT', direction: 'EXPENSE', scope: 'INVOICE', description: 'Terminal handling, lift-on/lift-off, storage', active: true },
    { id: 'ccat-0005', name: 'Cargo Insurance', code: 'INS', direction: 'EXPENSE', scope: 'INVOICE', description: 'Marine cargo cover per shipment', active: true },
    // EXPENSE / GENERAL — overheads that belong to no single document.
    { id: 'ccat-0006', name: 'Office Rent', code: 'RENT', direction: 'EXPENSE', scope: 'GENERAL', description: 'Premises rent and service charge', active: true },
    { id: 'ccat-0007', name: 'Salaries & Wages', code: 'SAL', direction: 'EXPENSE', scope: 'GENERAL', description: 'Payroll and staff costs', active: true },
    { id: 'ccat-0008', name: 'Bank Charges', code: 'BANK', direction: 'EXPENSE', scope: 'GENERAL', description: 'LC fees, transfer and facility charges', active: true },
    // REVENUE / INVOICE — income attributable to a document's goods.
    { id: 'ccat-0009', name: 'Weight Gain', code: 'WTGAIN', direction: 'REVENUE', scope: 'INVOICE', description: 'Outturn weight above invoiced quantity', active: true },
    { id: 'ccat-0010', name: 'Quality Premium', code: 'QPREM', direction: 'REVENUE', scope: 'INVOICE', description: 'Assay above contracted grade', active: true },
    // REVENUE / GENERAL — income that belongs to no single document.
    { id: 'ccat-0011', name: 'Interest Income', code: 'INT', direction: 'REVENUE', scope: 'GENERAL', description: 'Deposit and facility interest', active: true },
    { id: 'ccat-0012', name: 'Scrap Resale', code: 'SCRAP', direction: 'REVENUE', scope: 'GENERAL', description: 'Yard sweepings and off-spec resale', active: true },
  ];

  /**
   * CONFIRMED, priced and chain-leaf — the exact eligibility rule `getChargeSourceInvoices`
   * enforces (api.ts, spec §4), recomputed here from the generated arrays rather than
   * hard-coded against invoice ids, so a seeded document can never reference something the
   * picker would reject.
   */
  const chargeEligible = (inv: Invoice): boolean =>
    inv.status === 'CONFIRMED' &&
    inv.invoiceType !== 'PURCHASE_ORDER' &&
    inv.invoiceType !== 'SALE_ORDER' &&
    inv.items.length > 0 &&
    !invoices.some((other) => other.refInvoiceId === inv.id && other.status !== 'CANCELLED');

  const eligiblePurchases = invoices.filter((inv) => chargeEligible(inv) && inv.invoiceType.startsWith('PURCHASE'));
  const eligibleSales = invoices.filter((inv) => chargeEligible(inv) && inv.invoiceType.startsWith('SALE'));
  // ≥3 goods so the equal split (spec §3) is visible on screen rather than trivial.
  const multiGoodPurchase = eligiblePurchases.find((inv) => inv.items.length >= 3);
  const multiGoodSales = eligibleSales.filter((inv) => inv.items.length >= 3);

  const chargeDocs: ChargeDoc[] = [];
  const claims: Claim[] = [];

  // Literal-format id counters — see this block's header for why the `next*` helpers in api.ts
  // are unusable here. Each mirrors its helper's format exactly (4-digit zero-padded for the
  // header entities, bare monotonic for the inline children).
  let chargeDocSeq = 0;
  let chargeLineSeq = 0;
  let chargeAllocSeq = 0;
  let claimSeq = 0;
  let claimItemSeq = 0;

  interface SeedLineSpec {
    categoryId: string;
    amount: number;
    currency: Currency;
    costCentreId: string;
    description: string;
    /** Days after the document date — keeps line dates anchor-relative too. */
    dayOffset: number;
  }

  /**
   * Mirrors `buildChargeLine` + `recomputeLineTotals` (api.ts, spec §3): equal split across
   * every good of the booked invoice, leaf USD conversion, then roll-up — never a parent total
   * converted once and split, which is what would put `line.amountUSD` a cent off
   * `Σ allocation.amountUSD`. GENERAL lines carry `allocations: []` and convert directly.
   */
  function makeChargeLine(doc: ChargeDoc, invoice: Invoice | undefined, spec: SeedLineSpec): ChargeLine {
    chargeLineSeq += 1;
    const fxRate = spec.currency === 'USD' ? 1 : DEFAULT_FX_AED_PER_USD;
    const line: ChargeLine = {
      id: `chgline-${chargeLineSeq}`,
      docId: doc.id,
      categoryId: spec.categoryId,
      date: dayjs(doc.date).add(spec.dayOffset, 'day').toISOString(),
      amount: round(spec.amount, 2),
      currency: spec.currency,
      fxRate,
      amountUSD: 0,
      costCentreId: spec.costCentreId,
      description: spec.description,
      quantityBasisMt: undefined,
      unitPriceUSD: undefined,
      allocations: [],
    };

    if (doc.kind === 'GENERAL' || !invoice) {
      line.amountUSD = round(line.amount / fxRate, 2);
      return line;
    }

    const parts = splitEqually(line.amount, invoice.items.length);
    line.allocations = invoice.items.map((it, i) => {
      chargeAllocSeq += 1;
      return {
        id: `chgalloc-${chargeAllocSeq}`,
        lineId: line.id,
        invoiceItemId: it.id,
        referenceDocumentItemId: it.referenceDocumentItemId,
        product: it.product,
        quantityMt: it.quantityMt,
        amount: parts[i],
        amountUSD: round(parts[i] / fxRate, 2),
      };
    });
    line.amount = round(line.allocations.reduce((s, a) => s + a.amount, 0), 2);
    line.amountUSD = round(line.allocations.reduce((s, a) => s + a.amountUSD, 0), 2);
    line.quantityBasisMt = round(line.allocations.reduce((s, a) => s + a.quantityMt, 0), 3);
    line.unitPriceUSD =
      line.quantityBasisMt > 0 ? round(line.amountUSD / line.quantityBasisMt, 2) : undefined;
    return line;
  }

  /** `totalUSD = round(Σ lines[].amountUSD)` — `recomputeDocTotals`'s rule (spec §3). */
  function pushChargeDoc(spec: {
    direction: ChargeDirection;
    kind: ChargeScope;
    title: string;
    invoice?: Invoice;
    date: string;
    description: string;
    lines: SeedLineSpec[];
  }): void {
    chargeDocSeq += 1;
    const doc: ChargeDoc = {
      id: `chg-${String(chargeDocSeq).padStart(4, '0')}`,
      direction: spec.direction,
      kind: spec.kind,
      title: spec.title,
      invoiceId: spec.kind === 'INVOICE' ? spec.invoice?.id : undefined,
      date: spec.date,
      description: spec.description,
      status: 'ACTIVE',
      createdAt: spec.date,
      lines: [],
      totalUSD: 0,
    };
    doc.lines = spec.lines.map((line) => makeChargeLine(doc, spec.invoice, line));
    doc.totalUSD = round(doc.lines.reduce((s, l) => s + l.amountUSD, 0), 2);
    chargeDocs.push(doc);
  }

  /**
   * Mirrors `buildClaim` (api.ts, spec §4): `partyId` from the invoice, per-item snapshots from
   * the invoice line, `amountUSD = round(amount / fxRate)` at the leaf, and a header `amount`/
   * `amountUSD` that is a pure read-only sum of the items.
   */
  function pushClaim(spec: {
    side: ClaimSide;
    title: string;
    invoice: Invoice;
    claimType: ClaimType;
    currency: Currency;
    dayOffset: number;
    description: string;
    /** Only the first N goods are claimed — a claim on *some* of a document's goods (spec §10.8). */
    items: Array<{ amount: number; description: string }>;
  }): void {
    claimSeq += 1;
    const claimId = `clm-${String(claimSeq).padStart(4, '0')}`;
    const fxRate = spec.currency === 'USD' ? 1 : DEFAULT_FX_AED_PER_USD;
    const date = dayjs(spec.invoice.invoiceDate).add(spec.dayOffset, 'day').toISOString();
    const items: ClaimItem[] = spec.items.map((entry, i) => {
      claimItemSeq += 1;
      const invoiceItem = spec.invoice.items[i];
      return {
        id: `clmitem-${claimItemSeq}`,
        claimId,
        invoiceItemId: invoiceItem.id,
        referenceDocumentItemId: invoiceItem.referenceDocumentItemId,
        product: invoiceItem.product,
        quantityMt: invoiceItem.quantityMt,
        amount: round(entry.amount, 2),
        amountUSD: round(entry.amount / fxRate, 2),
        description: entry.description,
      };
    });
    claims.push({
      id: claimId,
      side: spec.side,
      title: spec.title,
      invoiceId: spec.invoice.id,
      partyId: spec.invoice.customerId,
      claimType: spec.claimType,
      date,
      currency: spec.currency,
      fxRate,
      amount: round(items.reduce((s, it) => s + it.amount, 0), 2),
      amountUSD: round(items.reduce((s, it) => s + it.amountUSD, 0), 2),
      description: spec.description,
      status: 'ACTIVE',
      createdAt: date,
      items,
    });
  }

  // chg-0001: import costs on a multi-good PURCHASE document — three lines, one of them in AED
  // so the demo shows the FX column doing real work.
  if (multiGoodPurchase) {
    pushChargeDoc({
      direction: 'EXPENSE',
      kind: 'INVOICE',
      title: `Import costs ${multiGoodPurchase.invoiceNumber}`,
      invoice: multiGoodPurchase,
      date: dayjs(multiGoodPurchase.invoiceDate).add(3, 'day').toISOString(),
      description: 'Landed-cost build-up for the received cargo',
      lines: [
        { categoryId: 'ccat-0001', amount: 18400, currency: 'USD', costCentreId: 'cc-0001', description: 'Sea freight, 4 × 40HC', dayOffset: 0 },
        { categoryId: 'ccat-0002', amount: 22050, currency: 'AED', costCentreId: 'cc-0001', description: 'Duty and clearance at Jebel Ali', dayOffset: 2 },
        { categoryId: 'ccat-0003', amount: 3600, currency: 'USD', costCentreId: 'cc-0002', description: 'Independent survey and assay', dayOffset: 4 },
      ],
    });
  }

  // chg-0002: outbound handling on a multi-good SALE document.
  if (multiGoodSales[0]) {
    pushChargeDoc({
      direction: 'EXPENSE',
      kind: 'INVOICE',
      title: `Outbound handling ${multiGoodSales[0].invoiceNumber}`,
      invoice: multiGoodSales[0],
      date: dayjs(multiGoodSales[0].invoiceDate).add(2, 'day').toISOString(),
      description: 'Terminal and cover costs on the shipped parcel',
      lines: [
        { categoryId: 'ccat-0004', amount: 6250, currency: 'USD', costCentreId: 'cc-0001', description: 'Terminal handling and lift-on', dayOffset: 0 },
        { categoryId: 'ccat-0005', amount: 2480, currency: 'USD', costCentreId: 'cc-0004', description: 'Marine cargo cover to destination', dayOffset: 3 },
      ],
    });
  }

  // chg-0003: a GENERAL expense — no invoice, no goods, `allocations: []` on every line.
  pushChargeDoc({
    direction: 'EXPENSE',
    kind: 'GENERAL',
    title: 'Office overheads',
    date: rel('2026-06-01').toISOString(),
    description: 'Monthly overheads not attributable to a single document',
    lines: [
      { categoryId: 'ccat-0006', amount: 45000, currency: 'AED', costCentreId: 'cc-0003', description: 'Premises rent and service charge', dayOffset: 0 },
      { categoryId: 'ccat-0007', amount: 62500, currency: 'USD', costCentreId: 'cc-0003', description: 'Desk and back-office payroll', dayOffset: 1 },
      { categoryId: 'ccat-0008', amount: 1180, currency: 'USD', costCentreId: 'cc-0004', description: 'LC issuance and transfer fees', dayOffset: 2 },
    ],
  });

  // chg-0004: the REVENUE mirror — a second SALE document so the Revenues list is independent
  // of the Expenses list (spec §10.7).
  if (multiGoodSales[1]) {
    pushChargeDoc({
      direction: 'REVENUE',
      kind: 'INVOICE',
      title: `Outturn gain ${multiGoodSales[1].invoiceNumber}`,
      invoice: multiGoodSales[1],
      date: dayjs(multiGoodSales[1].invoiceDate).add(5, 'day').toISOString(),
      description: 'Discharge outturn above the invoiced quantity',
      lines: [
        { categoryId: 'ccat-0009', amount: 9400, currency: 'USD', costCentreId: 'cc-0002', description: 'Weight gain at discharge', dayOffset: 0 },
      ],
    });
  }

  // clm-0001 / clm-0002: expense-claim → PURCHASE, revenue-claim → SALE (spec §1's binding
  // table). Both claim only the FIRST TWO goods of a ≥3-good document, so the detail modal
  // demonstrates a partial claim rather than a whole-document one.
  if (multiGoodPurchase) {
    pushClaim({
      side: 'EXPENSE',
      title: `Short weight ${multiGoodPurchase.invoiceNumber}`,
      invoice: multiGoodPurchase,
      claimType: 'QUANTITY',
      currency: 'USD',
      dayOffset: 12,
      description: 'Draft survey short against the supplier',
      items: [
        { amount: 4250, description: 'Outturn 1.8 MT below B/L weight' },
        { amount: 3180, description: 'Outturn 1.3 MT below B/L weight' },
      ],
    });
  }
  if (multiGoodSales[1]) {
    pushClaim({
      side: 'REVENUE',
      title: `Quality claim ${multiGoodSales[1].invoiceNumber}`,
      invoice: multiGoodSales[1],
      claimType: 'QUALITY',
      currency: 'AED',
      dayOffset: 16,
      description: 'Buyer claim on assay below contracted grade',
      items: [
        { amount: 18500, description: 'Copper content 0.6% under spec' },
        { amount: 11250, description: 'Excess moisture on discharge' },
      ],
    });
  }

  return {
    customers,
    contracts,
    containers,
    payments,
    partners,
    warehouses,
    invoices,
    inventoryDocs,
    costCentres,
    chargeCategories,
    chargeDocs,
    claims,
    fxRate: DEFAULT_FX_AED_PER_USD,
  };
}
