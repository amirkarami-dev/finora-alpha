import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { Money } from '@/components/common/Money';
import { CURRENCIES, ROUTES } from '@/config/constants';
import { useAddChargeLine, useChargeCategories, useCostCentres, useUpdateChargeLine } from '@/services/queries';
import type { ChargeGoodInput, ChargeLineInput } from '@/services/api';
import { splitEqually } from '@/utils/calc';
import { formatMt } from '@/utils/format';
import { useDefaultFxRate } from '@/store/useSettingsStore';
import type { ChargeDoc, ChargeLine, Currency, InvoiceItem } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

/*
 * ⚠️ THE RISKIEST FILE (design spec §6). This modal needs rows DERIVED FROM SERVER DATA *and*
 * free user add/remove/edit — and the codebase's two `Form.List` idioms conflict on exactly that:
 * `InventoryDocFormModal` forces a remount via a content-derived `key` because a passive
 * `setFieldsValue` effect "proved unreliable" against rc-field-form's List; `ContainerFormModal`
 * uses the plain `{(fields, {add, remove})}` render-prop instead. Combined naively here, every
 * add/remove would change the goods content → change the key → reset `initialValue` → discard
 * the very edit that triggered the remount.
 *
 * RESOLUTION (do not "restore consistency" with Form.List later — this is deliberate):
 *   - `Form` covers ONLY the scalar fields (category/date/amount+currency/fx/cost centre/
 *     description).
 *   - The goods grid is plain `useState<GoodRow[]>`, seeded once via a lazy initializer (this
 *     component is conditionally mounted per open by `ChargeDocDetailPage`, so a fresh mount
 *     already gives a fresh seed — the `key={line?.id ?? 'new'}` on the Modal below is
 *     belt-and-braces for the same reason every other modal in this codebase keys its Form).
 *   - Add/remove/edit/re-split are pure `setGoods` calls through the SAME `splitEqually` the
 *     server runs (`utils/calc.ts`) — spec §3's re-split table — so this live preview can never
 *     disagree with what actually gets saved.
 *   - Submit sends ONE `addChargeLine`/`updateChargeLine` call with the full goods array (server
 *     re-derives `referenceDocumentItemId`/product/qty from the invoice regardless, spec §4).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

// Line-level guards, in order (design spec §4's `buildChargeLine`).
const KNOWN_ERROR_CODES = [
  'doc-cancelled',
  'category-required',
  'category-not-found',
  'category-inactive',
  'category-mismatch',
  'date-required',
  'invalid-amount',
  'invalid-fx',
  'cost-centre-not-found',
  'goods-not-allowed',
  'goods-required',
  'good-not-on-invoice',
  'duplicate-good',
  'invalid-good-amount',
] as const;

interface GoodRow {
  invoiceItemId: string;
  product: string;
  quantityMt: number;
  amount: number;
  /** Hand-edited since the last full split — drives the "edited" marker and gates "Re-split
   *  equally" (spec §3's re-split table). */
  edited: boolean;
}

interface LineFormValues {
  categoryId: string;
  date: Dayjs;
  amount: number;
  currency: Currency;
  fxRate: number;
  costCentreId?: string;
  description?: string;
}

interface ChargeLineFormModalProps {
  open: boolean;
  onClose: () => void;
  doc: ChargeDoc;
  /** The booked invoice's items ([] for GENERAL docs) — from `useChargeDoc`'s `ChargeDocDetail`. */
  invoiceItems: InvoiceItem[];
  /** Present when editing. */
  line?: ChargeLine;
}

