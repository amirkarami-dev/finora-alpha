import { useMemo, useState } from 'react';
import { Alert, App, Descriptions, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { formatMt } from '@/utils/format';
import { useConfirmInvoice, useWarehouses } from '@/services/queries';
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
  const { data: warehouses } = useWarehouses();
  const isFinal = FINAL_TYPES.has(invoice.invoiceType);

  const activeWarehouses = useMemo(() => (warehouses ?? []).filter((w) => w.active), [warehouses]);
  const [warehouseId, setWarehouseId] = useState<string | undefined>(undefined);

  // Default to the first active warehouse whenever the modal opens.
  useMemo(() => {
    if (open && isFinal && !warehouseId && activeWarehouses.length > 0) {
      setWarehouseId(activeWarehouses[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isFinal, activeWarehouses]);

  const noActiveWarehouse = isFinal && activeWarehouses.length === 0;
  const okDisabled = isFinal && (noActiveWarehouse || !warehouseId);

  const submit = async () => {
    try {
      await confirmMut.mutateAsync({
        id: invoice.id,
        options: isFinal ? { warehouseId } : undefined,
      });
      message.success(t('tradeInvoices.confirmed'));
      onClose();
      if (isFinal) onConfirmed?.();
    } catch (err) {
      const error = err as Error & { product?: string; available?: number };
      const code = error.message;
      if (code === 'no-items') message.error(t('tradeInvoices.noItems'));
      else if (code === 'missing-lme-price') message.error(t('tradeInvoices.missingLmePrice'));
      else if (code === 'qty-exceeds-remaining') message.error(t('tradeInvoices.qtyExceedsRemaining'));
      else if (code === 'insufficient-stock') {
        message.error(
          t('tradeInvoices.insufficientStock', {
            product: error.product ?? '',
            available: formatMt(error.available ?? 0),
          }),
        );
      } else if (code === 'warehouse-required') message.error(t('tradeInvoices.noActiveWarehouse'));
      else message.error(t('common.saveFailed'));
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
      okButtonProps={{ disabled: okDisabled }}
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

      {isFinal && (
        <div style={{ marginTop: 16 }}>
          {noActiveWarehouse ? (
            <Alert type="warning" showIcon message={t('tradeInvoices.noActiveWarehouse')} />
          ) : (
            <Select
              style={{ width: '100%' }}
              value={warehouseId}
              placeholder={t('tradeInvoices.selectWarehouse')}
              options={activeWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
              onChange={setWarehouseId}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
