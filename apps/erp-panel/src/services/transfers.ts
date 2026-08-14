import type { MoneyTransfer, TransferStatus } from '@/types';
import type { MoneyTransferInput } from '@/services/api';
import { request } from '@/services/http';

/** Money moved between the company's own accounts. */
export interface TransferResult {
  entity: MoneyTransfer;
  all: MoneyTransfer[];
}

const base = '/api/erp/transfers';
const at = (id: string) => `${base}/${encodeURIComponent(id)}`;

export const transfersApi = {
  create: (input: MoneyTransferInput) =>
    request<TransferResult>(base, { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: MoneyTransferInput) =>
    request<TransferResult>(at(id), { method: 'PUT', body: JSON.stringify(input) }),

  setStatus: (id: string, status: TransferStatus) =>
    request<TransferResult>(`${at(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
};