export function ChargeLineFormModal({ open, onClose, doc, invoiceItems, line }: ChargeLineFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<LineFormValues>();
  const addMut = useAddChargeLine();
  const updateMut = useUpdateChargeLine();
  const isEdit = !!line;
  const isInvoiceKind = doc.kind === 'INVOICE';
  const defaultFx = useDefaultFxRate();

  const { data: categoriesRaw } = useChargeCategories(doc.direction);
  const { data: costCentresRaw } = useCostCentres();

  const [goods, setGoods] = useState<GoodRow[]>(() => {
    if (!isInvoiceKind) return [];
    if (line) {
      return line.allocations.map((a) => ({
        invoiceItemId: a.invoiceItemId,
        product: a.product,
        quantityMt: a.quantityMt,
        amount: a.amount,
        edited: false,
      }));
    }
    // Create default: every item of the booked invoice (mirrors the server's `goods` omitted
    // default, spec §4), amounts seeded at 0 until the user types the line amount.
    return invoiceItems.map((it) => ({
      invoiceItemId: it.id,
      product: it.product,
      quantityMt: it.quantityMt,
      amount: 0,
      edited: false,
    }));
  });

  const currency = Form.useWatch('currency', form) ?? 'USD';

  // Sets goods AND keeps the Form's `amount` field in sync with Σ goods — the single choke point
  // every goods mutation (add/remove/hand-edit/re-split) routes through, so "line total" never
  // drifts from what the goods table shows (spec §3's `line.amount = Σ allocations` invariant).
  const applyGoods = (rows: GoodRow[]) => {
    setGoods(rows);
    form.setFieldValue('amount', round2(rows.reduce((s, r) => s + r.amount, 0)));
  };

  const availableItems = useMemo(
    () => invoiceItems.filter((it) => !goods.some((g) => g.invoiceItemId === it.id)),
    [invoiceItems, goods],
  );

  const handleAmountTyped = (v: number | null) => {
    if (!isInvoiceKind || typeof v !== 'number' || goods.length === 0) return;
    // spec §3 re-split table, row 1: "Amount typed / line created → splitEqually(amount, n)" —
    // a full re-split, discarding any prior hand edits.
    const parts = splitEqually(v, goods.length);
    setGoods(goods.map((r, i) => ({ ...r, amount: parts[i], edited: false })));
  };

  const handleEditRow = (invoiceItemId: string, value: number) => {
    // spec §3: "One good edited by hand → that allocation takes the value; line.amount = Σ
    // follows" — every OTHER row is left untouched, only the footer total (via applyGoods) moves.
    applyGoods(goods.map((r) => (r.invoiceItemId === invoiceItemId ? { ...r, amount: value, edited: true } : r)));
  };

  const handleAddGood = (invoiceItemId: string) => {
    const item = invoiceItems.find((it) => it.id === invoiceItemId);
    if (!item) return;
    const total = round2(goods.reduce((s, r) => s + r.amount, 0));
    const nextRows = [...goods, { invoiceItemId: item.id, product: item.product, quantityMt: item.quantityMt, amount: 0, edited: false }];
    // spec §3: "Good added → splitEqually(line.amount, n+1) — line total unchanged".
    const parts = splitEqually(total, nextRows.length);
    applyGoods(nextRows.map((r, i) => ({ ...r, amount: parts[i], edited: false })));
  };

  const handleRemoveGood = (invoiceItemId: string) => {
    if (goods.length <= 1) return; // last-allocation guard (spec §3/§4) — button is disabled too.
    const total = round2(goods.reduce((s, r) => s + r.amount, 0));
    const nextRows = goods.filter((r) => r.invoiceItemId !== invoiceItemId);
    // spec §3: "Good removed → splitEqually(line.amount, n-1) — line total unchanged".
    const parts = splitEqually(total, nextRows.length);
    applyGoods(nextRows.map((r, i) => ({ ...r, amount: parts[i], edited: false })));
  };

  const handleSelectAllGoods = () => {
    const total = round2(goods.reduce((s, r) => s + r.amount, 0));
    const nextRows = invoiceItems.map(
      (it) => goods.find((g) => g.invoiceItemId === it.id) ?? { invoiceItemId: it.id, product: it.product, quantityMt: it.quantityMt, amount: 0, edited: false },
    );
    const parts = splitEqually(total, nextRows.length);
    applyGoods(nextRows.map((r, i) => ({ ...r, amount: parts[i], edited: false })));
  };

  const handleResplitEqually = () => {
    const total = round2(goods.reduce((s, r) => s + r.amount, 0));
    // spec §3 re-split table, row 4: "Re-split equally → discards manual edits".
    const parts = splitEqually(total, goods.length);
    applyGoods(goods.map((r, i) => ({ ...r, amount: parts[i], edited: false })));
  };

  const categoryOptions = useMemo(() => {
    const list = (categoriesRaw ?? [])
      .filter((c) => c.scope === doc.kind && c.active)
      .map((c) => ({ value: c.id, label: c.name }));
    // Union idiom (spec §6): a saved-but-since-deactivated category must stay selectable on an
    // unrelated edit, labelled `(inactive)`, rather than silently blanking the field.
    if (line?.categoryId && !list.some((o) => o.value === line.categoryId)) {
      const saved = (categoriesRaw ?? []).find((c) => c.id === line.categoryId);
      if (saved) list.unshift({ value: saved.id, label: `${saved.name} (${t('common.inactive')})` });
    }
    return list;
  }, [categoriesRaw, doc.kind, line, t]);

  const costCentreOptions = useMemo(() => {
    const list = (costCentresRaw ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }));
    if (line?.costCentreId && !list.some((o) => o.value === line.costCentreId)) {
      const saved = (costCentresRaw ?? []).find((c) => c.id === line.costCentreId);
      if (saved) list.unshift({ value: saved.id, label: `${saved.name} (${t('common.inactive')})` });
    }
    return list;
  }, [costCentresRaw, line, t]);

  const initialValues: Partial<LineFormValues> = line
    ? {
        categoryId: line.categoryId,
        date: dayjs(line.date),
        amount: line.amount,
        currency: line.currency,
        fxRate: line.fxRate,
        costCentreId: line.costCentreId,
        description: line.description,
      }
    : { currency: 'USD', fxRate: 1, date: dayjs() };

  const footerTotal = round2(goods.reduce((s, r) => s + r.amount, 0));

  const submit = async () => {
    let values: LineFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const goodsInput: ChargeGoodInput[] | undefined = isInvoiceKind
      ? goods.map((g) => ({ invoiceItemId: g.invoiceItemId, amount: g.amount }))
      : undefined;
    const input: ChargeLineInput = {
      categoryId: values.categoryId,
      date: values.date.toISOString(),
      amount: values.amount,
      currency: values.currency,
      fxRate: values.currency === 'USD' ? 1 : values.fxRate,
      costCentreId: values.costCentreId,
      description: values.description?.trim() || undefined,
      goods: goodsInput,
    };
    try {
      if (isEdit && line) {
        await updateMut.mutateAsync({ docId: doc.id, lineId: line.id, input });
        message.success(t('charges.lineUpdated'));
      } else {
        await addMut.mutateAsync({ docId: doc.id, input });
        message.success(t('charges.lineCreated'));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if ((KNOWN_ERROR_CODES as readonly string[]).includes(code)) message.error(t(`charges.errors.${code}`));
      else message.error(t('common.saveFailed'));
    }
  };

  const goodsColumns: ColumnsType<GoodRow> = [
    { title: t('items.product'), dataIndex: 'product', render: (v) => <Text strong>{v}</Text> },
    { title: t('items.quantityMt'), dataIndex: 'quantityMt', width: 110, align: 'right', render: (v) => formatMt(v) },
    {
      title: t('charges.goodAmount'),
      key: 'amount',
      width: 190,
      align: 'right',
      render: (_, r) => (
        <Space size={6}>
          {r.edited && <Tag>{t('charges.edited')}</Tag>}
          <InputNumber
            value={r.amount}
            min={0}
            step={0.01}
            precision={2}
            style={{ width: 110 }}
            onChange={(v) => handleEditRow(r.invoiceItemId, v ?? 0)}
          />
        </Space>
      ),
    },
    {
      title: '',
      key: 'remove',
      width: 44,
      align: 'center',
      render: (_, r) => (
        <Tooltip title={goods.length <= 1 ? t('charges.lastGoodHint') : undefined}>
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            disabled={goods.length <= 1}
            onClick={() => handleRemoveGood(r.invoiceItemId)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Modal
      key={line?.id ?? 'new'}
      open={open}
      width={720}
      title={isEdit ? t('charges.editLine') : t('charges.addLine')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={addMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item name="categoryId" label={t('charges.category')} rules={[{ required: true, message: t('common.required') }]}>
          <Select
            showSearch
            optionFilterProp="label"
            options={categoryOptions}
            // Categories are master data now (spec §1), so "no options" means BaseInfo is empty —
            // AntD's bare "No data" would read as a bug. Point at the tab that fixes it, on the
            // direction whose list is actually missing (spec §10.11).
            notFoundContent={
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>{t('charges.noCategoriesTitle')}</Text>
                    <Text type="secondary">{t('charges.noCategoriesHint')}</Text>
                  </Space>
                }
              >
                <Button
                  size="small"
                  onClick={() =>
                    navigate(
                      `${ROUTES.baseInfo}?tab=${doc.direction === 'EXPENSE' ? 'expenseCategories' : 'revenueCategories'}`,
                    )
                  }
                >
                  {t('charges.openBaseInfo')}
                </Button>
              </Empty>
            }
          />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <Form.Item name="date" label={t('charges.date')} rules={[{ required: true, message: t('common.required') }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>

          <Form.Item label={t('charges.amount')} required>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="amount" noStyle rules={[{ required: true, message: t('common.required') }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} precision={2} onChange={handleAmountTyped} />
              </Form.Item>
              <Form.Item name="currency" noStyle rules={[{ required: true, message: t('common.required') }]}>
                <Select
                  style={{ width: 90 }}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(value: Currency) => form.setFieldValue('fxRate', defaultFx(value))}
                />
              </Form.Item>
            </Space.Compact>
          </Form.Item>

          <Form.Item name="fxRate" label={t('charges.fx')} rules={[{ required: true, message: t('common.required') }]}>
            <InputNumber style={{ width: '100%' }} min={0.0001} step={0.0001} disabled={currency === 'USD'} />
          </Form.Item>

          <Form.Item name="costCentreId" label={t('charges.costCentre')}>
            <Select allowClear options={costCentreOptions} />
          </Form.Item>
        </div>

        <Form.Item name="description" label={t('charges.description')}>
          <TextArea rows={2} maxLength={500} showCount placeholder={t('charges.descriptionPlaceholder')} />
        </Form.Item>
      </Form>

      {isInvoiceKind && (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <Select
              style={{ width: 240 }}
              placeholder={t('charges.addGoodPlaceholder')}
              value={undefined}
              disabled={availableItems.length === 0}
              options={availableItems.map((it) => ({ value: it.id, label: `${it.product} · ${formatMt(it.quantityMt)}` }))}
              onChange={handleAddGood}
            />
            <Button size="small" onClick={handleSelectAllGoods} disabled={availableItems.length === 0}>
              {t('charges.selectAllGoods')}
            </Button>
            <Button size="small" onClick={handleResplitEqually} disabled={!goods.some((g) => g.edited)}>
              {t('charges.resplitEqually')}
            </Button>
          </Space>

          <Table<GoodRow>
            rowKey="invoiceItemId"
            size="small"
            pagination={false}
            columns={goodsColumns}
            dataSource={goods}
            footer={() => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>{t('charges.lineTotal')}</Text>
                <Money value={footerTotal} currency={currency} strong fractionDigits={2} />
              </div>
            )}
          />
        </>
      )}
    </Modal>
  );
}
