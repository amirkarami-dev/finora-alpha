import { request } from './http';
import * as api from './api';
import { ROUTES } from '@/config/constants';
import { useAuthStore } from '@/store/useAuthStore';
import type { InvoiceSide, Locale } from '@/types';

const INVOICE_ROUTE = '/app/invoices';

/* ------------------------------ wire types ------------------------------ */

export interface ContentPart {
  type: 'text' | 'input_audio';
  text?: string;
  input_audio?: { data: string; format: 'wav' };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** One OpenAI-shaped message. `system` is never sent: the server owns the rules. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatReply {
  message: ChatMessage;
  usage: { promptTokens: number; completionTokens: number };
}

/* ------------------------------- endpoint ------------------------------- */

const PATH = '/api/erp/assistant/chat';

export function chat(messages: ChatMessage[], language: Locale): Promise<ChatReply> {
  return request<ChatReply>(PATH, {
    method: 'POST',
    body: JSON.stringify({ mode: 'chat', language, messages }),
  });
}

export async function transcribe(wavBase64: string, language: Locale): Promise<string> {
  const reply = await request<ChatReply>(PATH, {
    method: 'POST',
    body: JSON.stringify({
      mode: 'transcribe',
      language,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe this audio.' },
            { type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } },
          ],
        },
      ],
    }),
  });
  return typeof reply.message.content === 'string' ? reply.message.content.trim() : '';
}

/* ------------------------------ tool runner ----------------------------- */

const usd = (n: number) => Math.round(n * 100) / 100;

/** First item's product, plus "+N" when a document/contract carries more than one line —
 *  matches the summary pattern `getReceivableInvoices`/`buildContainerRows` already use. */
function productSummary(products: string[]): string {
  if (products.length === 0) return '—';
  return products.length === 1 ? products[0] : `${products[0]} +${products.length - 1}`;
}

/**
 * Runs one tool call with the same read selectors the screens use, so the assistant can only
 * ever quote a figure a page would show. Unknown tools and thrown errors come back as an
 * `{ error }` object the model can read — never as an exception that kills the conversation.
 */
