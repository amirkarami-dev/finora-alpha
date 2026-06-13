/**
 * Finora domain model — derived from the "Customers Accounts" trading workbook.
 *
 * Hierarchy:
 *   Customer 1─* Contract 1─* Item (goods)  1─* Container (shipment)
 *   Customer 1─* Payment
 *
 * Pricing:  unitPriceUSD = fixedLmePrice * (lmePercent / 100) + premium
 *           invoiceUSD   = unitPriceUSD * quantityMt
 */

export type Currency = 'USD' | 'AED';

export type PaymentMethod = 'TT' | 'Cash' | 'Cheque' | 'Offset' | 'Credit Note';

export type Incoterm = 'FOB' | 'CIF' | 'CFR' | 'CNF' | 'EXW' | 'DAP';

export type ContractStatus = 'ACTIVE' | 'CLOSED' | 'ON HOLD' | 'CANCELLED';

export type ContainerStatus = 'OPEN' | 'PAID' | 'OVERDUE';

export type ItemStatus = ContractStatus;

export interface Customer {
  id: string;
  name: string;
  /** Short code used in contract ids, e.g. "AM" for Alco Metal. */
  code: string;
  defaultCurrency: Currency;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  /** Day-of-net credit terms. */
  paymentTermsDays: number;
  createdAt: string;
}

export interface Item {
  id: string;
  contractId: string;
  product: string;
  quantityMt: number;
  /** Percentage of the LME reference applied (metal content / agreed %). */
  lmePercent: number;
  lmeFixed: boolean;
  /** Locked LME price (USD/MT) when lmeFixed === true. */
  fixedLmePrice: number;
  /** Premium added on top of the LME-derived price (USD/MT). */
  premium: number;
  incoterm: Incoterm;
  status: ItemStatus;
  notes?: string;
  /** Derived: quantityMt − shipped MT. Persisted for convenience. */
  remainingMt: number;
}

export interface Contract {
  id: string;
  customerId: string;
  date: string;
  destination: string;
  status: ContractStatus;
  notes?: string;
  items: Item[];
}

export interface Container {
  id: string;
  contractId: string;
  itemId: string;
  /** Container/booking reference, e.g. "MSNU8018095". */
  reference: string;
  quantityMt: number;
  lmePrice: number;
  premium: number;
  shipmentDate: string;
  arrivalDate?: string;
  dueDate: string;
  invoiceUSD: number;
  status: ContainerStatus;
}

export interface Payment {
  id: string;
  customerId: string;
  date: string;
  currency: Currency;
  amount: number;
  /** AED per 1 USD at time of payment (1 when currency is USD). */
  fxRate: number;
  amountUSD: number;
  method: PaymentMethod;
  /** Container reference / invoice this payment settles. */
  reference?: string;
  notes?: string;
}

/** A flattened invoice view, one per container shipment. */
export interface Invoice {
  id: string;
  containerReference: string;
  contractId: string;
  customerId: string;
  customerName: string;
  product: string;
  quantityMt: number;
  amountUSD: number;
  issueDate: string;
  dueDate: string;
  status: ContainerStatus;
}

/** Aggregated, dashboard-ready customer balance. */
export interface CustomerAccount extends Customer {
  totalOutstanding: number;
  overdue: number;
  totalPaid: number;
  totalInvoiced: number;
  openContainers: number;
  contractCount: number;
}

export interface DashboardKpis {
  totalOutstanding: number;
  overdue: number;
  totalPaid: number;
  totalInvoiced: number;
  activeContracts: number;
  openContainers: number;
  customers: number;
  totalVolumeMt: number;
  collectionRate: number;
}

export interface TimeSeriesPoint {
  month: string;
  invoiced: number;
  collected: number;
}

export interface ProductVolume {
  product: string;
  volumeMt: number;
  valueUSD: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
  value: number;
}

export type Locale = 'en' | 'ar' | 'fa';
export type ThemeMode = 'light' | 'dark';
