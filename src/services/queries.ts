import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChargeDirection, ChargeScope, ClaimSide, InventoryDocType, InvoiceSide, InvoiceType } from '@/types';
import * as api from './api';

export const qk = {
  accounts: ['accounts'] as const,
  account: (id: string) => ['account', id] as const,
  customers: ['customers'] as const,
  productNames: ['productNames'] as const,
  contracts: ['contracts'] as const,
  contract: (id: string) => ['contract', id] as const,
  contractsByCustomer: (id: string) => ['contracts', 'customer', id] as const,
  containers: ['containers'] as const,
  containersByContract: (id: string) => ['containers', 'contract', id] as const,
  containerOptions: ['containerOptions'] as const,
  payments: ['payments'] as const,
  paymentsByCustomer: (id: string) => ['payments', 'customer', id] as const,
  kpis: ['kpis'] as const,
  cashflow: ['cashflow'] as const,
  productVolumes: ['productVolumes'] as const,
  statusBreakdown: ['statusBreakdown'] as const,
  aging: ['aging'] as const,
  executiveSummary: ['executiveSummary'] as const,
  customerPortal: (id: string) => ['customerPortal', id] as const,
  /** The single customer resolved to the customer-portal login (spec §3), independent of
   *  which id it currently is. */
  portalCustomer: ['portalCustomer'] as const,
  receivableInvoices: (customerId?: string) => ['receivableInvoices', customerId ?? 'all'] as const,
  partners: ['partners'] as const,
  // ---- Trade documents (purchase/sale × order/provisional/invoice), spec §8 ----
  tradeInvoices: (side: InvoiceSide) => ['tradeInvoices', side] as const,
  tradeInvoice: (id: string) => ['tradeInvoice', id] as const,
  contractRemaining: (contractId: string, side: InvoiceSide, invoiceId?: string) =>
    ['contractRemaining', contractId, side, invoiceId] as const,
  warehouses: ['warehouses'] as const,
  inventory: ['inventory'] as const,
  stock: ['stock'] as const,
  inventoryDocLines: (invoiceId: string) => ['inventoryDocLines', invoiceId] as const,
  invoiceOptions: ['invoiceOptions'] as const,
  inventorySourceInvoices: (type: InventoryDocType) => ['inventorySourceInvoices', type] as const,
  // ---- Cost centres (spec §5) ----
  costCentres: ['costCentres'] as const,
  // ---- Charge categories (design spec §4-§5) ----
  chargeCategories: (direction?: ChargeDirection) => ['chargeCategories', direction ?? 'all'] as const,
  // ---- Charge documents (design spec §4-§5) ----
  chargeDocs: (direction: ChargeDirection, kind?: ChargeScope) =>
    ['chargeDocs', direction, kind ?? 'all'] as const,
  chargeDoc: (id: string) => ['chargeDoc', id] as const,
  // `side` is optional — a charge document is side-agnostic (see `getChargeSourceInvoices`);
  // 'ALL' keeps the both-sides result in its own cache entry. The bare-prefix invalidation
  // `['chargeSourceInvoices']` in `useInvalidateInvoices` still covers every variant.
  chargeSourceInvoices: (side?: InvoiceSide) => ['chargeSourceInvoices', side ?? 'ALL'] as const,
  // ---- Claims (design spec §4-§5) ----
  claims: (side?: ClaimSide) => ['claims', side ?? 'all'] as const,
  claim: (id: string) => ['claim', id] as const,
  claimSourceInvoices: (side: ClaimSide) => ['claimSourceInvoices', side] as const,
  // ---- Invoice charge summary (design spec §4-§5, Phase 7) ----
  invoiceChargeSummary: (invoiceId: string) => ['invoiceChargeSummary', invoiceId] as const,
};

export const useAccounts = () => useQuery({ queryKey: qk.accounts, queryFn: api.getAccounts });
export const useAccount = (id: string) =>
  useQuery({ queryKey: qk.account(id), queryFn: () => api.getAccount(id), enabled: !!id });

export const useContracts = () => useQuery({ queryKey: qk.contracts, queryFn: api.getContracts });
export const useContract = (id: string) =>
  useQuery({ queryKey: qk.contract(id), queryFn: () => api.getContract(id), enabled: !!id });
