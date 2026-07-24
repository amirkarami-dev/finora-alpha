import { useMemo, useState } from 'react';
import { App, Empty, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useContainerOptions, useContractRemaining, useUpdateInvoiceItem } from '@/services/queries';
import { buildContainerOptions, ltrTruncateStyle, withSelectedContainer } from './containerOptions';
import type { Invoice, InvoiceItem, InvoiceSide } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

interface EditLineFormValues {
  quantityMt: number;
  containerId?: string;
  discountPercent?: number;
  description?: string;
}

interface EditLineModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  item: InvoiceItem;
  side: InvoiceSide;
}

/** DRAFT-only line editor: quantity (capped at uninvoiced + this line's own claim), container, discount, desc. */
export function EditLineModal({ open, onClose, invoice, item, side }: EditLineModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<EditLineFormValues>();
  const { data: remaining } = useContractRemaining(invoice.contractId, side, invoice.id);
  const { data: containerOptions } = useContainerOptions();
  const updateMut = useUpdateInvoiceItem();
  const [showAllContainers, setShowAllContainers] = useState(false);

  // Filtered to this line's good by default (spec §5.2), with the currently-assigned container
  // always unioned in (flagged) so a pre-existing non-carrying value never renders as a raw id.
  const containerSelectOptions = useMemo(() => {
    const base = buildContainerOptions(
      containerOptions ?? [],
      showAllContainers ? undefined : item.contractItemId,
    );
    return withSelectedContainer(
      base,
      containerOptions ?? [],
      item.containerId,
      t('tradeInvoices.containerNotCarryingGood'),
    );
  }, [containerOptions, showAllContainers, item.contractItemId, item.containerId, t]);

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
    containerId: item.containerId,
    discountPercent: item.discountPercent,
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
          containerId: values.containerId,
          discountPercent: values.discountPercent,
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
        <Form.Item
          name="containerId"
          label={t('tradeInvoices.container')}
          extra={
            <Space size={6}>
              <Switch size="small" checked={showAllContainers} onChange={setShowAllContainers} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('tradeInvoices.showAllContainers')}
              </Text>
            </Space>
          }
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('tradeInvoices.container')}
            options={containerSelectOptions}
            notFoundContent={
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('tradeInvoices.noContainerForGood')} />
            }
            labelRender={({ label }) => (
              <span dir="ltr" style={ltrTruncateStyle}>
                {label}
              </span>
            )}
            optionRender={(o) => (
              <span dir="ltr" style={ltrTruncateStyle}>
                {o.label}
              </span>
            )}
          />
        </Form.Item>
        <Form.Item name="discountPercent" label={t('tradeInvoices.discountPercent')}>
          <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label={t('tradeInvoices.description')}>
          <TextArea rows={2} maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
