import type { Container } from '@/types';
import type { ContainerInput } from '@/services/api';
import { request } from '@/services/http';

/**
 * Shipping containers.
 *
 * <p>No offline path. Trade documents already live on the server and their lines name a
 * container, so a container invented in one browser is an id the server cannot resolve.</p>
 */
export interface ContainerResult {
  entity: Container;
  all: Container[];
}

const base = '/api/erp/containers';

export const containersApi = {
  create: (input: ContainerInput) =>
    request<ContainerResult>(base, { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: ContainerInput) =>
    request<ContainerResult>(`${base}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
