import { request } from '@/services/http';

/**
 * Transport for the master-data writes — the first slice of `api.ts` to leave the browser.
 *
 * <p>Master data (people, partners, warehouses, cost centres, goods, financial accounts, charge
 * categories) moves first because nothing is derived from it. Every balance on screen is computed
 * from contracts, invoices and payments, so a rule enforced on the server here cannot disagree
 * with a number the browser worked out.</p>
 *
 * <p>This module knows only how to call. Applying the answer to the store is `api.ts`'s job, in
 * `masterWrite` — that is where the lookup indexes and the persistence live.</p>
 */

/**
 * Every write answers with the saved record and the whole list after it.
 *
 * <p>The list is not padding. Two of these writes touch rows the caller never named — granting
 * the portal account takes it from every other customer, and deactivating one drops its own — so
 * patching in the single returned record would leave the browser's copy of the others quietly
 * wrong. These lists are tens of rows.</p>
 */
export interface MasterDataResult<T> {
  entity: T;
  all: T[];
}

export const masterData = {
  create: <T>(path: string, body: unknown) =>
    request<MasterDataResult<T>>(`/api/erp/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: <T>(path: string, id: string, body: unknown) =>
    request<MasterDataResult<T>>(`/api/erp/${path}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  setActive: <T>(path: string, id: string, active: boolean) =>
    request<MasterDataResult<T>>(`/api/erp/${path}/${encodeURIComponent(id)}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
};
