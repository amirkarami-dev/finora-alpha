import { App, Form, Input, InputNumber, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useContractRemaining, useUpdateInvoiceItem } from '@/services/queries';
import type { Invoice, InvoiceItem, InvoiceSide } from '@/types';

const { TextArea } = Input;

interface EditLineFormValues {
  quantityMt: number;
  discountPercent?: number;
  blNumber?: string;
  containerNo?: string;
  description?: string;
}

interface EditLineModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  item: InvoiceItem;
  side: InvoiceSide;
}

/** DRAFT-only line editor: quantity (capped at uninvoiced + this line's own claim), discount, BL/container/desc. */
export function EditLineModal({ open, onClose, invoice, item, side }: EditLineModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<EditLineFormValues>();
  const { data: remaining } = useContractRemaining(invoice.contractId, side);
  const updateMut = useUpdateInvoiceItem();

  const remainingRow = remaining?.find((r) => r.itemId === item.contractItemId);
  // Other lines on THIS invoice already claiming the same contract item must be excluded too.
  const otherLinesQty = invoice.items
    .filter((it) => it.id !== item.id && it.contractItemId === item.contractItemId)
    .reduce((s, it) => s + it.quantityMt, 0);
  const maxQty = remainingRow
    ? Math.max(remainingRow.uninvoicedMt - otherLinesQty, 0) + item.quantityMt
    : item.quantityMt;

  const initialValues: EditLineFormValues = {
    quantityMt: item.quantityMt,
    discountPercent: item.discountPercent,
    blNumber: item.blNumber,
    containerNo: item.containerNo,
    description: item.description,
  };

  const submit = async () => {
    let values: EditLineFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    try {
      await updateMut.mutateAsync({
        invoiceId: invoice.id,
        itemId: item.id,
        patch: {
          quantityMt: values.quantityMt,
          discountPercent: values.discountPercent,
          blNumber: values.blNumber?.trim() || undefined,
          containerNo: values.containerNo?.trim() || undefined,
          description: values.description?.trim() || undefined,
        },
      });
      message.success(t('tradeInvoices.lineUpdated'));
      onClose();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'qty-exceeds-remaining') message.error(t('tradeInvoices.qtyExceedsRemaining'));
      else message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={t('tradeInvoices.editLine')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={item.id} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item
          name="quantityMt"
          label={t('items.quantityMt')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <InputNumber min={0.01} max={maxQty} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="discountPercent" label={t('tradeInvoices.discountPercent')}>
          <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="blNumber" label={t('containers.blNumber')}>
          <Input />
        </Form.Item>
        <Form.Item name="containerNo" label={t('tradeInvoices.containerNo')}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label={t('tradeInvoices.description')}>
          <TextArea rows={2} maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
