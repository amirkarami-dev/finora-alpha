import type { ConversionDocument, ConversionDocInput } from '@/types';
import { request } from '@/services/http';

/** Conversion documents. Every write answers the whole list — stock is folded from all of them. */
export interface ConversionResult {
  entity: ConversionDocument;
  all: ConversionDocument[];
}

const base = '/api/erp/conversions';

export const conversionsApi = {
  create: (input: ConversionDocInput) =>
    request<ConversionResult>(base, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ConversionDocInput) =>
    request<ConversionResult>(`${base}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  confirm: (id: string) =>
    request<ConversionResult>(`${base}/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),
  cancel: (id: string) =>
    request<ConversionResult>(`${base}/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
};
