import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import type { InvoiceStatus } from '@/types';

/**
 * Trade-invoice status colors. Deliberately NOT merged into the shared
 * `StatusTag` (spec §10): that component's CANCELLED is contract-red, while
 * an invoice CANCELLED here is a dimmed default — different semantics.
 */
export const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  DRAFT: 'default',
  CONFIRMED: 'success',
  CANCELLED: 'default',
};

export function InvoiceStatusTag({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslation();
  return (
    <Tag
      color={INVOICE_STATUS_COLOR[status]}
      style={{
        margin: 0,
        borderRadius: 6,
        fontWeight: 500,
        opacity: status === 'CANCELLED' ? 0.6 : 1,
      }}
    >
      {t(`tradeInvoices.status.${status}`)}
    </Tag>
  );
}
