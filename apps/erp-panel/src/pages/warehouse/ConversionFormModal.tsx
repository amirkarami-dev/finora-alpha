import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  App,
  AutoComplete,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { Money } from '@/components/common/Money';
import { CURRENCIES } from '@/config/constants';
import {
  useChargeCategories,
  useCreateConversion,
  useCustomers,
  useGoods,
  useUpdateConversion,
  useWarehouses,
} from '@/services/queries';
import { aedToUsd } from '@/utils/calc';
import { formatMt } from '@/utils/format';
import { useDefaultFxRate } from '@/store/useSettingsStore';
import type { ConversionDocInput, ConversionDocument, Currency } from '@/types';

const { TextArea } = Input;
const { Text, Title } = Typography;

// RTL fix (spec §5.3, mirrors InventoryDocFormModal/containerOptions.ts): a bare `dir="ltr"`
// span does NOT change which side an ancestor's own `direction:rtl` box clips from — the
// ancestor still right-anchors overflowing content and clips the LEADING token. Giving the LTR
// span its own block box + overflow/ellipsis makes IT the truncating box, clipping the TRAILING
// token instead — the fix, applied to the product AutoComplete's own option list.
const ltrTruncateStyle: CSSProperties = {
  display: 'block',
  direction: 'ltr',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

interface InputRow {
  key: string;
  product: string;
  quantityMt?: number;
}

interface OutputRow {
  key: string;
  product: string;
  quantityMt?: number;
  sharePercent?: number | null;
}

interface CostRow {
  key: string;
  categoryId?: string;
  personId?: string;
  amount?: number;
  currency: Currency;
  /** Optional so a cleared `InputNumber` (which reports `null`) never silently becomes 1 on a
   *  non-USD row — submit refuses an incomplete row instead of guessing a rate. */
  fxRate?: number;
  description?: string;
}

interface HeaderFormValues {
  warehouseId?: string;
  date?: Dayjs;
  notes?: string;
}

interface ConversionFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing a DRAFT — the caller only opens this modal for drafts. */
  conversion?: ConversionDocument;
}

/** Active options for a picker, plus the saved-but-since-deactivated value on edit (the same
 *  union idiom as `ChargeLineFormModal`'s category/person pickers) — otherwise editing an
 *  unrelated field on an old draft would silently blank a reference that has since gone inactive. */
function withInactiveFallback(
  active: { id: string; name: string }[],
  all: { id: string; name: string }[],
  selectedId: string | undefined,
  inactiveLabel: string,
): { value: string; label: string }[] {
  const options = active.map((x) => ({ value: x.id, label: x.name }));
  if (selectedId && !options.some((o) => o.value === selectedId)) {
    const saved = all.find((x) => x.id === selectedId);
    if (saved) options.unshift({ value: saved.id, label: `${saved.name} (${inactiveLabel})` });
  }
  return options;
}

/**
 * Conversion header (Form) + three free-form line tables (plain `useState`, not `Form.List` —
 * mirrors `ChargeLineFormModal`'s resolution of the same conflict: rows here are edited entirely
 * by hand, so there is no derived-from-server-data remount to fight with).
 */
