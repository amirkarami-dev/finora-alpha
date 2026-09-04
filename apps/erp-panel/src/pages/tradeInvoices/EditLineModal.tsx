import { useMemo, useState } from 'react';
import { App, Empty, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useContainerOptions, useContractRemaining, useUpdateInvoiceItem } from '@/services/queries';
import { buildContainerOptions, ltrTruncateStyle, withSelectedContainer } from './containerOptions';
import { qtyExceedsContractParams } from './qtyExceedsContract';
import { weightsInvalidMessage } from './weightsInvalid';
import { isPricedType, netMtOf } from '@/utils/calc';
import { formatMt } from '@/utils/format';
import type { Invoice, InvoiceItem, InvoiceSide } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

interface EditLineFormValues {
  quantityMt?: number;
  grossMt?: number;
  tareMt?: number;
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

/** DRAFT-only line editor: quantity (capped at uninvoiced, excluding this doc's other lines for the same good), container, discount, desc. */
export function EditLineModal({ open, onClose, invoice, item, side }: EditLineModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<EditLineFormValues>();
  const { data: remaining } = useContractRemaining(invoice.contractId, side, invoice.id);
  const { data: containerOptions } = useContainerOptions();
  const updateMut = useUpdateInvoiceItem();
  const weighed = isPricedType(invoice.invoiceType);
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
  // The true ceiling for a NEW value on this line — may sit below the field's current value once
  // a rival document has confirmed and shrunk the remaining amount.
  const ceilingMt = remainingRow ? Math.max(remainingRow.uninvoicedMt - otherLinesQty, 0) : item.quantityMt;
  // The InputNumber's `max` must never sit below the field's initial value: rc-input-number
  // clamps an out-of-range value to `max` on blur and fires onChange, so `max < item.quantityMt`
  // silently rewrote the line to the (too-low) ceiling with no message. The real ceiling is
  // enforced below via an inline validator instead, which can show an error and reject the save.
  const maxQty = Math.max(ceilingMt, item.quantityMt);

  const initialValues: EditLineFormValues = {
    quantityMt: item.quantityMt,
    grossMt: item.grossMt,
    tareMt: item.tareMt,
    containerId: item.containerId,
    discountPercent: item.discountPercent,
    description: item.description,
  };

  const watchedGross = Form.useWatch('grossMt', form);
  const watchedTare = Form.useWatch('tareMt', form);

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
          ...(weighed
            ? { grossMt: values.grossMt, tareMt: values.tareMt }
            : { quantityMt: values.quantityMt }),
          containerId: values.containerId,
          discountPercent: values.discountPercent,
          description: values.description?.trim() || undefined,
        },
      });
      message.success(t('tradeInvoices.lineUpdated'));
      onClose();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'qty-exceeds-remaining') {
        const params = qtyExceedsContractParams(err);
        message.error(params ? t('tradeInvoices.qtyExceedsContract', params) : t('tradeInvoices.qtyExceedsRemaining'));
      } else if (code === 'weights-invalid') {
        message.error(weightsInvalidMessage(err, t));
      } else message.error(t('common.saveFailed'));
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
        {weighed ? (
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item
              name="grossMt"
              label={t('tradeInvoices.grossMt')}
              rules={[{ required: true, message: t('common.required') }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0.000001} precision={6} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="tareMt"
              label={t('tradeInvoices.tareMt')}
              dependencies={['grossMt']}
              style={{ flex: 1 }}
              rules={[
                { required: true, message: t('common.required') },
                {
                  validator: async (_, v) => {
                    if (v === undefined || v === null) return;
                    const gross = form.getFieldValue('grossMt') as number | undefined;
                    if (v < 0) throw new Error(t('tradeInvoices.weightsInvalidTare'));
                    if (gross !== undefined && v >= gross) {
                      throw new Error(t('tradeInvoices.weightsInvalidTareExceedsGross'));
                    }
                    if (netMtOf(gross, v) > ceilingMt + 1e-9) {
                      throw new Error(t('tradeInvoices.exceedsUninvoiced', { mt: formatMt(ceilingMt) }));
                    }
                  },
                },
              ]}
            >
              <InputNumber min={0} precision={6} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        ) : (
          <Form.Item
            name="quantityMt"
            label={t('items.quantityMt')}
            rules={[
              { required: true, message: t('common.required') },
              {
                validator: async (_, v) => {
                  if (v === undefined || v === null) return;
                  if (v <= 0) throw new Error(t('common.required'));
                  if (v > ceilingMt + 1e-9) {
                    throw new Error(t('tradeInvoices.exceedsUninvoiced', { mt: formatMt(ceilingMt) }));
                  }
                },
              },
            ]}
          >
            <InputNumber min={0.000001} max={maxQty} precision={6} style={{ width: '100%' }} />
          </Form.Item>
        )}
        {weighed && (
          <Form.Item label={t('tradeInvoices.netMt')} extra={t('tradeInvoices.netHint')}>
            <Text strong>{formatMt(netMtOf(watchedGross, watchedTare))}</Text>
          </Form.Item>
        )}
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
