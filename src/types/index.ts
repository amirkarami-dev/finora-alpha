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

/** USD is the base currency — every `*USD` field is computed as `amount / fxRate`, so a
 *  non-USD currency always carries a rate expressed as "units per 1 USD". */
export type Currency = 'USD' | 'AED' | 'IQD';

export type PaymentMethod = 'TT' | 'Cash' | 'Cheque' | 'Offset' | 'Credit Note';

export type Incoterm = 'FOB' | 'CIF' | 'CFR' | 'CNF' | 'EXW' | 'DAP';

/** Base material of a `Good`. Closed set, like `Incoterm` — 'OTHER' is the escape hatch so a
 *  new alloy never blocks entry while waiting on a code change. */
export type MetalType =
  | 'COPPER'
  | 'ALUMINIUM'
  | 'ZINC'
  | 'LEAD'
  | 'NICKEL'
  | 'TIN'
  | 'BRASS'
  | 'STEEL'
  | 'OTHER';

/** Physical form a `Good` ships in. */
export type GoodForm =
  | 'CATHODE'
  | 'INGOT'
  | 'BILLET'
  | 'SCRAP'
  | 'WIRE_ROD'
  | 'GRANULES'
  | 'POWDER'
  | 'OTHER';

/** Unit of measure. MT only today — see the note on `Good.unit`. */
export type GoodUnit = 'MT';

export type ContractStatus = 'ACTIVE' | 'CLOSED' | 'ON HOLD' | 'CANCELLED';

export type ContainerStatus = 'OPEN' | 'PAID' | 'OVERDUE';

export type ItemStatus = ContractStatus;

/** 'EMPLOYEE' and 'OTHER' are people who are not trading counterparties: no credit limit, no
 *  payment terms, no contracts. `ContractFormModal`'s picker allows only BUYER/BOTH or
 *  SUPPLIER/BOTH, so both are excluded from contracts by that existing allow-list rather than
 *  by a new check. See `NON_TRADING_TYPES` in `CustomerFormModal`. */
export type CustomerType = 'BUYER' | 'SUPPLIER' | 'BOTH' | 'EMPLOYEE' | 'OTHER';
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

/** INVOICE settles specific trade documents through items; GENERAL is money moved with a person
 *  and no invoice behind it, which sits on their account as an on-account balance. */
export type PaymentType = 'INVOICE' | 'GENERAL';

/** DRAFT is an open payment being built up; only CONFIRMED money counts towards balances,
 *  KPIs and aging. Confirming is reversible — reopening returns it to DRAFT. */
export type PaymentStatus = 'DRAFT' | 'CONFIRMED';

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

  /* ---- header/items rework. All three are OPTIONAL because rows written before it exist ---- *
   * and must keep working. Read them through `paymentType()` / `paymentStatus()` in api.ts,
   * never raw: a legacy row has no `status`, and treating that as anything but CONFIRMED would
   * silently erase real money from every balance in the app.                                   */

  /** undefined on legacy rows → derived from whether `invoiceId` is set. */
  type?: PaymentType;
  /** undefined on legacy rows → CONFIRMED. */
  status?: PaymentStatus;
  /**
   * Settlement lines. When present, the header's `amountUSD` is SERVER-DERIVED as their sum —
   * that is the figure every balance reads. `amount`/`currency` on the header stay the
   * user-declared control total the items are checked against.
   */
  items?: PaymentItem[];
}

export interface PaymentItem {
  id: string;              // 'payitem-<n>', monotonic counter
  paymentId: string;
  /** The trade document this line settles. ABSENT on a GENERAL payment's lines, which are money
   *  on account and settle no particular document — their side comes from the header's
   *  `direction` instead. */
  invoiceId?: string;
  date: string;
  amount: number;          // SERVER-DERIVED round(Σ allocations[].amount)
  currency: Currency;
  fxRate: number;          // forced to 1 when currency === 'USD'
  amountUSD: number;       // SERVER-DERIVED
  method: PaymentMethod;
  /** Required when method is 'TT' — which company account the money moved through. */
  bankAccountId?: string;
  /** Required when method is 'Cheque'. One cheque may settle lines on several invoices, which
   *  is why this points at a shared `Cheque` rather than embedding its fields. */
  chequeId?: string;
  allocations: PaymentItemAllocation[];
}