export const useContractsByCustomer = (id: string) =>
  useQuery({
    queryKey: qk.contractsByCustomer(id),
    queryFn: () => api.getContractsByCustomer(id),
    enabled: !!id,
  });

export const useContainers = () =>
  useQuery({ queryKey: qk.containers, queryFn: api.getContainers });
export const useContainersByContract = (id: string) =>
  useQuery({
    queryKey: qk.containersByContract(id),
    queryFn: () => api.getContainersByContract(id),
    enabled: !!id,
  });
export const useContainerOptions = () =>
  useQuery({ queryKey: qk.containerOptions, queryFn: api.getContainerOptions });

export const usePayments = () => useQuery({ queryKey: qk.payments, queryFn: api.getPayments });
export const usePaymentsByCustomer = (id: string) =>
  useQuery({
    queryKey: qk.paymentsByCustomer(id),
    queryFn: () => api.getPaymentsByCustomer(id),
    enabled: !!id,
  });

export const useKpis = () => useQuery({ queryKey: qk.kpis, queryFn: api.getKpis });
export const useCashflow = () => useQuery({ queryKey: qk.cashflow, queryFn: api.getCashflowSeries });
export const useProductVolumes = () =>
  useQuery({ queryKey: qk.productVolumes, queryFn: api.getProductVolumes });
export const useStatusBreakdown = () =>
  useQuery({ queryKey: qk.statusBreakdown, queryFn: api.getContractStatusBreakdown });
export const useAging = () => useQuery({ queryKey: qk.aging, queryFn: api.getAgingBuckets });
export const useExecutiveSummary = () =>
  useQuery({ queryKey: qk.executiveSummary, queryFn: api.getExecutiveSummary });
export const useCustomerPortal = (id: string) =>
  useQuery({
    queryKey: qk.customerPortal(id),
    queryFn: () => api.getCustomerPortalSummary(id),
    enabled: !!id,
  });

/**
 * Resolves the customer this login's portal is scoped to (spec §3): the customer whose
 * `portalAccount` flag is set AND is `active`. A query, not a synchronous read off the auth
 * user — the flag lives on the customer record now, so it can move between customers (or be
 * cleared entirely) without a re-login.
 */
export const usePortalCustomer = () =>
  useQuery({
    queryKey: qk.portalCustomer,
    queryFn: async () => {
      const customers = await api.getCustomers();
      return customers.find((c) => c.portalAccount && c.active) ?? null;
    },
  });

export const useReceivableInvoices = (customerId?: string) =>
  useQuery({
    queryKey: qk.receivableInvoices(customerId),
    queryFn: () => api.getReceivableInvoices(customerId),
  });

export const useCustomers = () => useQuery({ queryKey: qk.customers, queryFn: api.getCustomers });
export const usePartners = () => useQuery({ queryKey: qk.partners, queryFn: api.getPartners });
export const useProductNames = () =>
  useQuery({ queryKey: qk.productNames, queryFn: api.getProductNames });

/* ----------------------------- Mutations ---------------------------- */
/**
 * Editing a contract or its goods changes contract rows, customer balances and
 * the dashboard aggregates, so we invalidate every read derived from `db`.
 * A bare `['contracts']` key prefix-matches the by-customer queries too.
 */
function useInvalidateTrade() {
  const qc = useQueryClient();
  return (contractId?: string) => {
    qc.invalidateQueries({ queryKey: qk.contracts });
    if (contractId) qc.invalidateQueries({ queryKey: qk.contract(contractId) });
    qc.invalidateQueries({ queryKey: qk.accounts });
    qc.invalidateQueries({ queryKey: qk.kpis });
    qc.invalidateQueries({ queryKey: qk.statusBreakdown });
    qc.invalidateQueries({ queryKey: qk.productVolumes });
    // A product rename flows into the container `product` column and invoices.
    qc.invalidateQueries({ queryKey: qk.containers });
    qc.invalidateQueries({ queryKey: qk.aging });
    qc.invalidateQueries({ queryKey: qk.executiveSummary });
  };
}

export const useCreateContract = () => {
  const invalidate = useInvalidateTrade();
  return useMutation({
    mutationFn: (input: api.ContractInput) => api.createContract(input),
    onSuccess: (row) => invalidate(row.id),
  });
};

export const useUpdateContract = () => {
  const invalidate = useInvalidateTrade();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.ContractInput }) =>
      api.updateContract(id, input),
    onSuccess: (row) => invalidate(row.id),
  });
};

