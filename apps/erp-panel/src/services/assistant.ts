import { request } from './http';
import * as api from './api';
import { ROUTES } from '@/config/constants';
import type { InvoiceSide, Locale } from '@/types';

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

  try {
    switch (name) {
      case 'find_persons': {
        const q = str('query').toLowerCase();
        const all = await api.getCustomers();
        const hits = all
          .filter((c) => c.active !== false && (c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q))
          .slice(0, 10)
          .map((c) => ({ id: c.id, name: c.name, code: c.code, type: c.customerType, link: `${ROUTES.customers}/${c.id}` }));
        return { count: hits.length, persons: hits };
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
          link: `${ROUTES.customers}/${id}`,
        };
      }
      case 'list_open_invoices': {
        const id = str('personId') || undefined;
        const side = (str('side') || 'SALE') as InvoiceSide;
        if (side === 'SALE') {
          const rows = (await api.getReceivableInvoices(id)).filter((r) => r.displayStatus !== 'PAID').slice(0, 20);
          return {
            side, count: rows.length,
            invoices: rows.map((r) => ({
              number: r.invoiceNumber, date: r.invoiceDate, person: r.customerName, totalUsd: usd(r.totalAmount),
              paidUsd: usd(r.paidUSD), outstandingUsd: usd(r.totalAmount - r.paidUSD), status: r.displayStatus,
              link: `/app/invoices/${r.id}`,
            })),
          };
        }
        const rows = (await api.getTradeInvoices('PURCHASE'))
          .filter((r) => r.status !== 'CANCELLED' && (!id || r.customerId === id)).slice(0, 20);
        return {
          side, count: rows.length,
          invoices: rows.map((r) => ({
            number: r.invoiceNumber, date: r.invoiceDate, person: r.customerName, total: usd(r.totalAmount),
            currency: r.currency, status: r.status, link: `/app/invoices/${r.id}`,
          })),
        };
      }
      case 'get_stock_levels': {
        const w = str('warehouse').toLowerCase();
        const warehouses = await api.getWarehouses();
        const warehouseById = new Map(warehouses.map((wh) => [wh.id, wh]));
        const rows = (await api.getStockLevels())
          .map((r) => ({ ...r, warehouseName: warehouseById.get(r.warehouseId)?.name ?? '—' }))
          .filter((r) => !w || r.warehouseName.toLowerCase().includes(w));
        return {
          count: rows.length,
          stock: rows.map((r) => ({
            warehouse: r.warehouseName, product: r.product, quantityMt: r.mt,
            valueUsd: r.costKnown ? usd(r.valueUsd) : null, unitCostUsd: r.costKnown ? r.unitCostUsd : null,
          })),
          link: ROUTES.warehouse,
        };
      }
      case 'list_contracts': {
        const id = str('personId');
        const rows = (id ? await api.getContractsByCustomer(id) : await api.getContracts()).slice(0, 20);
        return {
          count: rows.length,
          contracts: rows.map((c) => ({
            id: c.id, person: c.customerName, type: c.contractType,
            product: productSummary(c.items.map((i) => i.product)),
            quantityMt: c.quantityMt, remainingMt: c.remainingMt, status: c.status,
            link: `${ROUTES.contracts}/${c.id}`,
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
          link: `${ROUTES.contracts}/${id}`,
        };
      }
      case 'find_document': {
        const number = str('number');
        const both = [...(await api.getTradeInvoices('SALE')), ...(await api.getTradeInvoices('PURCHASE'))];
        const doc = both.find((d) => d.invoiceNumber === number);
        if (!doc) return { error: 'not-found' };
        return {
          number: doc.invoiceNumber, type: doc.invoiceType, person: doc.customerName, date: doc.invoiceDate,
          total: usd(doc.totalAmount), currency: doc.currency, status: doc.status, link: `/app/invoices/${doc.id}`,
        };
      }
      case 'get_dashboard_summary': {
        const k = await api.getKpis();
        return {
          outstandingUsd: usd(k.totalOutstanding), overdueUsd: usd(k.overdue), invoicedUsd: usd(k.totalInvoiced),
          paidUsd: usd(k.totalPaid), activeContracts: k.activeContracts, customers: k.customers,
          collectionRatePct: k.collectionRate, link: ROUTES.dashboard,
        };
      }
      default:
        return { error: 'unknown-tool' };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'failed' };
  }
}