/** How much of a payment line lands on one invoice item — the "invoice item payment item" of
 *  the spec. Auto-filled from the first item down, each taking what it still owes. */
export interface PaymentItemAllocation {
  id: string;              // 'payalloc-<n>'
  paymentItemId: string;
  invoiceItemId: string;
  referenceDocumentItemId: string;  // SERVER-DERIVED — survives provisional→final conversion
  product: string;                  // SERVER-DERIVED snapshot
  amount: number;
  amountUSD: number;                // SERVER-DERIVED
}

/* ------------------------------------------------------------------ *
 * Money movement vs. exchange valuation — deliberately SEPARATE concepts (spec §1).
 *
 * A MoneyTransfer moves money between company-owned accounts. An ExchangeRevaluation restates
 * what a foreign-currency balance is worth at a new rate. A transfer can exist with no gain or
 * loss attached, and a revaluation can exist with no invoice, contract or person behind it.
 * ------------------------------------------------------------------ */

export type TransferStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export interface MoneyTransfer {
  id: string;              // 'tr-0001', max-scanning
  number: string;          // 'TR-0001'
  date: string;
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number;
  toAmount: number;
  /** How many `toCurrency` units one `fromCurrency` unit buys: toAmount = fromAmount × rate.
   *  1 for a same-currency transfer. */
  exchangeRate: number;
  /** SERVER-DERIVED value of `fromAmount` in the base currency (USD). */
  baseAmount: number;
  status: TransferStatus;
  notes?: string;
  /** OPTIONAL business links. A transfer is valid with none (spec §5, §22.4-6). */
  allocations: MoneyTransferAllocation[];
}

/** Optionally ties part of a transfer to a trade document. One transfer may span several
 *  invoices, and may be left partly or wholly unallocated (spec §11, §12). */
export interface MoneyTransferAllocation {
  id: string;              // 'tralloc-<n>'
  transferId: string;
  invoiceId?: string;
  invoiceItemId?: string;
  amount: number;
  currency: Currency;
  baseAmount: number;      // SERVER-DERIVED
  baseCurrency: Currency;  // always the company base
}

export type ExchangeGainLossType = 'GAIN' | 'LOSS';

/** Unrealized = still holding the currency, only its value moved. Realized = actually
 *  converted or settled at a different rate (spec §15). */
export type ExchangeRealization = 'UNREALIZED' | 'REALIZED';

export interface ExchangeRevaluation {
  id: string;              // 'rev-0001'
  number: string;          // 'REV-0001'
  date: string;
  accountId: string;
  currency: Currency;
  /**
   * The rate this balance was LAST carried at — the previous confirmed revaluation's new rate,
   * or the account's opening rate when there is none. Taking it from the book rather than from
   * the original transfer is what stops repeated revaluations double-counting (spec §16).
   */
  oldExchangeRate: number;
  newExchangeRate: number;
  /** Balance in the account's own currency at the moment of revaluation. */
  balance: number;
  oldBaseAmount: number;   // SERVER-DERIVED balance / oldExchangeRate
  newBaseAmount: number;   // SERVER-DERIVED balance / newExchangeRate
  /** SERVER-DERIVED newBaseAmount − oldBaseAmount. Positive is a gain. */
  gainLossAmount: number;
  type: ExchangeGainLossType;
  realization: ExchangeRealization;
  status: TransferStatus;
  notes?: string;
  allocations: ExchangeRevaluationAllocation[];
}

/** Optional traceability back to what produced the balance (spec §8). Every reference is
 *  optional, so a standalone cash-safe revaluation is entirely valid. */
export interface ExchangeRevaluationAllocation {
  id: string;              // 'revalloc-<n>'
  revaluationId: string;
  /** The money that fed the account: a transfer OR a payment, never both. */
  moneyTransferId?: string;
  paymentId?: string;
  invoiceId?: string;
  invoiceItemId?: string;
  originalBaseAmount: number;
  revaluedBaseAmount: number;
  gainLossAmount: number;
}

export type ChequeType = 'NORMAL' | 'SECURITY';

/** PENDING → PAID (cleared), RETURNED (bounced), EXPIRED (past due, uncleared) or CHANGED
 *  (replaced by another cheque). */
