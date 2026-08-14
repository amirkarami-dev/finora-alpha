import type { Claim } from '@/types';
import type { ClaimInput } from '@/services/api';
import { request } from '@/services/http';

/** Claims against trade documents. */
export interface ClaimResult {
  entity: Claim;
  all: Claim[];
}

const base = '/api/erp/claims';
const at = (id: string) => `${base}/${encodeURIComponent(id)}`;

export const claimsApi = {
  create: (input: ClaimInput) =>
    request<ClaimResult>(base, { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: ClaimInput) =>
    request<ClaimResult>(at(id), { method: 'PUT', body: JSON.stringify(input) }),

  cancel: (id: string) => request<ClaimResult>(`${at(id)}/cancel`, { method: 'POST' }),
};