export const useCreateItem = () => {
  const invalidate = useInvalidateTrade();
  return useMutation({
    mutationFn: ({ contractId, input }: { contractId: string; input: api.ItemInput }) =>
      api.createItem(contractId, input),
    onSuccess: (item) => invalidate(item.contractId),
  });
};

export const useUpdateItem = () => {
  const invalidate = useInvalidateTrade();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.ItemInput }) => api.updateItem(id, input),
    onSuccess: (item) => invalidate(item.contractId),
  });
};

/**
 * A container's goods can be reassigned on edit, which shifts what invoice lines/contracts
 * derive (goods summary, remaining MT, container pickers) — invalidate broadly, including
 * both trade-invoice lists (spec §8).
 */
function useInvalidateContainers() {
  const invalidate = useInvalidateTrade();
  const qc = useQueryClient();
  return () => {
    invalidate();
    qc.invalidateQueries({ queryKey: qk.containerOptions });
    qc.invalidateQueries({ queryKey: qk.tradeInvoices('PURCHASE') });
    qc.invalidateQueries({ queryKey: qk.tradeInvoices('SALE') });
  };
}

export const useCreateContainer = () => {
  const invalidate = useInvalidateContainers();
  return useMutation({
    mutationFn: (input: api.ContainerInput) => api.createContainer(input),
    // A container is no longer tied to a single contract (spec §2) — invalidate broadly.
    onSuccess: () => invalidate(),
  });
};

export const useUpdateContainer = () => {
  const invalidate = useInvalidateContainers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.ContainerInput }) =>
      api.updateContainer(id, input),
    onSuccess: () => invalidate(),
  });
};

/* -------------------- Customer & Partner mutations ------------------- */
function useInvalidateCustomers() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: qk.customers });
    qc.invalidateQueries({ queryKey: qk.accounts });
    qc.invalidateQueries({ queryKey: qk.kpis });
    qc.invalidateQueries({ queryKey: qk.executiveSummary });
    // Unconditional: moving `portalAccount` from customer A to B (or deactivating the
    // flagged customer) changes WHO the portal resolves to, not just the edited customer's
    // own cache — a bare `if (id)` here would leave the other customer's link stale.
    qc.invalidateQueries({ queryKey: qk.portalCustomer });
    if (id) {
      qc.invalidateQueries({ queryKey: qk.account(id) });
      qc.invalidateQueries({ queryKey: qk.customerPortal(id) });
    }
  };
}

export const useCreateCustomer = () => {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (input: api.CustomerInput) => api.createCustomer(input),
    onSuccess: (c) => invalidate(c.id),
  });
};

export const useUpdateCustomer = () => {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.CustomerInput }) =>
      api.updateCustomer(id, input),
    onSuccess: (c) => invalidate(c.id),
  });
};

export const useSetCustomerActive = () => {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.setCustomerActive(id, active),
    onSuccess: (c) => invalidate(c.id),
  });
};

function useInvalidatePartners() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.partners });
}

export const useCreatePartner = () => {
  const invalidate = useInvalidatePartners();
  return useMutation({ mutationFn: (input: api.PartnerInput) => api.createPartner(input), onSuccess: invalidate });
};

export const useUpdatePartner = () => {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.PartnerInput }) => api.updatePartner(id, input),
    onSuccess: invalidate,
  });
};

export const useSetPartnerActive = () => {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.setPartnerActive(id, active),
    onSuccess: invalidate,
  });
};

/* ---------------- Trade documents + warehouse + inventory (spec §8) --------------- */

export const useTradeInvoices = (side: InvoiceSide) =>
  useQuery({ queryKey: qk.tradeInvoices(side), queryFn: () => api.getTradeInvoices(side) });

export const useTradeInvoice = (id: string) =>
  useQuery({
    queryKey: qk.tradeInvoice(id),
    queryFn: () => api.getTradeInvoice(id),
    enabled: !!id,
  });

export const useContractRemaining = (contractId: string, side: InvoiceSide, invoiceId?: string) =>
  useQuery({
    queryKey: qk.contractRemaining(contractId, side, invoiceId),
    queryFn: () => api.getContractRemaining(contractId, side, invoiceId),
    enabled: !!contractId,
  });

