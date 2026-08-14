import type { Contract, Incoterm, ItemStatus, ContractStatus, ContractType, ItemPartner } from '@/types';
import { request } from '@/services/http';

/**
 * Contracts and their goods lines — the first trade documents that reach the server.
 *
 * <p>Unlike master data, these have no offline path. A contract that exists in one browser is
 * exactly the problem this replaces, so when the API is unreachable the write fails loudly
 * instead of quietly saving somewhere only this machine can see.</p>
 */

export interface ContractPayload {
  customerId: string;
  date: string;
  destination: string;
  status: ContractStatus;
  notes?: string;
  contractType?: ContractType;
}

export interface ContractItemPayload {
  product: string;
  quantityMt: number;
  lmePercent: number;
  lmeFixed: boolean;
  fixedLmePrice: number;
  premium: number;
  incoterm: Incoterm;
  status: ItemStatus;
  notes?: string;
  partners?: ItemPartner[];
}

/** Every write answers with the changed contract and the whole list after it — adding a line
 *  moves its contract's totals, and the pages derive their rows from the set. */
export interface ContractResult {
  entity: Contract;
  all: Contract[];
}

export const contractsApi = {
  create: (input: ContractPayload) =>
    request<ContractResult>('/api/erp/contracts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: ContractPayload) =>
    request<ContractResult>(`/api/erp/contracts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  addItem: (contractId: string, input: ContractItemPayload) =>
    request<ContractResult>(`/api/erp/contracts/${encodeURIComponent(contractId)}/items`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateItem: (contractId: string, itemId: string, input: ContractItemPayload) =>
    request<ContractResult>(
      `/api/erp/contracts/${encodeURIComponent(contractId)}/items/${encodeURIComponent(itemId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),
};
