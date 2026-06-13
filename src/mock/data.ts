import dayjs from 'dayjs';
import type {
  Container,
  ContainerStatus,
  Contract,
  ContractStatus,
  Currency,
  Customer,
  Incoterm,
  Item,
  Payment,
} from '@/types';
import { DEFAULT_FX_AED_PER_USD } from '@/config/constants';
import { containerInvoice, unitPrice } from '@/utils/calc';

/* ------------------------------------------------------------------ *
 * Deterministic PRNG so the demo dataset is stable across reloads.
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
const rnd = mulberry32(20260613);

const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (min: number, max: number) => min + rnd() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

const TODAY = dayjs('2026-06-13');

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

interface CustomerSeed {
  name: string;
  code: string;
  currency: Currency;
  country: string;
  contact: string;
  terms: number;
  contracts: number;
}

const CUSTOMER_SEEDS: CustomerSeed[] = [
  { name: 'Alco Metal Trading', code: 'AM', currency: 'AED', country: 'UAE', contact: 'Khalid Nasser', terms: 7, contracts: 4 },
  { name: 'Million Gen Tr', code: 'MG', currency: 'AED', country: 'UAE', contact: 'Rashid Al Falasi', terms: 15, contracts: 5 },
  { name: 'Al Jesr Scrap Metal Tr', code: 'AJ', currency: 'AED', country: 'UAE', contact: 'Yousef Karim', terms: 10, contracts: 3 },
  { name: 'Sun Metals Casting LLC', code: 'SM', currency: 'AED', country: 'UAE', contact: 'Imran Sheikh', terms: 30, contracts: 4 },
  { name: 'Zurich Metal', code: 'ZM', currency: 'USD', country: 'Switzerland', contact: 'Lukas Meier', terms: 30, contracts: 3 },
  { name: 'Transmetals Trading DMCC', code: 'TM', currency: 'USD', country: 'UAE', contact: 'Daniel Costa', terms: 21, contracts: 5 },
  { name: 'Ningbo Goosen International', code: 'NG', currency: 'USD', country: 'China', contact: 'Wei Zhang', terms: 14, contracts: 6 },
  { name: 'Shar International TL', code: 'SH', currency: 'USD', country: 'Turkey', contact: 'Emre Demir', terms: 21, contracts: 3 },
  { name: 'Abdul Rahman Lobnani', code: 'AR', currency: 'AED', country: 'Lebanon', contact: 'Abdul Rahman', terms: 7, contracts: 2 },
  { name: 'The Nile Metals', code: 'NM', currency: 'USD', country: 'Egypt', contact: 'Tarek Fouad', terms: 30, contracts: 3 },
  { name: 'Quick Sea Freight', code: 'QS', currency: 'USD', country: 'India', contact: 'Anil Mehta', terms: 14, contracts: 2 },
  { name: 'Advanced Cargo & Shipping', code: 'AC', currency: 'USD', country: 'India', contact: 'Vikram Rao', terms: 14, contracts: 2 },
  { name: 'Goldline Recyclers FZE', code: 'GL', currency: 'AED', country: 'UAE', contact: 'Sara Haddad', terms: 30, contracts: 3 },
  { name: 'Eurasia Metals GmbH', code: 'EM', currency: 'USD', country: 'Germany', contact: 'Hannah Vogel', terms: 45, contracts: 3 },
];

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */
const customers: Customer[] = [];
const contracts: Contract[] = [];
const containers: Container[] = [];
const payments: Payment[] = [];

let paymentCounter = 0;

