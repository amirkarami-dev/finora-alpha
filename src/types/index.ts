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

export type CustomerType = 'BUYER' | 'SUPPLIER' | 'BOTH';
export type ContractType = 'SELL' | 'PURCHASE';

export interface Partner {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

/** A partner's profit/cost share of one goods line (purchase contracts). */
export interface ItemPartner {
  partnerId: string;
  percent: number; // > 0; sum across a line ≤ 100 (company keeps 100 − sum)
}

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
  /** Approved trading credit line in USD (deterministic mock figure). */
  creditLimit: number;
  /** Trading role of this party. */
  customerType: CustomerType;
  active: boolean;
  createdAt: string;
  /** Scopes the customer portal login to this customer. At most one customer may hold this
   *  flag at a time (enforced in `createCustomer`/`updateCustomer`); cleared automatically
   *  when the customer is deactivated (`setCustomerActive`). */
  portalAccount?: boolean;
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
  /** Profit/cost-share partners (purchase contracts only; [] otherwise). */
  partners: ItemPartner[];
}

export interface Contract {
  id: string;
  customerId: string;
  contractType: ContractType;
  date: string;
  destination: string;
  status: ContractStatus;
  notes?: string;
  items: Item[];
}

/** A contract goods line carried by a container, and how much of it it holds. */
export interface ContainerGood {
  /** Source goods line on the contract. */
  contractItemId: string;
  quantityMt: number;
}

/**
 * A pure logistics shipment. Containers carry NO money/payment status — financials live
 * on trade invoices (see `Invoice`/`InvoiceItem`), linked via `InvoiceItem.containerId`.
 */
export interface Container {
  id: string;
  /** Container/booking reference, e.g. "MSNU8018095". */
  reference: string;
  /** One or more contract goods lines this container carries. */
  goods: ContainerGood[];
  loadDate: string;
  arrivalDate?: string;
  grossWeightKg?: number;
  netWeightKg?: number;
  /** Bill of Lading number (transport contract / title document). */
  blNumber?: string;
  /** Carrier booking number. */
  bookingNumber?: string;
  /** Container seal number (recorded on the B/L). */
  sealNumber?: string;
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
  /** Provisional or final trade invoice this payment settles. */
  invoiceId?: string;
  /** Money direction. 'IN' = received from customer (receivable), 'OUT' = paid to
   *  supplier. Optional for legacy rows — undefined MUST be treated as 'IN'. */
  direction?: 'IN' | 'OUT';
}

/* ------------------------------------------------------------------ *
 * Trade documents (purchase/sale × order/provisional/invoice) — see
 * docs/superpowers/specs/2026-07-05-invoices-warehouse-payments-design.md §2.
 * ------------------------------------------------------------------ */

export type InvoiceType =
  | 'PURCHASE_ORDER' | 'PURCHASE_PROVISIONAL' | 'PURCHASE_INVOICE'
  | 'SALE_ORDER' | 'SALE_PROVISIONAL' | 'SALE_INVOICE';
export type InvoiceStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
export type InvoiceSide = 'PURCHASE' | 'SALE'; // derived helper union

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  /** Source goods line on the contract. */
  contractItemId: string;
  /** Chain-stable identity that survives provisional→final conversion (`convertInvoice`'s
   *  `...it` spread carries it) and re-add-after-delete (`addInvoiceItems` reuses the chain's
   *  existing id instead of minting a new one). Warehouse documents dedupe/consume against this,
   *  not `id` (spec docs/superpowers/specs/2026-07-24-warehouse-docs-refdocitem-design.md §2/§3). */
  referenceDocumentItemId: string;
  product: string;
  quantityMt: number;
  // Copied from the contract item at insertion; read-only in ALL document types:
  lmePercent: number;
  lmeFixed: boolean;
  fixedPrice: number;   // contract Item.fixedLmePrice
  premium: number;
  // Set on provisional/final documents (kept per item even when applied to all):
  lmePrice?: number;    // LME quotation used for floating (lmeFixed=false) lines
  lmeDate?: string;     // ISO date of that quotation
  discountPercent?: number; // 0–100
  /** Line value in invoice currency; 0 when price incomplete (floating line without lmePrice). */
  amount: number;
  /** Container this line's goods were shipped in (optional while drafting). */
  containerId?: string;
  description?: string;
}

export interface Invoice {
  id: string;               // e.g. 'inv-po-0001' (prefix by type, zero-padded counter)
  invoiceNumber: string;    // e.g. 'PO-2026-0001' — auto-generated, editable while DRAFT
  invoiceType: InvoiceType;
  invoiceDate: string;      // ISO date
  contractId: string;
  customerId: string;       // auto-set from contract; immutable
  status: InvoiceStatus;
  currency: Currency;       // default 'USD'
  exchangeRate: number;     // AED per USD; 1 when currency === 'USD'
  description?: string;
  /** Document this one was converted FROM (order→provisional→invoice chain). */
  refInvoiceId?: string;
  /** Simulated e-mail send timestamp (provisional/final only). */
  sentAt?: string;
  // Persisted totals (recomputed on every item mutation):
  totalAmount: number;      // Σ item.amount
  totalDiscount: number;    // Σ discount value in currency (pre-discount − post-discount)
  totalWeightMt: number;    // Σ item.quantityMt
  createdAt: string;
  items: InvoiceItem[];
}

export interface Warehouse {
  id: string;               // 'wh-mw'
  name: string;
  code: string;
  location?: string;
  active: boolean;
}

