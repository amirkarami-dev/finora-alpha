import { useEffect, useRef, useState } from 'react';
import { App, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { Money } from '@/components/common/Money';
import { CURRENCIES } from '@/config/constants';
import { InvoicePickerModal } from '@/pages/charges/InvoicePickerModal';
import { useCreateClaim, useTradeInvoice, useUpdateClaim } from '@/services/queries';
import type { ChargeSourceInvoiceRow, ClaimInput, ClaimItemInput, ClaimRow } from '@/services/api';
import { formatMt } from '@/utils/format';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ClaimSide, ClaimType, Currency, InvoiceSide } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

/*
 * design spec §6 — mirrors `ChargeLineFormModal`'s resolution to the SAME rc-field-form hazard
 * (a `Form.List` remount-on-content-change discards the very edit that triggered it): `Form`
 * covers ONLY the header scalar fields (title/claimType/date/currency+fx/description); the items
 * grid is plain `useState<ItemRow[]>`.
 *
 * UNLIKE `ChargeLineFormModal` (whose goods come from a prop already loaded by the parent detail
 * page), this modal owns the invoice pick itself — `ClaimsPage` has no invoice loaded yet when it
 * opens this modal — so the items grid can't use a synchronous lazy initializer; it seeds via an
 * effect gated on `useTradeInvoice(invoiceId)` resolving, guarded by `seededInvoiceIdRef` so a
 * re-render (or query refetch) never wipes hand-typed amounts by re-seeding for the SAME invoice
 * twice. Picking a DIFFERENT invoice (create-mode only — invoiceId is immutable on edit) changes
 * the guarded id, which legitimately reseeds.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

// Claim guards, in order (design spec §4's `createClaim`/`updateClaim`).
const KNOWN_ERROR_CODES = [
  'title-required',
  'date-required',
  'invoice-required',
  'invoice-not-found',
  'invoice-side-mismatch',
  'invoice-not-confirmed',
  'claim-type-required',
  'invalid-fx',
  'no-claim-items',
  'item-not-on-invoice',
  'invalid-item-amount',
  'duplicate-item',
  'claim-cancelled',
  'invoice-immutable',
  'side-immutable',
] as const;

// Mirrors the claim-side mapping in design spec §1's binding-decision table (expense-claim →
// PURCHASE invoices, revenue-claim → SALE) — same mapping `ChargeListPage` uses for charge docs.
const CLAIM_INVOICE_SIDE: Record<ClaimSide, InvoiceSide> = { EXPENSE: 'PURCHASE', REVENUE: 'SALE' };

interface ItemRow {
  invoiceItemId: string;
  product: string;
  quantityMt: number;
  amount: number;
  description: string;
}

interface HeaderFormValues {
  title: string;
  claimType: ClaimType;
  date: Dayjs;
  currency: Currency;
  fxRate: number;
  description?: string;
}

interface ClaimFormModalProps {
  open: boolean;
  side: ClaimSide;
  /** Present when editing. */
  claim?: ClaimRow;
  onClose: () => void;
}

