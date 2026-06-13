import { useQuery } from '@tanstack/react-query';
import * as api from './api';

export const qk = {
  accounts: ['accounts'] as const,
  account: (id: string) => ['account', id] as const,
  contracts: ['contracts'] as const,
  contract: (id: string) => ['contract', id] as const,
  contractsByCustomer: (id: string) => ['contracts', 'customer', id] as const,
  containers: ['containers'] as const,
  containersByContract: (id: string) => ['containers', 'contract', id] as const,
  invoices: ['invoices'] as const,
  payments: ['payments'] as const,
  paymentsByCustomer: (id: string) => ['payments', 'customer', id] as const,
  kpis: ['kpis'] as const,
  cashflow: ['cashflow'] as const,
  productVolumes: ['productVolumes'] as const,
  statusBreakdown: ['statusBreakdown'] as const,
  aging: ['aging'] as const,
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

export const useInvoices = () => useQuery({ queryKey: qk.invoices, queryFn: api.getInvoices });

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
