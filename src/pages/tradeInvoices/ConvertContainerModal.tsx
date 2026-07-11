import { useMemo, useState } from 'react';
import { App, Modal, Select, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApplyContainerToAll, useContainerOptions, useConvertInvoice } from '@/services/queries';
import type { Invoice, InvoiceType } from '@/types';

const { Text } = Typography;

interface ConvertContainerModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  targetType: InvoiceType;
}

/**
 * Convert-container step (spec §7): converting a CONFIRMED order/provisional offers an
 * optional single container to apply to every line of the freshly-created draft. Skipping
 * leaves the new draft's lines unassigned — per-row assign / the confirm guard handle it later.
 */
export function ConvertContainerModal({ open, onClose, invoice, targetType }: ConvertContainerModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { data: containerOptions } = useContainerOptions();
  const convertMut = useConvertInvoice();
  const applyContainerMut = useApplyContainerToAll();
  const [containerId, setContainerId] = useState<string | undefined>(undefined);

  const containerSelectOptions = useMemo(
    () =>
      (containerOptions ?? []).map((c) => ({
        value: c.id,
        label: `${c.reference} · ${c.blNumber || '—'}`,
      })),
    [containerOptions],
  );

  const submit = async () => {
    try {
      const created = await convertMut.mutateAsync({ id: invoice.id, targetType });
      if (containerId) {
        await applyContainerMut.mutateAsync({ invoiceId: created.id, containerId });
      }
      message.success(t('tradeInvoices.converted'));
      setContainerId(undefined);
      onClose();
      navigate(`/app/invoices/${encodeURIComponent(created.id)}`);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'has-successor') message.error(t('tradeInvoices.hasSuccessor'));
      else message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={t(`tradeInvoices.convertTo.${targetType}`)}
      okText={t('tradeInvoices.convert')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={convertMut.isPending || applyContainerMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
        {t('tradeInvoices.convertContainerHint')}
      </Text>
      <Text style={{ display: 'block', marginBottom: 4 }}>{t('tradeInvoices.convertPickContainer')}</Text>
      <Select
        allowClear
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        placeholder={t('tradeInvoices.container')}
        value={containerId}
        onChange={setContainerId}
        options={containerSelectOptions}
      />
    </Modal>
  );
}
