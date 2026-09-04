import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
  theme,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  useCreateInventoryDocument,
  useInventoryDocLines,
  useInventorySourceInvoices,
  useStockLevels,
  useWarehouses,
} from '@/services/queries';
import type { InventoryDocItemInput } from '@/services/api';
import { formatMt } from '@/utils/format';
import type { InventoryDocType } from '@/types';

const { Text } = Typography;
const { TextArea } = Input;

// RTL fix (spec §5.3, mirrors tradeInvoices/containerOptions.ts): a bare `dir="ltr"` span does
// NOT change which side an ancestor's own `direction:rtl` + `overflow:hidden;text-overflow:
// ellipsis` box clips from — the ancestor still right-anchors the overflowing content and clips
// the LEADING token (verified empirically). Giving the LTR span its own block box + overflow/
// ellipsis makes it the truncating box instead, clipping the TRAILING (customer) token.
const ltrTruncateStyle: CSSProperties = {
  display: 'block',
  direction: 'ltr',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

interface DocLineFormRow {
  referenceDocumentItemId: string;
  product: string;
  remainingMt: number;
  usedInDocNumbers: string[];
  include: boolean;
  quantityMt?: number;
}

interface DocFormValues {
  warehouseId?: string;
  invoiceId?: string;
  date: Dayjs;
  notes?: string;
  lines: DocLineFormRow[];
}

interface InventoryDocFormModalProps {
  open: boolean;
  onClose: () => void;
  type: InventoryDocType;
}

/**
 * Receipt (IN) / Issue (OUT) document form — invoice-sourced only (warehouse spec §6.3).
 * ONE Form + Form.List keyed by the chain-stable `referenceDocumentItemId` (never array
 * index), mirroring the AddItemsModal pattern: per-row checkbox + qty capped at the line's
 * remaining MT, an "insert all" shortcut and a selected-count hint.
 */
export function InventoryDocFormModal({ open, onClose, type }: InventoryDocFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [form] = Form.useForm<DocFormValues>();
  const { data: warehouses } = useWarehouses();
  const { data: sourceInvoices } = useInventorySourceInvoices(type);
  const { data: stockLevels } = useStockLevels();
  const createMut = useCreateInventoryDocument();

  const [invoiceId, setInvoiceId] = useState<string | undefined>(undefined);
  const [warehouseId, setWarehouseId] = useState<string | undefined>(undefined);

  const { data: invoiceLines, isLoading: linesLoading } = useInventoryDocLines(invoiceId ?? '');

  // Reset the picked invoice/warehouse on every open/close transition (not just `if (open)`)
  // so stale selections can't survive a close — belt-and-braces alongside WarehousePage now
  // unmounting this modal entirely while closed (mirrors InvoiceDetailPage's EditLineModal
  // idiom), which is what actually clears this component's state between opens.
  useEffect(() => {
    setInvoiceId(undefined);
    setWarehouseId(undefined);
  }, [open, type]);

  const activeWarehouses = useMemo(() => (warehouses ?? []).filter((w) => w.active), [warehouses]);

  const warehouseSelectOptions = useMemo(
    () => activeWarehouses.map((w) => ({ value: w.id, label: w.name })),
    [activeWarehouses],
  );

  const invoiceSelectOptions = useMemo(
    () =>
      (sourceInvoices ?? []).map((inv) => ({
        value: inv.id,
        label: `${inv.invoiceNumber} · ${inv.customerName}`,
      })),
    [sourceInvoices],
  );

  const lines: DocLineFormRow[] = useMemo(
    () =>
      (invoiceLines ?? []).map((l) => ({
        referenceDocumentItemId: l.referenceDocumentItemId,
        product: l.product,
        remainingMt: l.remainingMt,
        usedInDocNumbers: l.usedInDocNumbers,
        include: false,
        quantityMt: undefined,
      })),
    [invoiceLines],
  );

  // Form.List's field array is keyed to remount (with a fresh `initialValue`) whenever the
  // underlying line data actually changes (new invoice picked, or remaining/used-by content
  // changes after a create/cancel elsewhere) — driving it via `form.setFieldsValue` from a
  // passive effect proved unreliable (rc-field-form's List doesn't reliably pick up a bulk
  // array replacement made outside a direct user event), so a remount is used instead.
  const linesKey = useMemo(
    () => lines.map((l) => `${l.referenceDocumentItemId}:${l.remainingMt}`).join('|'),
    [lines],
  );

  const watchedLines = Form.useWatch('lines', form) ?? lines;
  const includedCount = watchedLines.filter((l) => l?.include).length;

  // Issue-only live available-stock hint, keyed like `getStockLevels()` (spec §6.1/§6.3).
  const stockByProductKey = useMemo(() => {
    const map = new Map<string, number>();
    if (!warehouseId) return map;
    for (const row of stockLevels ?? []) {
      if (row.warehouseId === warehouseId) map.set(row.productKey, row.mt);
    }
    return map;
  }, [stockLevels, warehouseId]);

  const insertAll = () => {
    const next = lines.map((l) =>
      l.remainingMt > 1e-9 ? { ...l, include: true, quantityMt: l.remainingMt } : l,
    );
    form.setFieldsValue({ lines: next });
  };

  const submit = async () => {
    let values: DocFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validation errors render inline
    }
    const items: InventoryDocItemInput[] = values.lines
      .filter((l) => l.include)
      .map((l) => ({ referenceDocumentItemId: l.referenceDocumentItemId, quantityMt: l.quantityMt ?? 0 }));
    if (items.length === 0) {
      message.error(t('warehouse.selectAtLeastOne'));
      return;
    }
    try {
      await createMut.mutateAsync({
        type,
        warehouseId: values.warehouseId!,
        invoiceId: values.invoiceId!,
        date: values.date.toISOString(),
        notes: values.notes?.trim() || undefined,
        items,
      });
      message.success(t('warehouse.docCreated'));
      onClose();
    } catch (err) {
      const error = err as Error & { product?: string; remaining?: number; available?: number };
      const code = error.message;
      if (code === 'no-items') message.error(t('warehouse.noItems'));
      else if (code === 'warehouse-required') message.error(t('warehouse.noActiveWarehouse'));
      else if (code === 'invoice-not-confirmed') message.error(t('warehouse.invoiceNotConfirmed'));
      else if (code === 'invoice-side-mismatch') message.error(t('warehouse.invoiceSideMismatch'));
      else if (code === 'line-not-on-invoice') message.error(t('warehouse.lineNotOnInvoice'));
      else if (code === 'invalid-quantity') message.error(t('warehouse.invalidQuantity'));
      else if (code === 'exceeds-remaining') {
        message.error(
          t('warehouse.exceedsRemaining', {
            product: error.product,
            remaining: formatMt(error.remaining ?? 0),
          }),
        );
      } else if (code === 'insufficient-stock') {
        message.error(
          t('warehouse.insufficientStock', {
            product: error.product,
            available: formatMt(error.available ?? 0),
          }),
        );
      } else message.error(t('common.saveFailed'));
    }
  };

  const title = type === 'IN' ? t('warehouse.receiptTitle') : t('warehouse.issueTitle');
  const noActiveWarehouses = activeWarehouses.length === 0;

  return (
    <Modal
      open={open}
      width={760}
      title={title}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending}
      destroyOnHidden
      maskClosable={false}
      okButtonProps={{ disabled: noActiveWarehouses }}
    >
      {noActiveWarehouses && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('warehouse.noActiveWarehouse')}
        />
      )}

      <Form
        key={type}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ date: dayjs() }}
        onValuesChange={(changed) => {
          if ('invoiceId' in changed) setInvoiceId(changed.invoiceId);
          if ('warehouseId' in changed) setWarehouseId(changed.warehouseId);
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          <Form.Item
            name="warehouseId"
            label={t('warehouse.warehouse')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('warehouse.warehouse')}
              options={warehouseSelectOptions}
              disabled={noActiveWarehouses}
            />
          </Form.Item>
          <Form.Item
            name="invoiceId"
            label={t('warehouse.selectInvoice')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('warehouse.invoicePlaceholder')}
              options={invoiceSelectOptions}
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
          <Form.Item
            name="date"
            label={t('warehouse.docDate')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="notes" label={t('warehouse.docNotes')}>
            <TextArea rows={1} placeholder={t('warehouse.docNotes')} />
          </Form.Item>
        </div>

        {!invoiceId && <Empty description={t('warehouse.selectInvoice')} />}
        {invoiceId && !linesLoading && lines.length === 0 && (
          <Empty description={t('warehouse.noInvoiceLines')} />
        )}

        {invoiceId && lines.length > 0 && (
          <>
            <Space style={{ margin: '12px 0' }}>
              <Button size="small" onClick={insertAll}>
                {t('warehouse.insertAllLines')}
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('warehouse.selectedCount', { count: includedCount })}
              </Text>
            </Space>

            <Form.List key={linesKey} name="lines" initialValue={lines}>
              {(fields) => (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {fields.map((field) => {
                    // Guard against the one-frame mismatch where `Form.List`'s keyed remount
                    // (new invoice picked) has already swapped `fields` in from rc-field-form's
                    // store while `lines` (derived from the query) still reflects the previous
                    // invoice for this index — see linesKey remount note above. Self-corrects on
                    // the next commit; skipping the render here avoids the crash entirely.
                    const row = lines[field.name];
                    if (!row) return null;
                    const watchedRow = watchedLines[field.name];
                    const included = watchedRow?.include;
                    const exhausted = row.remainingMt <= 1e-9;
                    const productKey = row.product.trim().toLowerCase();
                    const availableStock =
                      type === 'OUT' && warehouseId ? stockByProductKey.get(productKey) ?? 0 : undefined;
                    const requestedQty = watchedRow?.quantityMt ?? 0;
                    const overStock =
                      type === 'OUT' &&
                      !!warehouseId &&
                      availableStock !== undefined &&
                      requestedQty > availableStock + 1e-9;

                    return (
                      <div
                        key={row.referenceDocumentItemId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 12,
                          padding: '8px 12px',
                          border: `1px solid ${token.colorBorderSecondary}`,
                          borderRadius: 8,
                          opacity: exhausted ? 0.6 : 1,
                        }}
                      >
                        <Form.Item
                          name={[field.name, 'include']}
                          valuePropName="checked"
                          style={{ marginBottom: 0 }}
                        >
                          <Checkbox disabled={exhausted} />
                        </Form.Item>
                        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                          <Text strong>{row.product}</Text>
                          <div>
                            {exhausted ? (
                              <Text type="danger" style={{ fontSize: 12 }}>
                                {t('warehouse.lineAlreadyUsed', {
                                  docNumbers: row.usedInDocNumbers.join(', '),
                                })}
                              </Text>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {t('warehouse.remainingHint', { mt: formatMt(row.remainingMt) })}
                              </Text>
                            )}
                          </div>
                          {type === 'OUT' && !exhausted && (
                            <div>
                              {warehouseId ? (
                                <Text type={overStock ? 'warning' : 'secondary'} style={{ fontSize: 12 }}>
                                  {t('warehouse.availableHint', { mt: formatMt(availableStock ?? 0) })}
                                </Text>
                              ) : (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {t('warehouse.selectWarehouse')}
                                </Text>
                              )}
                            </div>
                          )}
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
                                        if (v <= 0) throw new Error(t('warehouse.invalidQuantity'));
                                        if (v > row.remainingMt + 1e-9) {
                                          throw new Error(
                                            t('warehouse.exceedsRemaining', {
                                              product: row.product,
                                              remaining: formatMt(row.remainingMt),
                                            }),
                                          );
                                        }
                                      },
                                    },
                                  ]
                                : []
                            }
                          >
                            <InputNumber
                              min={0.000001}
                              max={row.remainingMt}
                              precision={6}
                              style={{ width: '100%' }}
                              disabled={!included || exhausted}
                            />
                          </Form.Item>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('common.mtUnit')}
                          </Text>
                        </div>
                      </div>
                    );
                  })}
                </Space>
              )}
            </Form.List>
          </>
        )}
      </Form>
    </Modal>
  );
}