export const useWarehouses = () =>
  useQuery({ queryKey: qk.warehouses, queryFn: api.getWarehouses });

export const useInventoryDocuments = () =>
  useQuery({ queryKey: qk.inventory, queryFn: api.getInventoryDocuments });

export const useStockLevels = () => useQuery({ queryKey: qk.stock, queryFn: api.getStockLevels });

/**
 * Trade-document mutations touch the invoice lists/detail, the contract's uninvoiced-qty
 * figure, and — on confirm/cancel or a payment — every receivables aggregate (mirrors
 * `useInvalidateTrade`/`useInvalidateCustomers`). Confirming/cancelling no longer touches
 * warehouse stock (warehouse spec §4) — those queries are invalidated separately by
 * `useInvalidateWarehouses` — but it DOES change which invoices are chain-leaf CONFIRMED and
 * what the documents table's id→number label map must resolve, so `qk.invoiceOptions` is
 * invalidated here instead.
 */
function useInvalidateInvoices() {
  const qc = useQueryClient();
  return (opts?: { side?: InvoiceSide; invoiceId?: string; contractId?: string; customerId?: string }) => {
    if (opts?.side) qc.invalidateQueries({ queryKey: qk.tradeInvoices(opts.side) });
    else {
      qc.invalidateQueries({ queryKey: qk.tradeInvoices('PURCHASE') });
      qc.invalidateQueries({ queryKey: qk.tradeInvoices('SALE') });
    }
    if (opts?.invoiceId) qc.invalidateQueries({ queryKey: qk.tradeInvoice(opts.invoiceId) });
    if (opts?.contractId && opts?.side) {
      // 3-element prefix (no invoiceId) so it matches every `useContractRemaining` caller
      // regardless of which invoiceId (if any) they passed as the exclude id.
      qc.invalidateQueries({ queryKey: ['contractRemaining', opts.contractId, opts.side] });
    }
    qc.invalidateQueries({ queryKey: qk.invoiceOptions });
    // Bare prefixes: confirming/cancelling/converting changes which invoices are chain-leaf
    // CONFIRMED, which is exactly what the Receipt/Issue invoice picker and its line list are
    // keyed on (getInventorySourceInvoices / getInvoiceLinesForInventory) — without these the
    // picker can keep offering a just-converted predecessor for up to its 60s staleTime.
    qc.invalidateQueries({ queryKey: ['inventorySourceInvoices'] });
    qc.invalidateQueries({ queryKey: ['inventoryDocLines'] });
    // Same gap, same reason, for the charge/claim side (design spec §5's "pre-existing gap to
    // close"): the expense/revenue/claim invoice pickers are keyed on `getChargeSourceInvoices`/
    // `getClaimSourceInvoices`, which are `chainLeafDocs`-derived — without these, converting a
    // provisional leaves the dead predecessor selectable for up to its 60s staleTime. The
    // invoice charge summary is chain-derived too, so a conversion moves which document shows
    // the booked charges. BARE PREFIXES only: never keyed off an id from a mutation result,
    // since the server may have stripped it (the bare-prefix rule documented below).
    qc.invalidateQueries({ queryKey: ['chargeSourceInvoices'] });
    qc.invalidateQueries({ queryKey: ['claimSourceInvoices'] });
    qc.invalidateQueries({ queryKey: ['invoiceChargeSummary'] });
    qc.invalidateQueries({ queryKey: qk.payments });
    qc.invalidateQueries({ queryKey: qk.accounts });
    qc.invalidateQueries({ queryKey: qk.kpis });
    qc.invalidateQueries({ queryKey: qk.executiveSummary });
    // Every receivables view is invoice-derived (spec §6) — invalidate them together. A bare
    // ['receivableInvoices'] prefix matches every customerId-scoped variant too.
    qc.invalidateQueries({ queryKey: ['receivableInvoices'] });
    qc.invalidateQueries({ queryKey: qk.productVolumes });
    qc.invalidateQueries({ queryKey: qk.aging });
    qc.invalidateQueries({ queryKey: qk.cashflow });
    if (opts?.customerId) qc.invalidateQueries({ queryKey: qk.customerPortal(opts.customerId) });
  };
}

