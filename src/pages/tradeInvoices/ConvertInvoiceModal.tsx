import { App, Modal, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConvertInvoice } from '@/services/queries';
import type { Invoice, InvoiceType } from '@/types';

const { Text } = Typography;

interface ConvertInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  targetType: InvoiceType;
}

/**
 * Convert step (spec §7): turns a CONFIRMED order/provisional into the next document in the
 * chain, then opens it.
 *
 * It used to also offer a container to stamp across every line of the new draft. That is gone:
 * containers are assigned per line on the new document afterwards, which is where the choice
 * actually belongs — a single container applied to every line was only ever right for a
 * single-container shipment, and the modal could not tell.
 */
export function ConvertInvoiceModal({ open, onClose, invoice, targetType }: ConvertInvoiceModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const convertMut = useConvertInvoice();

  const submit = async () => {
    try {
      const created = await convertMut.mutateAsync({ id: invoice.id, targetType });
      message.success(t('tradeInvoices.converted'));
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
      confirmLoading={convertMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Text type="secondary">{t('tradeInvoices.convertHint')}</Text>
    </Modal>
  );
}
