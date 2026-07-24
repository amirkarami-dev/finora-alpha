import { App, Descriptions, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { formatMt } from '@/utils/format';
import { useConfirmInvoice } from '@/services/queries';
import { qtyExceedsContractParams } from './qtyExceedsContract';
import type { Invoice } from '@/types';

interface ConfirmInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  /** Called after a successful confirm of a FINAL invoice, so the page can show the uninvoiced alert. */
  onConfirmed?: () => void;
}

const FINAL_TYPES = new Set(['PURCHASE_INVOICE', 'SALE_INVOICE']);

export function ConfirmInvoiceModal({ open, onClose, invoice, onConfirmed }: ConfirmInvoiceModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const confirmMut = useConfirmInvoice();
  const isFinal = FINAL_TYPES.has(invoice.invoiceType);

  const submit = async () => {
    try {
      await confirmMut.mutateAsync(invoice.id);
      message.success(t('tradeInvoices.confirmed'));
      onClose();
      if (isFinal) onConfirmed?.();
    } catch (err) {
      const error = err as Error & { products?: string[] };
      const code = error.message;
      if (code === 'no-items') message.error(t('tradeInvoices.noItems'));
      else if (code === 'missing-lme-price') message.error(t('tradeInvoices.missingLmePrice'));
      else if (code === 'missing-container') {
        message.error(t('tradeInvoices.missingContainer', { products: (error.products ?? []).join(', ') }));
      } else if (code === 'qty-exceeds-remaining') {
        const params = qtyExceedsContractParams(error);
        message.error(params ? t('tradeInvoices.qtyExceedsContract', params) : t('tradeInvoices.qtyExceedsRemaining'));
      } else message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={t('tradeInvoices.confirmTitle')}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={confirmMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'number', label: t('tradeInvoices.number'), children: invoice.invoiceNumber },
          { key: 'items', label: t('tradeInvoices.itemCount'), children: invoice.items.length },
          { key: 'weight', label: t('tradeInvoices.totalWeight'), children: formatMt(invoice.totalWeightMt) },
          {
            key: 'total',
            label: t('tradeInvoices.totalAmount'),
            children: <Money value={invoice.totalAmount} strong />,
          },
        ]}
      />
    </Modal>
  );
}