export function ConversionFormModal({ open, onClose, conversion }: ConversionFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<HeaderFormValues>();
  const isEdit = !!conversion;

  const { data: warehouses } = useWarehouses();
  const { data: goods } = useGoods();
  const { data: categoriesRaw } = useChargeCategories('EXPENSE');
  const { data: customersRaw } = useCustomers();
  const defaultFx = useDefaultFxRate();

  const createMut = useCreateConversion();
  const updateMut = useUpdateConversion();

  const nextKey = useRef(0);
  const newKey = () => `new-${nextKey.current++}`;

  const [inputRows, setInputRows] = useState<InputRow[]>(() =>
    conversion
      ? conversion.inputs.map((i) => ({ key: i.id, product: i.product, quantityMt: i.quantityMt }))
      : [],
  );
  const [outputRows, setOutputRows] = useState<OutputRow[]>(() =>
    conversion
      ? conversion.outputs.map((o) => ({
          key: o.id,
          product: o.product,
          quantityMt: o.quantityMt,
          sharePercent: o.sharePercent ?? null,
        }))
      : [],
  );
  const [costRows, setCostRows] = useState<CostRow[]>(() =>
    conversion
      ? conversion.costs.map((c) => ({
          key: c.id,
          categoryId: c.categoryId,
          personId: c.personId,
          amount: c.amount,
          currency: c.currency,
          fxRate: c.fxRate,
          description: c.description,
        }))
      : [],
  );

  const addInput = () => setInputRows((rows) => [...rows, { key: newKey(), product: '', quantityMt: undefined }]);
  const updateInput = (key: string, patch: Partial<InputRow>) =>
    setInputRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeInput = (key: string) => setInputRows((rows) => rows.filter((r) => r.key !== key));

  const addOutput = () =>
    setOutputRows((rows) => [...rows, { key: newKey(), product: '', quantityMt: undefined, sharePercent: undefined }]);
  const updateOutput = (key: string, patch: Partial<OutputRow>) =>
    setOutputRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeOutput = (key: string) => setOutputRows((rows) => rows.filter((r) => r.key !== key));

  const addCost = () =>
    setCostRows((rows) => [
      ...rows,
      { key: newKey(), categoryId: undefined, personId: undefined, amount: undefined, currency: 'USD', fxRate: 1, description: undefined },
    ]);
  const updateCost = (key: string, patch: Partial<CostRow>) =>
    setCostRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeCost = (key: string) => setCostRows((rows) => rows.filter((r) => r.key !== key));

  const activeWarehouses = useMemo(() => (warehouses ?? []).filter((w) => w.active), [warehouses]);
  const warehouseOptions = useMemo(
    () => withInactiveFallback(activeWarehouses, warehouses ?? [], conversion?.warehouseId, t('common.inactive')),
    [activeWarehouses, warehouses, conversion, t],
  );

  const productOptions = useMemo(
    () => (goods ?? []).filter((g) => g.active).map((g) => ({ value: g.name })),
    [goods],
  );

  // The saved-but-since-deactivated fallback pool for the category picker must itself stay
  // scoped to GENERAL — otherwise an active category outside that scope (never a selectable
  // option here) would fall into the "(inactive)" branch and be mislabelled.
  const generalCategories = useMemo(
    () => (categoriesRaw ?? []).filter((c) => c.scope === 'GENERAL'),
    [categoriesRaw],
  );
  const activeCategories = useMemo(
    () => generalCategories.filter((c) => c.active),
    [generalCategories],
  );
  const activePersons = useMemo(() => (customersRaw ?? []).filter((c) => c.active), [customersRaw]);

  const initialValues: HeaderFormValues = conversion
    ? { warehouseId: conversion.warehouseId, date: dayjs(conversion.date), notes: conversion.notes }
    : { date: dayjs() };

  const totalInputMt = inputRows.reduce((s, r) => s + (r.quantityMt ?? 0), 0);
  const totalOutputMt = outputRows.reduce((s, r) => s + (r.quantityMt ?? 0), 0);
  const yieldPercent =
    totalInputMt > 0 && totalOutputMt > 0 ? `${((totalOutputMt / totalInputMt) * 100).toFixed(2)}%` : '—';
  const totalCostUsd = costRows.reduce((s, r) => {
    const amt = r.amount ?? 0;
    return s + (r.currency === 'USD' ? amt : aedToUsd(amt, r.fxRate || 1));
  }, 0);

  const submit = async () => {
    let header: HeaderFormValues;
    try {
      header = await form.validateFields();
    } catch {
      return; // validation errors render inline
    }

    const validInputs = inputRows.filter((r) => r.product.trim() && (r.quantityMt ?? 0) > 0);
    const validOutputs = outputRows.filter((r) => r.product.trim() && (r.quantityMt ?? 0) > 0);
    if (validInputs.length === 0 || validOutputs.length === 0) {
      message.error(t('conversions.needInputAndOutput'));
      return;
    }

    const sharesGiven = validOutputs.filter((r) => r.sharePercent !== null && r.sharePercent !== undefined);
    if (sharesGiven.length > 0) {
      const sum = sharesGiven.reduce((s, r) => s + (r.sharePercent ?? 0), 0);
      if (sharesGiven.length !== validOutputs.length || Math.abs(sum - 100) > 0.01) {
        message.error(t('conversions.invalidShares'));
        return;
      }
    }

    // A cost row with nothing filled in is just an unused blank line — drop it. A cost row
    // that has been *started* (any of category/person/amount set) must be complete, fxRate
    // included: silently dropping half-filled rows, or letting a cleared non-USD fxRate fall
    // back to 1, would both quietly change what gets booked.
    const startedCosts = costRows.filter((r) => r.categoryId || r.personId || (r.amount ?? 0) > 0);
    for (const r of startedCosts) {
      const missingCore = !r.categoryId || !r.personId || !((r.amount ?? 0) > 0);
      const missingFx = r.currency !== 'USD' && !((r.fxRate ?? 0) > 0);
      if (missingCore || missingFx) {
        message.error(t('common.required'));
        return;
      }
    }
    const validCosts = startedCosts;

    const input: ConversionDocInput = {
      warehouseId: header.warehouseId!,
      date: header.date!.toISOString(),
      notes: header.notes?.trim() || undefined,
      inputs: validInputs.map((r) => ({ product: r.product.trim(), quantityMt: r.quantityMt! })),
      outputs: validOutputs.map((r) => ({
        product: r.product.trim(),
        quantityMt: r.quantityMt!,
        sharePercent: r.sharePercent ?? null,
      })),
      costs: validCosts.map((r) => ({
        categoryId: r.categoryId!,
        personId: r.personId!,
        amount: r.amount!,
        currency: r.currency,
        fxRate: r.currency === 'USD' ? 1 : r.fxRate!,
        description: r.description?.trim() || undefined,
      })),
    };

    try {
      if (isEdit && conversion) {
        await updateMut.mutateAsync({ id: conversion.id, input });
        message.success(t('conversions.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('conversions.created'));
      }
      onClose();
    } catch (err) {
      const error = err as Error & { product?: string; available?: number };
      const code = error.message;
      if (code === 'conversion-empty') message.error(t('conversions.needInputAndOutput'));
      else if (code === 'invalid-shares') message.error(t('conversions.invalidShares'));
      else if (code === 'cost-category-invalid') message.error(t('conversions.costCategoryInvalid'));
      else if (code === 'insufficient-stock') {
        message.error(
          t('conversions.insufficientStock', {
            product: error.product ?? '',
            available: formatMt(error.available ?? 0),
          }),
        );
      } else message.error(t('common.saveFailed'));
    }
  };

  const inputColumns: ColumnsType<InputRow> = [
    {
      title: t('conversions.product'),
      key: 'product',
      render: (_, r) => (
        <AutoComplete
          value={r.product}
          options={productOptions}
          style={{ width: '100%' }}
          placeholder={t('conversions.product')}
          filterOption={(input, option) =>
            String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
          }
          optionRender={(o) => (
            <span dir="ltr" style={ltrTruncateStyle}>
              {String(o.value)}
            </span>
          )}
          onChange={(v) => updateInput(r.key, { product: v })}
        />
      ),
    },
    {
      title: t('conversions.quantityMt'),
      key: 'quantityMt',
      width: 160,
      render: (_, r) => (
        <InputNumber
          min={0.001}
          step={0.001}
          style={{ width: '100%' }}
          value={r.quantityMt}
          onChange={(v) => updateInput(r.key, { quantityMt: v ?? undefined })}
        />
      ),
    },
    {
      title: '',
      key: 'remove',
      width: 44,
      align: 'center',
      render: (_, r) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeInput(r.key)} />
      ),
    },
  ];

  const outputColumns: ColumnsType<OutputRow> = [
    {
      title: t('conversions.product'),
      key: 'product',
      render: (_, r) => (
        <AutoComplete
          value={r.product}
          options={productOptions}
          style={{ width: '100%' }}
          placeholder={t('conversions.product')}
          filterOption={(input, option) =>
            String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
          }
          optionRender={(o) => (
            <span dir="ltr" style={ltrTruncateStyle}>
              {String(o.value)}
            </span>
          )}
          onChange={(v) => updateOutput(r.key, { product: v })}
        />
      ),
    },
    {
      title: t('conversions.quantityMt'),
      key: 'quantityMt',
      width: 160,
      render: (_, r) => (
        <InputNumber
          min={0.001}
          step={0.001}
          style={{ width: '100%' }}
          value={r.quantityMt}
          onChange={(v) => updateOutput(r.key, { quantityMt: v ?? undefined })}
        />
      ),
    },
    {
      title: t('conversions.share'),
      key: 'sharePercent',
      width: 170,
      render: (_, r) => (
        <InputNumber
          min={0}
          max={100}
          step={0.01}
          style={{ width: '100%' }}
          placeholder={t('conversions.shareHint')}
          value={r.sharePercent ?? undefined}
          onChange={(v) => updateOutput(r.key, { sharePercent: v ?? null })}
        />
      ),
    },
    {
      title: '',
      key: 'remove',
      width: 44,
      align: 'center',
      render: (_, r) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeOutput(r.key)} />
      ),
    },
  ];

  const costColumns: ColumnsType<CostRow> = [
    {
      title: t('conversions.category'),
      key: 'categoryId',
      width: 180,
      render: (_, r) => (
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          placeholder={t('conversions.category')}
          options={withInactiveFallback(activeCategories, generalCategories, r.categoryId, t('common.inactive'))}
          value={r.categoryId}
          onChange={(v) => updateCost(r.key, { categoryId: v })}
        />
      ),
    },
    {
      title: t('conversions.person'),
      key: 'personId',
      width: 180,
      render: (_, r) => (
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          placeholder={t('conversions.person')}
          options={withInactiveFallback(activePersons, customersRaw ?? [], r.personId, t('common.inactive'))}
          value={r.personId}
          onChange={(v) => updateCost(r.key, { personId: v })}
        />
      ),
    },
    {
      title: t('conversions.amount'),
      key: 'amount',
      width: 130,
      render: (_, r) => (
        <InputNumber
          min={0}
          step={0.01}
          precision={2}
          style={{ width: '100%' }}
          value={r.amount}
          onChange={(v) => updateCost(r.key, { amount: v ?? undefined })}
        />
      ),
    },
    {
      title: t('conversions.currency'),
      key: 'currency',
      width: 100,
      render: (_, r) => (
        <Select
          style={{ width: '100%' }}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={r.currency}
          onChange={(v: Currency) => updateCost(r.key, { currency: v, fxRate: v === 'USD' ? 1 : defaultFx(v) })}
        />
      ),
    },
    {
      title: t('conversions.fxRate'),
      key: 'fxRate',
      width: 120,
      render: (_, r) => (
        <InputNumber
          min={0.0001}
          step={0.0001}
          style={{ width: '100%' }}
          disabled={r.currency === 'USD'}
          value={r.fxRate}
          onChange={(v) => updateCost(r.key, { fxRate: v ?? undefined })}
        />
      ),
    },
    {
      title: t('conversions.description'),
      key: 'description',
      render: (_, r) => (
        <Input
          value={r.description}
          placeholder={t('conversions.description')}
          onChange={(e) => updateCost(r.key, { description: e.target.value })}
        />
      ),
    },
    {
      title: '',
      key: 'remove',
      width: 44,
      align: 'center',
      render: (_, r) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeCost(r.key)} />
      ),
    },
  ];

  return (
    <Modal
      key={conversion?.id ?? 'new'}
      open={open}
      width={960}
      title={isEdit ? t('conversions.editConversion') : t('conversions.newConversion')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <Form.Item
            name="warehouseId"
            label={t('conversions.warehouse')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('conversions.warehouse')}
              options={warehouseOptions}
              disabled={activeWarehouses.length === 0}
            />
          </Form.Item>
          <Form.Item
            name="date"
            label={t('conversions.date')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="notes" label={t('conversions.notes')}>
            <TextArea rows={1} placeholder={t('conversions.notes')} />
          </Form.Item>
        </div>
      </Form>

      <Title level={5} style={{ marginTop: 8, marginBottom: 8 }}>
        {t('conversions.inputs')}
      </Title>
      <Space style={{ marginBottom: 8 }}>
        <Button size="small" icon={<PlusOutlined />} onClick={addInput}>
          {t('conversions.addInput')}
        </Button>
      </Space>
      <Table<InputRow>
        rowKey="key"
        size="small"
        pagination={false}
        columns={inputColumns}
        dataSource={inputRows}
        scroll={{ x: 'max-content' }}
      />

      <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>
        {t('conversions.outputs')}
      </Title>
      <Space style={{ marginBottom: 8 }}>
        <Button size="small" icon={<PlusOutlined />} onClick={addOutput}>
          {t('conversions.addOutput')}
        </Button>
      </Space>
      <Table<OutputRow>
        rowKey="key"
        size="small"
        pagination={false}
        columns={outputColumns}
        dataSource={outputRows}
        scroll={{ x: 'max-content' }}
      />

      <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>
        {t('conversions.costs')}
      </Title>
      <Space style={{ marginBottom: 8 }}>
        <Button size="small" icon={<PlusOutlined />} onClick={addCost}>
          {t('conversions.addCost')}
        </Button>
      </Space>
      <Table<CostRow>
        rowKey="key"
        size="small"
        pagination={false}
        columns={costColumns}
        dataSource={costRows}
        scroll={{ x: 'max-content' }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 16 }}>
        <Text>
          {t('conversions.yield')}: <Text strong>{yieldPercent}</Text>
        </Text>
        <Text>
          {t('conversions.addedCost')}: <Money value={totalCostUsd} strong />
        </Text>
      </div>
    </Modal>
  );
}