function invalidateArgsFor(invoice: {
  id: string;
  invoiceType: InvoiceType;
  contractId: string;
  customerId: string;
}) {
  const side: InvoiceSide = invoice.invoiceType.startsWith('PURCHASE') ? 'PURCHASE' : 'SALE';
  return { side, invoiceId: invoice.id, contractId: invoice.contractId, customerId: invoice.customerId };
}

export const useCreateInvoice = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: (input: api.InvoiceInput) => api.createInvoice(input),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useUpdateInvoiceHeader = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.InvoiceHeaderPatch }) =>
      api.updateInvoiceHeader(id, patch),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useAddInvoiceItems = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: ({ invoiceId, items }: { invoiceId: string; items: api.InvoiceItemInput[] }) =>
      api.addInvoiceItems(invoiceId, items),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useUpdateInvoiceItem = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: ({
      invoiceId,
      itemId,
      patch,
    }: {
      invoiceId: string;
      itemId: string;
      patch: api.InvoiceItemPatch;
    }) => api.updateInvoiceItem(invoiceId, itemId, patch),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useRemoveInvoiceItem = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: ({ invoiceId, itemId }: { invoiceId: string; itemId: string }) =>
      api.removeInvoiceItem(invoiceId, itemId),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useApplyLmePrice = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: api.ApplyLmePriceInput }) =>
      api.applyLmePrice(invoiceId, input),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useConfirmInvoice = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: (id: string) => api.confirmInvoice(id),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useCancelInvoice = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: (id: string) => api.cancelInvoice(id),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useConvertInvoice = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: ({ id, targetType }: { id: string; targetType: InvoiceType }) =>
      api.convertInvoice(id, targetType),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useMarkInvoiceSent = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: (id: string) => api.markInvoiceSent(id),
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
  });
};

export const useApplyContainerToAll = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: ({ invoiceId, containerId }: { invoiceId: string; containerId: string }) =>
      api.applyContainerToAll(invoiceId, containerId),
    onSuccess: ({ invoice }) => invalidate(invalidateArgsFor(invoice)),
  });
};

function useInvalidateWarehouses() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.warehouses });
    qc.invalidateQueries({ queryKey: qk.stock });
    qc.invalidateQueries({ queryKey: qk.inventory });
    // Bare prefixes so every invoiceId/type-scoped variant is caught too.
    qc.invalidateQueries({ queryKey: ['inventoryDocLines'] });
    qc.invalidateQueries({ queryKey: ['inventorySourceInvoices'] });
  };
}

export const useInventoryDocLines = (invoiceId: string) =>
  useQuery({
    queryKey: qk.inventoryDocLines(invoiceId),
    queryFn: () => api.getInvoiceLinesForInventory(invoiceId),
    enabled: !!invoiceId,
  });

export const useInvoiceOptions = () =>
  useQuery({ queryKey: qk.invoiceOptions, queryFn: api.getInvoiceOptions });

export const useInventorySourceInvoices = (type: InventoryDocType) =>
  useQuery({
    queryKey: qk.inventorySourceInvoices(type),
    queryFn: () => api.getInventorySourceInvoices(type),
  });

export const useCreateInventoryDocument = () => {
  const invalidate = useInvalidateWarehouses();
  return useMutation({
    mutationFn: (input: api.InventoryDocInput) => api.createInventoryDocument(input),
    onSuccess: invalidate,
  });
};

export const useCancelInventoryDocument = () => {
  const invalidate = useInvalidateWarehouses();
  return useMutation({
    mutationFn: (id: string) => api.cancelInventoryDocument(id),
    onSuccess: invalidate,
  });
};

export const useCreateWarehouse = () => {
  const invalidate = useInvalidateWarehouses();
  return useMutation({
    mutationFn: (input: api.WarehouseInput) => api.createWarehouse(input),
    onSuccess: invalidate,
  });
};

export const useUpdateWarehouse = () => {
  const invalidate = useInvalidateWarehouses();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.WarehouseInput }) =>
      api.updateWarehouse(id, input),
    onSuccess: invalidate,
  });
};

export const useSetWarehouseActive = () => {
  const invalidate = useInvalidateWarehouses();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.setWarehouseActive(id, active),
    onSuccess: invalidate,
  });
};

export const useCreatePayment = () => {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: (input: api.PaymentInput) => api.createPayment(input),
    onSuccess: (payment) =>
      invalidate({
        invoiceId: payment.invoiceId,
        customerId: payment.customerId,
      }),
  });
};

