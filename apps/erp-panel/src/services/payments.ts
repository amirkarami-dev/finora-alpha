import type { Cheque, ChequeStatus, Payment, PaymentStatus } from '@/types';
import type { ChequeInput, PaymentHeaderInput, PaymentInput, PaymentItemInput } from '@/services/api';
import { request } from '@/services/http';

/**
 * Payments, their lines, and the cheques that settle them.
 *
 * <p>Like contracts and trade documents and unlike master data, these have no offline path. A
 * payment recorded in one browser and nowhere else is the problem this replaces, so an
 * unreachable API fails the save where the user can see it.</p>
 *
 * <p>Every write answers with BOTH collections. A payment line can mint a cheque nobody named,
 * and a cheque's status changes what the lines pointing at it are worth to every balance — so
 * returning one without the other leaves half the screen stale.</p>
 */

/** The payment that changed, plus every payment and every cheque after it. */
export interface PaymentResult {
  entity: Payment;
  payments: Payment[];
  cheques: Cheque[];
}

/** The same pair, for a write that changed a cheque. */
export interface ChequeResult {
  entity: Cheque;
  payments: Payment[];
  cheques: Cheque[];
}

const payments = '/api/erp/payments';
const cheques = '/api/erp/cheques';
const at = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

export const paymentsApi = {
  create: (input: PaymentInput) =>
    request<PaymentResult>(payments, { method: 'POST', body: JSON.stringify(input) }),

  updateHeader: (id: string, input: PaymentHeaderInput) =>
    request<PaymentResult>(at(payments, id), { method: 'PUT', body: JSON.stringify(input) }),

  setStatus: (id: string, status: PaymentStatus) =>
    request<PaymentResult>(`${at(payments, id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  addItem: (id: string, input: PaymentItemInput) =>
    request<PaymentResult>(`${at(payments, id)}/items`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateItem: (id: string, itemId: string, input: PaymentItemInput) =>
    request<PaymentResult>(`${at(payments, id)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  removeItem: (id: string, itemId: string) =>
    request<PaymentResult>(`${at(payments, id)}/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    }),

  createCheque: (input: ChequeInput) =>
    request<ChequeResult>(cheques, { method: 'POST', body: JSON.stringify(input) }),

  updateCheque: (id: string, input: ChequeInput) =>
    request<ChequeResult>(at(cheques, id), { method: 'PUT', body: JSON.stringify(input) }),

  /** `bankAccountId` is required when clearing and ignored otherwise — leaving PAID drops it. */
  setChequeStatus: (id: string, status: ChequeStatus, bankAccountId?: string) =>
    request<ChequeResult>(`${at(cheques, id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, bankAccountId }),
    }),
};
