import type { ExchangeGainLoss } from '@/types';
import type { ExchangeGainLossInput } from '@/services/api';
import { request } from '@/services/http';

/** Standalone notes that currency moved for or against the company. */
export interface GainLossResult {
  entity: ExchangeGainLoss;
  all: ExchangeGainLoss[];
}

const base = '/api/erp/exchange-gain-losses';
const at = (id: string) => `${base}/${encodeURIComponent(id)}`;

export const exchangeGainLossApi = {
  create: (input: ExchangeGainLossInput) =>
    request<GainLossResult>(base, { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: ExchangeGainLossInput) =>
    request<GainLossResult>(at(id), { method: 'PUT', body: JSON.stringify(input) }),

  /** Answers with the remaining list — this is the one real delete in the module. */
  remove: (id: string) => request<ExchangeGainLoss[]>(at(id), { method: 'DELETE' }),
};
