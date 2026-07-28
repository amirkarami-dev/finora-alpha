import type {
  ContainerStatus,
  ContractStatus,
  Currency,
  Incoterm,
  Locale,
  PaymentMethod,
} from '@/types';

export const APP_NAME = 'Finora';
export const APP_TAGLINE = 'Metals & Commodities Trading, in control.';

/** Default AED per 1 USD, taken from the workbook's FX rule. */
export const DEFAULT_FX_AED_PER_USD = 3.6725;

export const CURRENCIES: Currency[] = ['USD', 'AED'];

export const PAYMENT_METHODS: PaymentMethod[] = [
  'TT',
  'Cash',
  'Cheque',
  'Offset',
  'Credit Note',
];

export const INCOTERMS: Incoterm[] = ['FOB', 'CIF', 'CFR', 'CNF', 'EXW', 'DAP'];

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
};

export const SUPPORTED_LOCALES = Object.keys(LOCALES) as Locale[];

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
  expenses: '/app/expenses',
  reports: '/app/reports',
  settings: '/app/settings',
  partners: '/app/partners',
  portal: '/app/portal',
  baseInfo: '/app/base-info',
} as const;