/* ---------------------------- Cost centres (spec §5) ---------------------------- */

export const useCostCentres = () =>
  useQuery({ queryKey: qk.costCentres, queryFn: api.getCostCentres });

function useInvalidateCostCentres() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.costCentres });
}

export const useCreateCostCentre = () => {
  const invalidate = useInvalidateCostCentres();
  return useMutation({
    mutationFn: (input: api.CostCentreInput) => api.createCostCentre(input),
    onSuccess: invalidate,
  });
};

export const useUpdateCostCentre = () => {
  const invalidate = useInvalidateCostCentres();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.CostCentreInput }) =>
      api.updateCostCentre(id, input),
    onSuccess: invalidate,
  });
};

export const useSetCostCentreActive = () => {
  const invalidate = useInvalidateCostCentres();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.setCostCentreActive(id, active),
    onSuccess: invalidate,
  });
};

/* ------------------------- Charge categories (design spec §4-§5) ------------------------- */

export const useChargeCategories = (direction?: ChargeDirection) =>
  useQuery({
    queryKey: qk.chargeCategories(direction),
    queryFn: () => api.getChargeCategories(direction),
  });

// Bare-prefix invalidation (queries.ts precedent above, spec §5): covers every
// `['chargeCategories', direction]` entry regardless of which direction mutated. Also
// invalidates `['chargeDocs']`/`['chargeDoc']` — a category rename/deactivate changes the label
// rendered on every doc row that references it.
function useInvalidateChargeCategories() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['chargeCategories'] });
    qc.invalidateQueries({ queryKey: ['chargeDocs'] });
    qc.invalidateQueries({ queryKey: ['chargeDoc'] });
  };
}

export const useCreateChargeCategory = () => {
  const invalidate = useInvalidateChargeCategories();
  return useMutation({
    mutationFn: (input: api.ChargeCategoryInput) => api.createChargeCategory(input),
    onSuccess: invalidate,
  });
};

export const useUpdateChargeCategory = () => {
  const invalidate = useInvalidateChargeCategories();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.ChargeCategoryInput }) =>
      api.updateChargeCategory(id, input),
    onSuccess: invalidate,
  });
};

export const useSetChargeCategoryActive = () => {
  const invalidate = useInvalidateChargeCategories();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.setChargeCategoryActive(id, active),
    onSuccess: invalidate,
  });
};

/* --------------------------- Charge documents (design spec §4-§5) --------------------------- */

/** `side` omitted → BOTH sides (a charge document is side-agnostic; only claims are restricted —
 *  see `api.getChargeSourceInvoices`). `enabled` is overridable so `InvoicePickerModal` can call
 *  this AND `useClaimSourceInvoices` unconditionally (rules of hooks) and gate whichever one its
 *  mode doesn't need. */
export const useChargeSourceInvoices = (side?: InvoiceSide, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: qk.chargeSourceInvoices(side),
    queryFn: () => api.getChargeSourceInvoices(side),
    enabled: options?.enabled ?? true,
  });

export const useChargeDocs = (direction: ChargeDirection, kind?: ChargeScope) =>
  useQuery({
    queryKey: qk.chargeDocs(direction, kind),
    queryFn: () => api.getChargeDocs(direction, kind),
  });

export const useChargeDoc = (id: string) =>
  useQuery({
    queryKey: qk.chargeDoc(id),
    queryFn: () => api.getChargeDoc(id),
    enabled: !!id,
  });

// Bare-prefix invalidation (spec §5): TanStack matches query keys element-by-element, so a bare
// ['chargeDoc'] does NOT prefix-match ['chargeDocs', direction, kind] — 'chargeDoc' !==
// 'chargeDocs' as array elements, they just happen to share a text prefix as STRINGS. BOTH bare
// keys are required below; do not "simplify" either one away.
function useInvalidateCharges() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['chargeDocs'] });
    qc.invalidateQueries({ queryKey: ['chargeDoc'] });
    // The invoice-detail charges card reads a different key, so booking or cancelling a charge
    // here would otherwise leave that card stale for up to `staleTime` (spec §5).
    qc.invalidateQueries({ queryKey: ['invoiceChargeSummary'] });
  };
}

export const useCreateChargeDoc = () => {
  const invalidate = useInvalidateCharges();
  return useMutation({
    mutationFn: (input: api.ChargeDocInput) => api.createChargeDoc(input),
    onSuccess: invalidate,
  });
};