export function ClaimFormModal({ open, side, claim, onClose }: ClaimFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<HeaderFormValues>();
  const createMut = useCreateClaim();
  const updateMut = useUpdateClaim();
  const isEdit = !!claim;
  const settingsFxRate = useSettingsStore((s) => s.fxRate);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedInvoice, setPickedInvoice] = useState<ChargeSourceInvoiceRow | undefined>(undefined);
  const invoiceId = claim?.invoiceId ?? pickedInvoice?.id;

  const { data: invoiceDetail, isLoading: invoiceLoading } = useTradeInvoice(invoiceId ?? '');

  const [rows, setRows] = useState<ItemRow[]>([]);
  const seededInvoiceIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!invoiceDetail) return;
    if (seededInvoiceIdRef.current === invoiceDetail.invoice.id) return;
    seededInvoiceIdRef.current = invoiceDetail.invoice.id;
    setRows(
      invoiceDetail.items.map((it) => {
        const existing = claim?.items.find((ci) => ci.invoiceItemId === it.id);
        return {
          invoiceItemId: it.id,
          product: it.product,
          quantityMt: it.quantityMt,
          amount: existing?.amount ?? 0,
          description: existing?.description ?? '',
        };
      }),
    );
    // `claim` is intentionally read only inside the effect body, not listed as a dep — it never
    // changes across the lifetime of one modal instance (the Modal is keyed by `claim?.id`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceDetail]);

  const currency = Form.useWatch('currency', form) ?? 'USD';
  const totalAmount = round2(rows.reduce((s, r) => s + (r.amount || 0), 0));

  const handlePick = (inv: ChargeSourceInvoiceRow) => {
    setPickedInvoice(inv);
    setRows([]);
    seededInvoiceIdRef.current = undefined;
    setPickerOpen(false);
  };

  const handleAmountChange = (invoiceItemId: string, value: number) => {
    setRows((prev) => prev.map((r) => (r.invoiceItemId === invoiceItemId ? { ...r, amount: value } : r)));
  };

  const handleDescriptionChange = (invoiceItemId: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.invoiceItemId === invoiceItemId ? { ...r, description: value } : r)));
  };

  const initialValues: Partial<HeaderFormValues> = claim
    ? {
        title: claim.title,
        claimType: claim.claimType,
        date: dayjs(claim.date),
        currency: claim.currency,
        fxRate: claim.fxRate,
        description: claim.description,
      }
    : { currency: 'USD', fxRate: 1, date: dayjs() };

  const invoiceLabel = pickedInvoice
    ? pickedInvoice.customerName
      ? `${pickedInvoice.invoiceNumber} — ${pickedInvoice.customerName}`
      : pickedInvoice.invoiceNumber
    : claim
      ? claim.partyName
        ? `${claim.invoiceNumber ?? claim.invoiceId} — ${claim.partyName}`
        : (claim.invoiceNumber ?? claim.invoiceId)
      : undefined;

  const submit = async () => {
    let values: HeaderFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (!invoiceId) {
      message.error(t('claims.errors.invoice-required'));
      return;
    }
    // Dropped client-side too (spec §6) — the server drops amount<=0 rows anyway, but sending
    // them along would be misleading in a network-inspector sense.
    const items: ClaimItemInput[] = rows
      .filter((r) => r.amount > 0)
      .map((r) => ({ invoiceItemId: r.invoiceItemId, amount: r.amount, description: r.description.trim() || undefined }));

    const input: ClaimInput = {
      side,
      title: values.title.trim(),
      invoiceId,
      claimType: values.claimType,
      date: values.date.toISOString(),
      currency: values.currency,
      fxRate: values.currency === 'USD' ? 1 : values.fxRate,
      description: values.description?.trim() || undefined,
      items,
    };
    try {
      if (isEdit && claim) {
        await updateMut.mutateAsync({ id: claim.id, input });
        message.success(t('claims.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('claims.created'));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if ((KNOWN_ERROR_CODES as readonly string[]).includes(code)) message.error(t(`claims.errors.${code}`));
      else message.error(t('common.saveFailed'));
    }
  };

  const itemColumns: ColumnsType<ItemRow> = [
    { title: t('items.product'), dataIndex: 'product', render: (v) => <Text strong>{v}</Text> },
    { title: t('items.quantityMt'), dataIndex: 'quantityMt', width: 100, align: 'right', render: (v) => formatMt(v) },
    {
      title: t('claims.amount'),
      key: 'amount',
      width: 150,
      align: 'right',
      render: (_, r) => (
        <InputNumber
          value={r.amount}
          min={0}
          step={0.01}
          precision={2}
          style={{ width: 120 }}
          onChange={(v) => handleAmountChange(r.invoiceItemId, v ?? 0)}
        />
      ),
    },
    {
      title: t('claims.description'),
      key: 'description',
      render: (_, r) => (
        <Input
          value={r.description}
          placeholder={t('claims.itemDescriptionPlaceholder')}
          onChange={(e) => handleDescriptionChange(r.invoiceItemId, e.target.value)}
        />
      ),
    },
  ];

  const title = isEdit ? t('claims.editClaim') : t('claims.newClaim');

  return (
    <>
      <Modal
        key={claim?.id ?? 'new'}
        open={open}
        width={760}
        title={title}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        onOk={submit}
        onCancel={onClose}
        confirmLoading={createMut.isPending || updateMut.isPending}
        okButtonProps={{ disabled: !invoiceId }}
        destroyOnHidden
        maskClosable={false}
      >
        <Form.Item label={t('claims.invoice')} style={{ marginBottom: 12 }}>
          {invoiceLabel ? (
            <Space.Compact style={{ width: '100%' }}>
              <Input disabled dir="ltr" value={invoiceLabel} />
              {!isEdit && (
                <Button onClick={() => setPickerOpen(true)}>{t('claims.changeInvoice')}</Button>
              )}
            </Space.Compact>
          ) : (
            <Button onClick={() => setPickerOpen(true)}>{t('claims.selectInvoice')}</Button>
          )}
        </Form.Item>

        <Form form={form} layout="vertical" preserve={false} initialValues={initialValues}>
          <Form.Item name="title" label={t('claims.claimTitle')} rules={[{ required: true, message: t('common.required') }]}>
            <Input placeholder={t('claims.titlePlaceholder')} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <Form.Item name="claimType" label={t('claims.claimType')} rules={[{ required: true, message: t('common.required') }]}>
              <Select
                options={[
                  { value: 'QUANTITY', label: t('claimTypes.QUANTITY') },
                  { value: 'QUALITY', label: t('claimTypes.QUALITY') },
                ]}
              />
            </Form.Item>

            <Form.Item name="date" label={t('claims.date')} rules={[{ required: true, message: t('common.required') }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>

            <Form.Item name="currency" label={t('claims.currency')} rules={[{ required: true, message: t('common.required') }]}>
              <Select
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                onChange={(value: Currency) => form.setFieldValue('fxRate', value === 'AED' ? settingsFxRate : 1)}
              />
            </Form.Item>

            <Form.Item name="fxRate" label={t('claims.fxRate')} rules={[{ required: true, message: t('common.required') }]}>
              <InputNumber style={{ width: '100%' }} min={0.0001} step={0.0001} disabled={currency !== 'AED'} />
            </Form.Item>
          </div>

          <Form.Item name="description" label={t('claims.description')}>
            <TextArea rows={2} maxLength={500} showCount placeholder={t('claims.descriptionPlaceholder')} />
          </Form.Item>
        </Form>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            marginBottom: 8,
          }}
        >
          <Text strong>{t('claims.amount')}</Text>
          {/* Read-only, SERVER-DERIVED sum of the item amounts (design spec §2/§6 "user
              decision") — never a form field, never submitted directly. */}
          <Money value={totalAmount} currency={currency} strong fractionDigits={2} />
        </div>

        {!invoiceId ? (
          <Empty description={t('claims.pickInvoiceFirst')} />
        ) : (
          <Table<ItemRow>
            rowKey="invoiceItemId"
            size="small"
            loading={invoiceLoading}
            pagination={false}
            columns={itemColumns}
            dataSource={rows}
          />
        )}
      </Modal>

      <InvoicePickerModal
        open={pickerOpen}
        side={CLAIM_INVOICE_SIDE[side]}
        onCancel={() => setPickerOpen(false)}
        onPick={handlePick}
      />
    </>
  );
}