function makeContainerRef(): string {
  return `${pick(CONTAINER_PREFIXES)}${intBetween(1000000, 9999999)}`;
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
    createdAt: TODAY.subtract(intBetween(120, 900), 'day').toISOString(),
  };
  customers.push(customer);

  for (let k = 0; k < seed.contracts; k++) {
    const contractDate = TODAY.subtract(intBetween(5, 420), 'day');
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
      };
      items.push(item);
    }

    const contract: Contract = {
      id: contractId,
      customerId: customer.id,
      date: contractDate.toISOString(),
      destination,
      status: 'ACTIVE',
      notes: '',
      items,
    };

    // Ship a portion of each item across 0–3 containers.
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

        const shipmentDate = dayjs(contract.date).add(intBetween(5, 60), 'day');
        const arrival = shipmentDate.add(intBetween(10, 35), 'day');
        const due = arrival.add(customer.paymentTermsDays, 'day');
        const invoice = round(containerInvoice({ quantityMt: qty, lmePrice: price, premium: 0 }), 2);

        let status: ContainerStatus;
        const paidRoll = rnd();
        if (due.isBefore(TODAY)) {
          status = paidRoll > 0.22 ? 'PAID' : 'OVERDUE';
        } else {
          status = paidRoll > 0.7 ? 'PAID' : 'OPEN';
        }

        const container: Container = {
          id: `cnt-${contractId}-${s + 1}`,
          contractId,
          itemId: item.id,
          reference: makeContainerRef(),
          quantityMt: qty,
          lmePrice: round(price, 2),
          premium: 0,
          shipmentDate: shipmentDate.toISOString(),
          arrivalDate: arrival.toISOString(),
          dueDate: due.toISOString(),
          invoiceUSD: invoice,
          status,
        };
        containers.push(container);

        if (status === 'PAID') {
          paymentCounter += 1;
          const usePayCurrency: Currency = customer.defaultCurrency;
          const fx = usePayCurrency === 'AED' ? DEFAULT_FX_AED_PER_USD : 1;
          payments.push({
            id: `NIZ${String(paymentCounter).padStart(4, '0')}`,
            customerId: customer.id,
            date: due.subtract(intBetween(0, 6), 'day').toISOString(),
            currency: usePayCurrency,
            amount: round(invoice * fx, 2),
            fxRate: fx,
            amountUSD: invoice,
            method: pick(['TT', 'TT', 'TT', 'Cash', 'Cheque', 'Offset']),
            reference: container.reference,
            notes: '',
          });
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
  };
  const contract: Contract = {
    id: contractId,
    customerId: alco.id,
    date: dayjs('2025-11-19').toISOString(),
    destination: 'NINGBO',
    status: 'CLOSED',
    notes: 'Two containers shipped and fully settled.',
    items: [item],
  };
  contracts.unshift(contract);

  const c1: Container = {
    id: `cnt-${contractId}-1`,
    contractId,
    itemId: item.id,
    reference: 'MSNU8018095',
    quantityMt: 27.705,
    lmePrice: 11071.9,
    premium: 0,
    shipmentDate: dayjs('2025-12-15').toISOString(),
    arrivalDate: dayjs('2025-12-17').toISOString(),
    dueDate: dayjs('2025-12-20').toISOString(),
    invoiceUSD: 306736.95,
    status: 'PAID',
  };
  const c2: Container = {
    id: `cnt-${contractId}-2`,
    contractId,
    itemId: item.id,
    reference: 'DFSU7152890',
    quantityMt: 27.935,
    lmePrice: 11071.9,
    premium: 0,
    shipmentDate: dayjs('2025-12-15').toISOString(),
    arrivalDate: dayjs('2025-12-17').toISOString(),
    dueDate: dayjs('2025-12-20').toISOString(),
    invoiceUSD: 309283.4,
    status: 'PAID',
  };
  containers.unshift(c2, c1);

  payments.unshift(
    {
      id: 'NIZ002',
      customerId: alco.id,
      date: dayjs('2025-12-19').toISOString(),
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
      date: dayjs('2025-12-18').toISOString(),
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

export const db = {
  customers,
  contracts,
  containers,
  payments,
  fxRate: DEFAULT_FX_AED_PER_USD,
};

export type Db = typeof db;
