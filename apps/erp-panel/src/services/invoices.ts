import type { Contract, Currency, Invoice, InvoiceType } from '@/types';
import { request } from '@/services/http';

/**
 * Trade documents — the six types, their lines, and the conversion chain.
 *
 * <p>Like contracts and unlike master data, these have no offline path: an invoice that exists in
 * one browser is the problem being fixed, so an unreachable API fails the save visibly.</p>
 *
 * <p>Every write answers with BOTH collections. Adding a line to a document consumes contract
 * quantity, so a change here moves <c>remainingMt</c> on a contract line the caller never
 * mentioned — returning invoices alone would leave the browser showing a contract that still
 * believes it has the goods.</p>
 */

export interface InvoicePayload {
  invoiceType: InvoiceType;
  contractId: string;
  invoiceDate: string;
  invoiceNumber?: string;
  currency?: Currency;
  exchangeRate?: number;
  description?: string;
}

export interface InvoiceHeaderPayload {
  invoiceNumber?: string;
  invoiceDate?: string;
  currency?: Currency;
  exchangeRate?: number;
  description?: string;
}

export interface InvoiceItemPayload {
  contractItemId: string;
  quantityMt: number;
  containerId?: string;
  description?: string;
}

export interface InvoiceItemPatchPayload {
  quantityMt?: number;
  containerId?: string;
  description?: string;
  discountPercent?: number;
}

export interface ApplyLmePricePayload {
  lmeDate: string;
  lmePrice: number;
  discountPercent?: number;
}

/** The document that changed, plus every invoice and every contract after it. */
export interface InvoiceResult {
  entity: Invoice;
  invoices: Invoice[];
  contracts: Contract[];
}

const base = '/api/erp/invoices';
const at = (id: string) => `${base}/${encodeURIComponent(id)}`;

export const invoicesApi = {
  create: (input: InvoicePayload) =>
    request<InvoiceResult>(base, { method: 'POST', body: JSON.stringify(input) }),

  updateHeader: (id: string, patch: InvoiceHeaderPayload) =>
    request<InvoiceResult>(at(id), { method: 'PUT', body: JSON.stringify(patch) }),

  addItems: (id: string, items: InvoiceItemPayload[]) =>
    request<InvoiceResult>(`${at(id)}/items`, { method: 'POST', body: JSON.stringify(items) }),

  updateItem: (id: string, itemId: string, patch: InvoiceItemPatchPayload) =>
    request<InvoiceResult>(`${at(id)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  removeItem: (id: string, itemId: string) =>
    request<InvoiceResult>(`${at(id)}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),

  applyLmePrice: (id: string, input: ApplyLmePricePayload) =>
    request<InvoiceResult>(`${at(id)}/lme-price`, { method: 'POST', body: JSON.stringify(input) }),

  confirm: (id: string) => request<InvoiceResult>(`${at(id)}/confirm`, { method: 'POST' }),

  cancel: (id: string) => request<InvoiceResult>(`${at(id)}/cancel`, { method: 'POST' }),

  /** Creates the successor draft and returns it as `entity`. */
  convert: (id: string, targetType: InvoiceType) =>
    request<InvoiceResult>(`${at(id)}/convert`, {
      method: 'POST',
      body: JSON.stringify({ targetType }),
    }),

  markSent: (id: string) => request<InvoiceResult>(`${at(id)}/sent`, { method: 'POST' }),
};
