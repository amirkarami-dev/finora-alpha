import type {
  ChequeStatus,
  ContainerStatus,
  ContractStatus,
  Currency,
  GoodForm,
  GoodUnit,
  Incoterm,
  Locale,
  MetalType,
  PaymentMethod,
} from '@/types';

export const APP_NAME = 'Jalil-Jalal';
export const APP_TAGLINE = 'Metals & Commodities Trading, in control.';

/** Default AED per 1 USD, taken from the workbook's FX rule. */
export const DEFAULT_FX_AED_PER_USD = 3.6725;

/** Default IQD per 1 USD. Iraq's rate moves, so this is only the value prefilled in forms —
 *  every record stores the rate that was actually used. */
export const DEFAULT_FX_IQD_PER_USD = 1310;

export const CURRENCIES: Currency[] = ['USD', 'AED', 'IQD'];

/**
 * The rate to prefill when a form's currency changes. USD is the base, so it is always 1.
 *
 * A helper rather than an inline `=== 'AED' ? rate : 1` at each call site: that shape silently
 * gave IQD a rate of 1 — a 1310x error that no type check would catch, because the ternary is
 * perfectly valid for the wider union.
 */
export function defaultFxFor(currency: Currency, rates: { aed: number; iqd: number }): number {
  if (currency === 'USD') return 1;
  return currency === 'AED' ? rates.aed : rates.iqd;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  'TT',
  'Cash',
  'Cheque',
  'Offset',
  'Credit Note',
];

export const INCOTERMS: Incoterm[] = ['FOB', 'CIF', 'CFR', 'CNF', 'EXW', 'DAP'];

/** Goods master data (BaseInfo → Goods). Labels are i18n keys (`metalTypes.*`, `goodForms.*`),
 *  never rendered raw — these are the stored values. */
export const METAL_TYPES: MetalType[] = [
  'COPPER',
  'ALUMINIUM',
  'ZINC',
  'LEAD',
  'NICKEL',
  'TIN',
  'BRASS',
  'STEEL',
  'OTHER',
];

export const GOOD_FORMS: GoodForm[] = [
  'CATHODE',
  'INGOT',
  'BILLET',
  'SCRAP',
  'WIRE_ROD',
  'GRANULES',
  'POWDER',
  'OTHER',
];

/** One entry today. Every quantity in the app is MT — adding a unit means changing
 *  `utils/calc.ts` and every `*Mt` field too, so this is not a free-form list. */
export const GOOD_UNITS: GoodUnit[] = ['MT'];

export const CONTRACT_STATUSES: ContractStatus[] = [
  'ACTIVE',
  'CLOSED',
  'ON HOLD',
  'CANCELLED',
];

/** AntD tag colors keyed by status. */
export const CONTRACT_STATUS_COLOR: Record<ContractStatus, string> = {
  ACTIVE: 'green',
  CLOSED: 'default',
  'ON HOLD': 'gold',
  CANCELLED: 'red',
};

export const CONTAINER_STATUS_COLOR: Record<ContainerStatus, string> = {
  OPEN: 'processing',
  PAID: 'success',
  OVERDUE: 'error',
};

export const PAYMENT_METHOD_COLOR: Record<PaymentMethod, string> = {
  TT: 'blue',
  Cash: 'green',
  Cheque: 'geekblue',
  Offset: 'purple',
  'Credit Note': 'orange',
};

export interface LocaleMeta {
  code: Locale;
  label: string;
  englishLabel: string;
  dir: 'ltr' | 'rtl';
  flag: string;
  antdLocale: string;
  dayjsLocale: string;
}

export const LOCALES: Record<Locale, LocaleMeta> = {
  en: {
    code: 'en',
    label: 'English',
    englishLabel: 'English',
    dir: 'ltr',
    flag: '🇬🇧',
    antdLocale: 'en_US',
    dayjsLocale: 'en',
  },
  ar: {
    code: 'ar',
    label: 'العربية',
    englishLabel: 'Arabic',
    dir: 'rtl',
    flag: '🇦🇪',
    antdLocale: 'ar_EG',
    dayjsLocale: 'ar',
  },
  fa: {
    code: 'fa',
    label: 'فارسی',
    englishLabel: 'Persian',
    dir: 'rtl',
    flag: '🇮🇷',
    antdLocale: 'fa_IR',
    dayjsLocale: 'fa',
  },
  ku: {
    code: 'ku',
    label: 'کوردی',
    englishLabel: 'Kurdish (Sorani)',
    dir: 'rtl',
    // No Kurdistan flag emoji exists; the Kurdish sun stands in.
    flag: '☀️',
    // Neither AntD nor dayjs ships a Sorani locale (their `ku` is Kurmanji in Latin script), so
    // both are app-defined: `src/i18n/antd-ku.ts` and `src/i18n/dayjs-ku.ts` register 'ku'.
    antdLocale: 'ku',
    dayjsLocale: 'ku',
  },
};

export const SUPPORTED_LOCALES = Object.keys(LOCALES) as Locale[];

/**
 * Who this desk belongs to, for the footer.
 *
 * Not translated: a legal entity name, a domain and a mailbox read the same in every locale, and
 * a transliterated company name is not the name that appears on the invoice.
 */
export const COMPANY = {
  legalName: 'Jalil Jalal Metals Trading L.L.C.',
  siteUrl: 'https://metal-uae.com',
  siteLabel: 'metal-uae.com',
  email: 'jalil.jalal.metals@gmail.com',
};

/** Brand palette — shared between AntD theme tokens and charts. */
export const BRAND = {
  primary: '#b87333',
  primaryDark: '#7a4a26',
  accent: '#f4b740',
  danger: '#e5484d',
  warning: '#f5a623',
  success: '#30a46c',
  info: '#3b82f6',
};

export const CHART_PALETTE = [
  '#b87333',
  '#3b82f6',
  '#f4b740',
  '#8b5cf6',
  '#e5484d',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

export const ROUTES = {
  landing: '/',
  login: '/login',
  app: '/app',
  dashboard: '/app/dashboard',
  executive: '/app/executive',
  customers: '/app/customers',
  contracts: '/app/contracts',
  containers: '/app/containers',
  purchase: '/app/invoices/purchase',
  sale: '/app/invoices/sale',
  warehouse: '/app/warehouse',
  payments: '/app/payments',
  transfers: '/app/transfers',
  exchange: '/app/exchange',
  expenses: '/app/expenses',
  revenues: '/app/revenues',
  claims: '/app/claims',
  reports: '/app/reports',
  settings: '/app/settings',
  partners: '/app/partners',
  portal: '/app/portal',
  baseInfo: '/app/base-info',
  users: '/app/users',
  develop: '/app/develop',
} as const;

/**
 * Every cheque status, in lifecycle order. A plain list rather than a transition map: any status
 * may follow any other, because a cheque's status is a statement about the real world and the
 * real world can be corrected. What is guarded is the money — entering PAID demands a live
 * account, leaving PAID drops it — not the shape of the graph.
 */
export const CHEQUE_STATUSES: ChequeStatus[] = ['PENDING', 'PAID', 'RETURNED', 'EXPIRED', 'CHANGED'];
