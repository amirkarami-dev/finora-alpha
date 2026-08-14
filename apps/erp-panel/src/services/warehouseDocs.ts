import type { InventoryDocument } from '@/types';
import type { InventoryDocInput } from '@/services/api';
import { request } from '@/services/http';

/**
 * Warehouse receipts and issues.
 *
 * <p>Stock is folded from the whole set, so every write answers with the whole set — one document
 * on its own tells the page nothing it can count with.</p>
 */
export interface InventoryDocResult {
  entity: InventoryDocument;
  all: InventoryDocument[];
}

const base = '/api/erp/inventory-documents';

export const warehouseDocsApi = {
  create: (input: InventoryDocInput) =>
    request<InventoryDocResult>(base, { method: 'POST', body: JSON.stringify(input) }),

  cancel: (id: string) =>
    request<InventoryDocResult>(`${base}/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
};