export const useUpdateChargeDoc = () => {
  const invalidate = useInvalidateCharges();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.ChargeDocInput }) =>
      api.updateChargeDoc(id, input),
    onSuccess: invalidate,
  });
};

export const useCancelChargeDoc = () => {
  const invalidate = useInvalidateCharges();
  return useMutation({
    mutationFn: (id: string) => api.cancelChargeDoc(id),
    onSuccess: invalidate,
  });
};

export const useAddChargeLine = () => {
  const invalidate = useInvalidateCharges();
  return useMutation({
    mutationFn: ({ docId, input }: { docId: string; input: api.ChargeLineInput }) =>
      api.addChargeLine(docId, input),
    onSuccess: invalidate,
  });
};

export const useUpdateChargeLine = () => {
  const invalidate = useInvalidateCharges();
  return useMutation({
    mutationFn: ({
      docId,
      lineId,
      input,
    }: {
      docId: string;
      lineId: string;
      input: api.ChargeLineInput;
    }) => api.updateChargeLine(docId, lineId, input),
    onSuccess: invalidate,
  });
};

export const useRemoveChargeLine = () => {
  const invalidate = useInvalidateCharges();
  return useMutation({
    mutationFn: ({ docId, lineId }: { docId: string; lineId: string }) =>
      api.removeChargeLine(docId, lineId),
    onSuccess: invalidate,
  });
};

/* --------------------------------- Claims (design spec §4-§5) --------------------------------- */

/** The side-restricted picker universe (expense-claim → PURCHASE, revenue-claim → SALE), mapped
 *  SERVER-side per spec §4 — the client must not re-derive it. `enabled` override: see
 *  `useChargeSourceInvoices` above. */
export const useClaimSourceInvoices = (side: ClaimSide, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: qk.claimSourceInvoices(side),
    queryFn: () => api.getClaimSourceInvoices(side),
    enabled: options?.enabled ?? true,
  });

export const useClaims = (side?: ClaimSide) =>
  useQuery({
    queryKey: qk.claims(side),
    queryFn: () => api.getClaims(side),
  });

export const useClaim = (id: string) =>
  useQuery({
    queryKey: qk.claim(id),
    queryFn: () => api.getClaim(id),
    enabled: !!id,
  });

// Bare-prefix invalidation (spec §5, same trap as `useInvalidateCharges` above): TanStack matches
// query keys element-by-element, so a bare ['claim'] does NOT prefix-match ['claims', side] —
// 'claim' !== 'claims' as array elements, they just happen to share a text prefix as STRINGS.
// BOTH bare keys are required below; do not "simplify" either one away.
function useInvalidateClaims() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['claims'] });
    qc.invalidateQueries({ queryKey: ['claim'] });
    // Same reason as `useInvalidateCharges` — the invoice card counts claims too (spec §5).
    qc.invalidateQueries({ queryKey: ['invoiceChargeSummary'] });
  };
}

export const useCreateClaim = () => {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: (input: api.ClaimInput) => api.createClaim(input),
    onSuccess: invalidate,
  });
};

export const useUpdateClaim = () => {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.ClaimInput }) => api.updateClaim(id, input),
    onSuccess: invalidate,
  });
};

export const useCancelClaim = () => {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: (id: string) => api.cancelClaim(id),
    onSuccess: invalidate,
  });
};

/* ------------------------ Invoice charge summary (design spec §4-§5) ------------------------ */

/** Everything booked against an invoice's CHAIN — expense docs, revenue docs, claims, their USD
 *  totals and the per-good breakdown (spec §4). Consumed only by `InvoiceChargesCard`, which
 *  additionally gates each section on its own `useHasAccess` (spec §6). */
/** `enabled` override so `InvoiceChargesCard` can keep its hooks unconditional (rules of hooks —
 *  a CRITICAL rule there) while still not FETCHING charge data for a user whose RBAC hides every
 *  section of the card. Harmless against the mock db, a real leak against a real backend. */
export const useInvoiceChargeSummary = (invoiceId: string, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: qk.invoiceChargeSummary(invoiceId),
    queryFn: () => api.getInvoiceChargeSummary(invoiceId),
    enabled: (options?.enabled ?? true) && !!invoiceId,
  });
