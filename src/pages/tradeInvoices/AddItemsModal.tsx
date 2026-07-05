import { useEffect, useMemo } from 'react';
import { App, Button, Checkbox, Empty, Form, InputNumber, Modal, Space, Typography, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { useContractRemaining, useAddInvoiceItems } from '@/services/queries';
import type { InvoiceItemInput } from '@/services/api';
import { formatMt } from '@/utils/format';
import type { Invoice, InvoiceSide } from '@/types';

const { Text } = Typography;

interface AddItemsFormRow {
  contractItemId: string;
  product: string;
  uninvoicedMt: number;
  include: boolean;
  quantityMt?: number;
}

interface AddItemsFormValues {
  rows: AddItemsFormRow[];
}

interface AddItemsModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  side: InvoiceSide;
}

/**
 * ONE Form + Form.List keyed by stable contract-item id (spec §10 — never index
 * keys). Source rows = contract remaining minus quantities already on this doc.
 */
export function AddItemsModal({ open, onClose, invoice, side }: AddItemsModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [form] = Form.useForm<AddItemsFormValues>();
  const { data: remaining, isLoading } = useContractRemaining(invoice.contractId, side);
  const addMut = useAddInvoiceItems();

  const rows: AddItemsFormRow[] = useMemo(() => {
    const alreadyOnDoc = new Map<string, number>();
    for (const it of invoice.items) {
      alreadyOnDoc.set(it.contractItemId, (alreadyOnDoc.get(it.contractItemId) ?? 0) + it.quantityMt);
    }
    return (remaining ?? [])
      .map((r) => ({
        contractItemId: r.itemId,
        product: r.product,
        uninvoicedMt: Math.max(r.uninvoicedMt - (alreadyOnDoc.get(r.itemId) ?? 0), 0),
        include: false,
        quantityMt: undefined,
      }))
      .filter((r) => r.uninvoicedMt > 1e-9);
  }, [remaining, invoice.items]);

  useEffect(() => {
    if (open) form.setFieldsValue({ rows });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rows]);

  const watchedRows = Form.useWatch('rows', form) ?? rows;
  const includedCount = watchedRows.filter((r) => r?.include).length;

  const insertAll = () => {
    const next = rows.map((r) => ({ ...r, include: true, quantityMt: r.uninvoicedMt }));
    form.setFieldsValue({ rows: next });
  };

  const submit = async () => {
    let values: AddItemsFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validation errors render inline
    }
    const items: InvoiceItemInput[] = values.rows
      .map((r, i) => ({ ...r, contractItemId: rows[i]?.contractItemId ?? r.contractItemId }))
      .filter((r) => r.include)
      .map((r) => ({ contractItemId: r.contractItemId, quantityMt: r.quantityMt ?? 0 }));
    if (items.length === 0) {
      message.error(t('tradeInvoices.selectAtLeastOne'));
      return;
    }
    try {
      await addMut.mutateAsync({ invoiceId: invoice.id, items });
      message.success(t('tradeInvoices.itemsAdded'));
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
      width={640}
      title={t('tradeInvoices.addItems')}
      okText={t('tradeInvoices.insertSelected')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={addMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Space style={{ marginBottom: 12 }}>
        <Button size="small" onClick={insertAll} disabled={rows.length === 0}>
          {t('tradeInvoices.insertAllFromContract')}
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('tradeInvoices.selectedCount', { count: includedCount, total: rows.length })}
        </Text>
      </Space>

      {!isLoading && rows.length === 0 && (
        <Empty description={t('tradeInvoices.noUninvoicedLines')} />
      )}

      {rows.length > 0 && (
        <Form form={form} layout="vertical" preserve={false} initialValues={{ rows }}>
          <Form.List name="rows">
            {(fields) => (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {fields.map((field) => {
                  const row = rows[field.name];
                  const included = watchedRows[field.name]?.include;
                  return (
                    <div
                      key={row.contractItemId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: 8,
                      }}
                    >
                      <Form.Item
                        name={[field.name, 'include']}
                        valuePropName="checked"
                        style={{ marginBottom: 0 }}
                      >
                        <Checkbox />
                      </Form.Item>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong>{row.product}</Text>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('tradeInvoices.uninvoicedHint', { mt: formatMt(row.uninvoicedMt) })}
                          </Text>
                        </div>
                      </div>
                      <div style={{ width: 170, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Form.Item
                          name={[field.name, 'quantityMt']}
                          style={{ marginBottom: 0, flex: 1 }}
                          rules={
                            included
                              ? [
                                  { required: true, message: t('common.required') },
                                  {
                                    validator: async (_, v) => {
                                      if (v === undefined || v === null) return;
                                      if (v <= 0) throw new Error(t('common.required'));
                                      if (v > row.uninvoicedMt + 1e-9) {
                                        throw new Error(
                                          t('tradeInvoices.exceedsUninvoiced', { mt: formatMt(row.uninvoicedMt) }),
                                        );
                                      }
                                    },
                                  },
                                ]
                              : []
                          }
                        >
                          <InputNumber
                            min={0.01}
                            max={row.uninvoicedMt}
                            precision={2}
                            style={{ width: '100%' }}
                            disabled={!included}
                          />
                        </Form.Item>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          MT
                        </Text>
                      </div>
                    </div>
                  );
                })}
              </Space>
            )}
          </Form.List>
        </Form>
      )}
    </Modal>
  );
}
