import type { ChargeDoc } from '@/types';
import type { ChargeDocInput, ChargeLineInput } from '@/services/api';
import { request } from '@/services/http';

/**
 * Expenses and revenues — one transport, because they are one mirrored implementation and the
 * document's own direction says which it is.
 */
export interface ChargeResult {
  entity: ChargeDoc;
  all: ChargeDoc[];
}

const base = '/api/erp/charge-docs';
const at = (id: string) => `${base}/${encodeURIComponent(id)}`;

export const chargesApi = {
  create: (input: ChargeDocInput) =>
    request<ChargeResult>(base, { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: ChargeDocInput) =>
    request<ChargeResult>(at(id), { method: 'PUT', body: JSON.stringify(input) }),

  cancel: (id: string) => request<ChargeResult>(`${at(id)}/cancel`, { method: 'POST' }),

  addLine: (id: string, input: ChargeLineInput) =>
    request<ChargeResult>(`${at(id)}/lines`, { method: 'POST', body: JSON.stringify(input) }),

  updateLine: (id: string, lineId: string, input: ChargeLineInput) =>
    request<ChargeResult>(`${at(id)}/lines/${encodeURIComponent(lineId)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  removeLine: (id: string, lineId: string) =>
    request<ChargeResult>(`${at(id)}/lines/${encodeURIComponent(lineId)}`, { method: 'DELETE' }),
};