export async function runTool(name: string, argsJson: string): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return { error: 'bad-arguments' };
  }
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : '');

  // A tool result's "link" points at a page the caller might not hold the route key for — the
  // panel would just redirect them home. Read permissions once per call and drop the link there.
  const permissions = useAuthStore.getState().permissions;
  function linkIf(key: string | string[], path: string): { link?: string } {
    const keys = Array.isArray(key) ? key : [key];
    return keys.some((k) => permissions.includes(k)) ? { link: path } : {};
  }
  const toPerson = (c: Awaited<ReturnType<typeof api.getCustomers>>[number]) => ({
    id: c.id, name: c.name, code: c.code, type: c.customerType, ...linkIf('customers', `${ROUTES.customers}/${c.id}`),
  });

  try {
    switch (name) {
      case 'find_persons': {
        const q = str('query').toLowerCase();
        const all = (await api.getCustomers()).filter((c) => c.active !== false);
        const found = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : all;
        const matched = !q || found.length > 0;
        const source = matched ? found : all;
        return { count: source.length, persons: source.slice(0, 10).map(toPerson), ...(matched ? {} : { note: 'no-match' }) };
      }
      case 'get_person_balance': {
        const id = str('personId');
        const row = (await api.getAccounts()).find((a) => a.id === id);
        if (!row) return { error: 'not-found' };
        return {
          personId: id,
          name: row.name,
          invoicedUsd: usd(row.totalInvoiced),
          paidUsd: usd(row.totalPaid),
          outstandingUsd: usd(row.totalOutstanding),
          overdueUsd: usd(row.overdue),
          netBalanceUsd: usd(row.netBalance),
          ...linkIf('customers', `${ROUTES.customers}/${id}`),
        };
      }
      case 'list_open_invoices': {
        const id = str('personId') || undefined;
        const side: InvoiceSide = str('side').toUpperCase() === 'PURCHASE' ? 'PURCHASE' : 'SALE';
        if (side === 'SALE') {
          const all = (await api.getReceivableInvoices(id)).filter((r) => r.displayStatus !== 'PAID');
          const rows = all.slice(0, 20);
          return {
            side, count: all.length,
            invoices: rows.map((r) => ({
              number: r.invoiceNumber, date: r.invoiceDate, person: r.customerName, totalUsd: usd(r.totalAmount),
              paidUsd: usd(r.paidUSD), outstandingUsd: usd(r.totalAmount - r.paidUSD), status: r.displayStatus,
              ...linkIf(['purchase', 'sale'], `${INVOICE_ROUTE}/${r.id}`),
            })),
          };
        }
        const all = (await api.getTradeInvoices('PURCHASE'))
          .filter((r) => r.invoiceType === 'PURCHASE_INVOICE' && r.status === 'CONFIRMED' && (!id || r.customerId === id));
        const rows = all.slice(0, 20);
        return {
          side, count: all.length,
          invoices: rows.map((r) => ({
            number: r.invoiceNumber, date: r.invoiceDate, person: r.customerName, totalUsd: usd(api.invoiceTotalUSD(r)),
            currency: r.currency, status: r.status, ...linkIf(['purchase', 'sale'], `${INVOICE_ROUTE}/${r.id}`),
          })),
        };
      }
      case 'get_stock_levels': {
        const w = str('warehouse').toLowerCase();
        const warehouses = await api.getWarehouses();
        const warehouseById = new Map(warehouses.map((wh) => [wh.id, wh]));
        const allRows = (await api.getStockLevels())
          .map((r) => ({ ...r, warehouseName: warehouseById.get(r.warehouseId)?.name ?? '—' }));
        const filtered = w ? allRows.filter((r) => r.warehouseName.toLowerCase().includes(w)) : allRows;
        // An unmatched warehouse name (often because the model guessed in the wrong language)
        // falls back to every warehouse rather than an empty, unhelpful answer.
        const matched = w && filtered.length === 0 ? false : true;
        const rows = matched ? filtered : allRows;
        return {
          count: rows.length,
          stock: rows.slice(0, 30).map((r) => ({
            warehouse: r.warehouseName, product: r.product, quantityMt: r.mt,
            valueUsd: r.costKnown ? usd(r.valueUsd) : null, unitCostUsd: r.costKnown ? r.unitCostUsd : null,
          })),
          ...linkIf('warehouse', ROUTES.warehouse),
          ...(matched ? {} : { note: 'warehouse-not-matched' }),
        };
      }
      case 'list_contracts': {
        const id = str('personId');
        const all = id ? await api.getContractsByCustomer(id) : await api.getContracts();
        const rows = all.slice(0, 20);
        return {
          count: all.length,
          contracts: rows.map((c) => ({
            id: c.id, person: c.customerName, type: c.contractType,
            product: productSummary(c.items.map((i) => i.product)),
            quantityMt: c.quantityMt, remainingMt: c.remainingMt, status: c.status,
            ...linkIf('contracts', `${ROUTES.contracts}/${c.id}`),
          })),
        };
      }
      case 'get_contract_remaining': {
        const id = str('contractId');
        const contracts = await api.getContracts();
        const contract = contracts.find((c) => c.id === id);
        if (!contract) return { error: 'not-found' };
        const side: InvoiceSide = contract.contractType === 'SELL' ? 'SALE' : 'PURCHASE';
        const rows = await api.getContractRemaining(id, side);
        return {
          contractId: id, person: contract.customerName,
          lines: rows.map((r) => ({ product: r.product, contractedMt: r.quantityMt, uninvoicedMt: r.uninvoicedMt })),
          ...linkIf('contracts', `${ROUTES.contracts}/${id}`),
        };
      }
      case 'find_document': {
        const number = str('number').toLowerCase();
        const both = [...(await api.getTradeInvoices('SALE')), ...(await api.getTradeInvoices('PURCHASE'))];
        const doc = both.find((d) => d.invoiceNumber.toLowerCase() === number);
        if (!doc) return { error: 'not-found' };
        return {
          number: doc.invoiceNumber, type: doc.invoiceType, person: doc.customerName, date: doc.invoiceDate,
          totalUsd: usd(api.invoiceTotalUSD(doc)), currency: doc.currency, status: doc.status,
          ...linkIf(['purchase', 'sale'], `${INVOICE_ROUTE}/${doc.id}`),
        };
      }
      case 'get_dashboard_summary': {
        const k = await api.getKpis();
        return {
          outstandingUsd: usd(k.totalOutstanding), overdueUsd: usd(k.overdue), invoicedUsd: usd(k.totalInvoiced),
          paidUsd: usd(k.totalPaid), activeContracts: k.activeContracts, customers: k.customers,
          collectionRatePct: k.collectionRate, ...linkIf('dashboard', ROUTES.dashboard),
        };
      }
      default:
        return { error: 'unknown-tool' };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'failed' };
  }
}
