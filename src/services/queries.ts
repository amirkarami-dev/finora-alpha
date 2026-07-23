import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InventoryDocType, InvoiceSide, InvoiceType } from '@/types';
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
    onSuccess: (invoice) => invalidate(invalidateArgsFor(invoice)),
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