export type ChequeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'RETURNED' | 'CHANGED';

export interface Cheque {
  id: string;              // 'chq-0001', max-scanning
  type: ChequeType;
  number: string;
  /** Issuing bank, as written on the cheque — free text, not a company account. Cheque numbers
   *  are unique per issuing bank: two banks may legitimately issue the same number. */
  bankName: string;
  dueDate: string;
  amount: number;
  currency: Currency;
  ownerName: string;
  /** The company account it was finally banked into. Set when the status becomes PAID. */
  bankAccountId?: string;
  status: ChequeStatus;
  notes?: string;
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
  /** Sale-only receivable, floored at zero. Ageing, DSO, credit limits and the portal are all
   *  built on this — do not confuse it with `netBalance`. */
  totalOutstanding: number;
  overdue: number;
  totalPaid: number;
  totalInvoiced: number;
  /** Two-sided position: positive = they owe us, negative = we owe them. Not floored.
   *  See `personLedgers` in api.ts for the exact terms. */
  netBalance: number;
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

export type FinancialAccountType = 'BANK' | 'CASH_SAFE';

/**
 * A company-owned account that holds money — a bank account or a cash safe.
 *
 * ONE entity with a `type` discriminator rather than separate Bank and CashSafe tables. Money
 * transfers and exchange revaluations reference an account by id, and two id spaces would make
 * `accountId` ambiguous; the payments spec's §3 also asks for a generic `FinancialAccount` that
 * "can represent Bank / CashSafe". The BaseInfo UI still shows them as two tabs, because that
 * is how the desk thinks about them.
 *
 * The bank-only fields are optional on the type and required by `createFinancialAccount` when
 * `type === 'BANK'` — a cash safe has no IBAN.
 */
export interface FinancialAccount {
  id: string;              // 'fa-0001', max-scanning
  name: string;
  type: FinancialAccountType;   // immutable after create
  currency: Currency;           // immutable after create — see the guard in `updateFinancialAccount`
  active: boolean;
  description?: string;
  /** BANK only, required. */
  accountNumber?: string;
  /** BANK only, required. */
  iban?: string;
  /** BANK only, optional. */
  swiftCode?: string;
  /** BANK only, optional. */
  address?: string;
}

/**
 * A tradeable product, as master data (BaseInfo → Goods).
 *
 * Deliberately holds ONLY facts about the material itself — nothing commercial. LME percent,
 * premium, incoterm and quantity are terms of a specific deal, so they live on `Item` (a
 * contract line), not here: the same good sold to two customers carries two different
 * premiums.
 *
 * This is a reference list, not a foreign key. `Item.product` stays a plain string, and the
 * goods list feeds the autocomplete in `ItemFormModal` so names stay spelled consistently
 * (`ProductVolume` groups by that text, so a typo splits one product into two report rows).
 */
export interface Good {
  id: string;         // 'good-0001', max-scanning
  name: string;
  code: string;       // trimmed + uppercased; immutable after create; unique
  metalType: MetalType;
  /** Physical form. Optional — not every good has a meaningful one. */
  form?: GoodForm;
  /** Unit of measure. Every quantity in the app is MT (`quantityMt`, `round3`), so adding a
   *  second unit here would ALSO mean changing `utils/calc.ts` and every `*Mt` field. */
  unit: GoodUnit;
  /** Customs tariff classification, e.g. '7403.11'. Fixed per product. */
  hsCode?: string;
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
  /**
   * Who this line is for — the person the money went to or came from.
   *
   * REQUIRED by `buildChargeLine`, but OPTIONAL on the type: lines saved before this rule
   * existed have none, and marking it required would make every one of them invalid at runtime
   * while TypeScript stayed quiet. They render as "—" and must pick a person the next time
   * they are edited, which migrates the data forward instead of destroying it.
   */
  personId?: string;
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

/** A claim is named after the document it is filed against: a SALE claim sits on a sale
 *  invoice, a PURCHASE claim on a purchase invoice. The side IS the invoice side — there is
 *  no mapping. (Before 2026-08-04 these were 'EXPENSE'/'REVENUE' and mapped to the OPPOSITE
 *  invoice side; `loadDb` re-derives every stored claim's side from its own invoice.) */
export type ClaimSide = 'SALE' | 'PURCHASE';
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