export type InventoryDocType = 'IN' | 'OUT';

export interface InventoryDocument {
  id: string;
  docNumber: string;        // 'GRN-2026-0001' (IN) / 'GDN-2026-0001' (OUT)
  warehouseId: string;
  /** Final invoice that produced this movement (undefined for future manual docs). */
  invoiceId?: string;
  type: InventoryDocType;
  date: string;
  status: 'CONFIRMED' | 'CANCELLED';
  notes?: string;
  items: InventoryDocumentItem[];
}

export interface InventoryDocumentItem {
  id: string;
  documentId: string;
  invoiceItemId?: string;
  /** Chain-stable identity of the invoice line this movement receives/issues against — the
   *  dedupe key (differs from `invoiceItemId`, which points at one concrete row; see
   *  `InvoiceItem.referenceDocumentItemId`). */
  referenceDocumentItemId: string;
  product: string;
  quantityMt: number;
}

/** Aggregated, dashboard-ready customer balance. */
export interface CustomerAccount extends Customer {
  totalOutstanding: number;
  overdue: number;
  totalPaid: number;
  totalInvoiced: number;
  contractCount: number;
}

export interface DashboardKpis {
  totalOutstanding: number;
  overdue: number;
  totalPaid: number;
  totalInvoiced: number;
  activeContracts: number;
  customers: number;
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
export type Role = 'CEO' | 'Manager' | 'Staff' | 'Customer';

/* ------------------------------------------------------------------ *
 * Cost Centres — see docs/superpowers/specs/2026-07-24-empty-seed-and-expenses-design.md §5.
 * ------------------------------------------------------------------ */

export interface CostCentre {
  id: string;      // 'cc-0001', max-scanning
  name: string;
  code: string;     // trimmed + uppercased; immutable after create
  description?: string;
  active: boolean;
}

/* ------------------------------------------------------------------ *
 * Charges (expenses/revenues) + Claims — see
 * docs/superpowers/specs/2026-07-27-expense-revenue-claim-rework-design.md §2.
 * Replaces the old flat `Expense` entity (schema v6, no migration).
 * ------------------------------------------------------------------ */

export type ChargeDirection = 'EXPENSE' | 'REVENUE';
export type ChargeScope = 'INVOICE' | 'GENERAL';

export interface ChargeCategory {          // db.chargeCategories (flat master)
  id: string;                 // 'ccat-0001'
  name: string;
  code: string;               // trimmed+uppercased; immutable; unique WITHIN a direction
  direction: ChargeDirection; // immutable
  scope: ChargeScope;         // immutable
  description?: string;
  active: boolean;
}

export interface ChargeDoc {               // db.chargeDocs (flat)
  id: string;                 // 'chg-0001'
  direction: ChargeDirection; // immutable
  kind: ChargeScope;          // immutable
  title: string;
  invoiceId?: string;         // kind==='INVOICE'; the document it was BOOKED on; IMMUTABLE
  date: string;
  description?: string;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
  lines: ChargeLine[];        // inline
  totalUSD: number;           // SERVER-DERIVED: round(Σ lines[].amountUSD)
}

export interface ChargeLine {              // inline on ChargeDoc
  id: string;                 // 'chgline-<n>' monotonic counter
  docId: string;
  categoryId: string;         // must match doc.direction AND doc.kind === category.scope
  date: string;
  amount: number;             // INVOICE kind: SERVER-DERIVED round(Σ allocations[].amount)
  currency: Currency;
  fxRate: number;             // forced to 1 server-side when currency==='USD'
  amountUSD: number;          // SERVER-DERIVED
  costCentreId?: string;
  description?: string;
  quantityBasisMt?: number;   // SERVER-DERIVED round3(Σ allocations[].quantityMt)
  unitPriceUSD?: number;      // SERVER-DERIVED amountUSD / quantityBasisMt (cost per MT)
  allocations: ChargeAllocation[];   // [] on GENERAL; ≥1 on INVOICE
}

export interface ChargeAllocation {        // inline on ChargeLine
  id: string;                 // 'chgalloc-<n>'
  lineId: string;
  invoiceItemId: string;
  referenceDocumentItemId: string;  // SERVER-DERIVED — chain-stable key
  product: string;                  // SERVER-DERIVED snapshot
  quantityMt: number;               // SERVER-DERIVED snapshot
  amount: number;                   // editable per good
  amountUSD: number;                // SERVER-DERIVED round(amount / line.fxRate)
}

export type ClaimSide = 'EXPENSE' | 'REVENUE';
export type ClaimType = 'QUANTITY' | 'QUALITY';   // name kept, values replaced

export interface Claim {                   // db.claims (flat)
  id: string;                 // 'clm-0001'
  side: ClaimSide;            // immutable
  title: string;
  invoiceId: string;          // required; IMMUTABLE
  partyId: string;            // SERVER-DERIVED from invoice.customerId
  claimType: ClaimType;
  date: string;
  currency: Currency;
  fxRate: number;
  amount: number;             // SERVER-DERIVED round(Σ items[].amount)
  amountUSD: number;          // SERVER-DERIVED
  description?: string;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
  items: ClaimItem[];         // inline
}

export interface ClaimItem {
  id: string; claimId: string;
  invoiceItemId: string;
  referenceDocumentItemId: string;  // SERVER-DERIVED
  product: string; quantityMt: number;   // SERVER-DERIVED snapshots
  amount: number;                        // user-entered
  amountUSD: number;                     // SERVER-DERIVED
  description?: string;
}
