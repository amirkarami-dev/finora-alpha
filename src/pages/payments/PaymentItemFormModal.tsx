import { useEffect, useMemo, useState } from 'react';
import { App, Alert, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { CURRENCIES, PAYMENT_METHODS } from '@/config/constants';
import {
  useAddPaymentItem,
  useChargeSourceInvoices,
  useCheques,
  useFinancialAccounts,
  useTradeInvoice,
  useUpdatePaymentItem,
} from '@/services/queries';
import { useDefaultFxRate } from '@/store/useSettingsStore';
import type { PaymentItemInput, PaymentItemRow } from '@/services/api';
import type { ChequeType, Currency, FinancialAccountType, PaymentMethod, PaymentType } from '@/types';

const { Text } = Typography;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Line-level guards, in the order `buildPaymentItem` applies them. */
const KNOWN_ERROR_CODES = [
  'payment-not-found',
  'payment-confirmed',
  'payment-item-not-found',
  'invoice-required',
  'invoice-not-found',
  'invoice-not-allowed',
  'allocations-not-allowed',
  'date-required',
  'invalid-amount',
  'invalid-fx',
  'bank-account-required',
  'bank-account-not-found',
  'bank-account-inactive',
  'account-type-mismatch',
  'cheque-required',
  'cheque-not-found',
  'item-not-on-invoice',
  'duplicate-allocation',
  'invalid-allocation-amount',
  'over-allocated',
  'allocations-required',
  'allocation-mismatch',
] as const;

/** Raised by the inline cheque, so they translate from the `cheques.*` namespace instead. */
const CHEQUE_ERROR_CODES = [
  'number-required',
  'bank-name-required',
  'owner-required',
  'due-date-required',
  'duplicate-cheque-number',
] as const;

interface ItemFormValues {
  invoiceId: string;
  date: Dayjs;
  amount: number;
  currency: Currency;
  fxRate: number;
  method: PaymentMethod;
  bankAccountId?: string;
  chequeId?: string;
  /* Inline cheque — flat fields rather than a nested object, so AntD validation and the
     `required` markers work per field the way they do everywhere else in this form. */
  chequeNumber?: string;
  chequeBankName?: string;
  chequeOwnerName?: string;
  chequeDueDate?: Dayjs;
  chequeType?: ChequeType;
}

interface AllocRow {
  invoiceItemId: string;
  product: string;
  /** What the invoice line is worth, for context. */
  lineAmount: number;
  amount: number;
}

interface PaymentItemFormModalProps {
  open: boolean;
  onClose: () => void;
  paymentId: string;
  /** GENERAL hides the invoice picker and the allocation grid — money on account settles no
   *  particular document, and the server refuses an invoice on such a line. */
  paymentType: PaymentType;
  /** The person on the header. The picker offers only THEIR documents — a payment settles what
   *  one person owes or is owed, so offering everybody's invoices invites paying the wrong
   *  party's document from this person's money. */
  customerId: string;
  /** Header currency + what the header still has unallocated, used to seed a new line. */
  defaultCurrency: Currency;
  unallocated: number;
  item?: PaymentItemRow;
}

/**
 * One settlement line. The allocation grid is plain `useState` + a `Table`, NOT `Form.List` —
 * the same decision recorded on `ChargeLineFormModal`: rows are derived from server data AND
 * user-editable, and the codebase's two Form.List idioms fight each other on exactly that.
 */
export function PaymentItemFormModal({
  open,
  onClose,
  paymentId,
  paymentType,
  customerId,
  defaultCurrency,
  unallocated,
  item,
}: PaymentItemFormModalProps) {
  const isGeneral = paymentType === 'GENERAL';
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<ItemFormValues>();
  const defaultFx = useDefaultFxRate();
  const addMut = useAddPaymentItem();
  const updateMut = useUpdatePaymentItem();
  const isEdit = !!item;

  const invoiceId = Form.useWatch('invoiceId', form) ?? item?.invoiceId;
  const currency = Form.useWatch('currency', form) ?? item?.currency ?? defaultCurrency;
  const method = Form.useWatch('method', form) ?? item?.method ?? 'TT';

  // Both sides: a payment may settle a sale (money in) or a purchase (money out).
  const { data: purchaseInvoices } = useChargeSourceInvoices('PURCHASE');
  const { data: saleInvoices } = useChargeSourceInvoices('SALE');
  const { data: banks } = useFinancialAccounts('BANK');
  const { data: cashSafes } = useFinancialAccounts('CASH_SAFE');
  const { data: cheques } = useCheques();
  const { data: invoiceDetail } = useTradeInvoice(invoiceId ?? '');

  // Mirrors ACCOUNT_TYPE_FOR_METHOD in api.ts. A drift here only mislabels a field — the server
  // rejects a wrong-type account outright — but keeping the two in step is the point.
  const accountType: FinancialAccountType | undefined =
    method === 'TT' ? 'BANK' : method === 'Cash' ? 'CASH_SAFE' : undefined;

  const accountOptions = useMemo(
    () =>
      (accountType === 'BANK' ? (banks ?? []) : accountType === 'CASH_SAFE' ? (cashSafes ?? []) : [])
        .filter((a) => a.active)
        .map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
    [accountType, banks, cashSafes],
  );

  /** Only set when editing a line that already carries a cheque. */
  const attachedCheque = useMemo(
    () => (item?.chequeId ? (cheques ?? []).find((c) => c.id === item.chequeId) : undefined),
    [item?.chequeId, cheques],
  );

  const [rows, setRows] = useState<AllocRow[]>([]);
  const [touched, setTouched] = useState(false);

  const invoiceOptions = useMemo(
    () =>
      [...(purchaseInvoices ?? []), ...(saleInvoices ?? [])]
        // Only the header's own person. An unfiltered list let this person's money settle
        // somebody else's document — the customer name on each row was the only thing
        // standing between you and paying the wrong party.
        .filter((inv) => inv.customerId === customerId)
        // The list is already scoped to one person, so the number and the document type
        // identify it; repeating the customer name on every row would just be noise.
        .map((inv) => ({
          value: inv.id,
          label: `${inv.invoiceNumber} · ${t(`tradeInvoices.type.${inv.invoiceType}`)}`,
        })),
    [purchaseInvoices, saleInvoices, customerId, t],
  );

  /**
   * Seeds the grid whenever the chosen invoice's items arrive.
   *
   * `touched` guards it: without that, typing an amount would re-run this effect on the next
   * render and wipe what was just typed. Editing an existing line seeds from its saved
   * allocations instead of auto-filling, so opening Edit never silently re-spreads the money.
   */
  useEffect(() => {
    if (!invoiceDetail) return;
    if (touched) return;
    const saved = new Map((item?.allocations ?? []).map((a) => [a.invoiceItemId, a.amount]));
    setRows(
      invoiceDetail.items.map((it) => ({
        invoiceItemId: it.id,
        product: it.product,
        lineAmount: it.amount,
        amount: saved.get(it.id) ?? 0,
      })),
    );
  }, [invoiceDetail, item, touched]);

  const allocTotal = round2(rows.reduce((s, r) => s + r.amount, 0));

  const initialValues: Partial<ItemFormValues> = item
    ? {
        invoiceId: item.invoiceId,
        date: dayjs(item.date),
        amount: item.amount,
        currency: item.currency,
        fxRate: item.fxRate,
        method: item.method,
        bankAccountId: item.bankAccountId,
        chequeId: item.chequeId,
      }
    : {
        date: dayjs(),
        currency: defaultCurrency,
        fxRate: defaultFx(defaultCurrency),
        method: 'TT',
        amount: unallocated > 0 ? unallocated : undefined,
        chequeType: 'NORMAL' as ChequeType,
      };

  const submit = async () => {
    let values: ItemFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const allocations = rows.filter((r) => r.amount > 0).map((r) => ({ invoiceItemId: r.invoiceItemId, amount: r.amount }));
    const input: PaymentItemInput = {
      invoiceId: isGeneral ? undefined : values.invoiceId,
      date: values.date.toISOString(),
      amount: values.amount,
      currency: values.currency,
      fxRate: values.currency === 'USD' ? 1 : values.fxRate,
      method: values.method,
      bankAccountId: accountType ? values.bankAccountId : undefined,
      // Keep an already-attached cheque; otherwise send the details and let the server mint it
      // as part of the same call, so a rejected line never leaves an orphan cheque behind.
      chequeId: values.method === 'Cheque' ? item?.chequeId : undefined,
      cheque:
        values.method === 'Cheque' && !item?.chequeId
          ? {
              type: values.chequeType ?? 'NORMAL',
              number: values.chequeNumber ?? '',
              bankName: values.chequeBankName ?? '',
              ownerName: values.chequeOwnerName ?? '',
              dueDate: (values.chequeDueDate ?? values.date).toISOString(),
              // The cheque IS this line's money — same amount, same currency, by construction.
              amount: values.amount,
              currency: values.currency,
            }
          : undefined,
      // Sending nothing lets the server auto-fill first-to-last; sending rows honours the split
      // the user adjusted. A general line has nothing to allocate against.
      allocations: isGeneral || !allocations.length ? undefined : allocations,
    };
    try {
      if (isEdit && item) {
        await updateMut.mutateAsync({ paymentId, itemId: item.id, input });
        message.success(t('payments.itemUpdated'));
      } else {
        await addMut.mutateAsync({ paymentId, input });
        message.success(t('payments.itemAdded'));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if ((CHEQUE_ERROR_CODES as readonly string[]).includes(code)) message.error(t(`cheques.errors.${code}`));
      else if ((KNOWN_ERROR_CODES as readonly string[]).includes(code)) message.error(t(`payments.errors.${code}`));
      else message.error(t('common.saveFailed'));
    }
  };

  const columns: ColumnsType<AllocRow> = [
    { title: t('items.product'), dataIndex: 'product', render: (v) => <Text strong>{v}</Text> },
    {
      title: t('payments.lineValue'),
      dataIndex: 'lineAmount',
      align: 'right',
      width: 140,
      render: (v: number) => <Money value={v} />,
    },
    {
      title: t('payments.allocated'),
      key: 'amount',
      align: 'right',
      width: 160,
      render: (_, r) => (
        <InputNumber
          value={r.amount}
          min={0}
          step={100}
          style={{ width: 130 }}
          onChange={(v) => {
            setTouched(true);
            setRows((prev) =>
              prev.map((x) => (x.invoiceItemId === r.invoiceItemId ? { ...x, amount: v ?? 0 } : x)),
            );
          }}
        />
      ),
    },
  ];

  return (
    <Modal
      open={open}
      width={820}
      title={isEdit ? t('payments.editItem') : t('payments.addItem')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={addMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={item?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {!isGeneral && (
            <Form.Item name="invoiceId" label={t('payments.invoiceColumn')} rules={[{ required: true, message: t('common.required') }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={invoiceOptions}
                placeholder={t('payments.pickInvoice')}
                notFoundContent={<Text type="secondary">{t('payments.noInvoicesForPerson')}</Text>}
                // Changing invoice must drop the old grid, else amounts from the previous
                // document would be submitted against items that are not on this one.
                onChange={() => {
                  setTouched(false);
                  setRows([]);
                }}
              />
            </Form.Item>
          )}
          <Form.Item name="date" label={t('payments.date')} rules={[{ required: true, message: t('common.required') }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="amount" label={t('payments.amount')} rules={[{ required: true, message: t('common.required') }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={100} />
          </Form.Item>
          <Form.Item name="currency" label={t('payments.currency')} rules={[{ required: true, message: t('common.required') }]}>
            <Select
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              onChange={(v: Currency) => form.setFieldValue('fxRate', defaultFx(v))}
            />
          </Form.Item>
          <Form.Item name="fxRate" label={t('payments.fxRate')} rules={[{ required: true, message: t('common.required') }]}>
            <InputNumber style={{ width: '100%' }} min={0.0001} step={0.0001} disabled={currency === 'USD'} />
          </Form.Item>
          <Form.Item name="method" label={t('payments.method')} rules={[{ required: true, message: t('common.required') }]}>
            <Select options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
          </Form.Item>

          {/* Method-dependent, and required server-side too — not just a UI nicety. TT and Cash
              share the `bankAccountId` field but offer different account types; the server
              rejects a mismatch, so the two lists can never be quietly interchanged. */}
          {accountType && (
            <Form.Item
              name="bankAccountId"
              label={accountType === 'BANK' ? t('payments.bankAccount') : t('payments.cashSafe')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={accountType === 'BANK' ? t('payments.pickBank') : t('payments.pickCashSafe')}
                options={accountOptions}
                notFoundContent={
                  <Text type="secondary">
                    {accountType === 'BANK' ? t('payments.noBanks') : t('payments.noCashSafes')}
                  </Text>
                }
              />
            </Form.Item>
          )}
        </div>

        {method === 'Cheque' &&
          (attachedCheque ? (
            // Editing a line whose cheque already exists. The cheque is not re-created or
            // re-picked — it is edited in the cheque register, where its status rules live.
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={t('payments.chequeAttached', {
                number: attachedCheque.number,
                bank: attachedCheque.bankName,
              })}
              description={t('payments.chequeAttachedHint')}
            />
          ) : (
            <>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                {t('payments.newChequeTitle')}
              </Text>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                {t('payments.newChequeHint')}
              </Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Form.Item name="chequeNumber" label={t('cheques.number')} rules={[{ required: true, message: t('common.required') }]}>
                  <Input dir="ltr" />
                </Form.Item>
                <Form.Item name="chequeBankName" label={t('cheques.bankName')} rules={[{ required: true, message: t('common.required') }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="chequeOwnerName" label={t('cheques.ownerName')} rules={[{ required: true, message: t('common.required') }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="chequeDueDate" label={t('cheques.dueDate')} rules={[{ required: true, message: t('common.required') }]}>
                  <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
                </Form.Item>
                <Form.Item name="chequeType" label={t('cheques.type')} rules={[{ required: true, message: t('common.required') }]}>
                  <Select
                    options={(['NORMAL', 'SECURITY'] as ChequeType[]).map((v) => ({
                      value: v,
                      label: t(`cheques.types.${v}`),
                    }))}
                  />
                </Form.Item>
              </div>
            </>
          ))}
      </Form>

      {isGeneral ? (
        <Alert type="info" showIcon message={t('payments.generalLineHint')} />
      ) : invoiceId ? (
        <>
          <Space style={{ marginBottom: 8 }} wrap>
            <Text type="secondary">{t('payments.allocationHint')}</Text>
            <Tag color={Math.abs(allocTotal - (form.getFieldValue('amount') ?? 0)) < 0.005 ? 'success' : 'default'}>
              {t('payments.allocatedTotal')}: {allocTotal}
            </Tag>
          </Space>
          <Table<AllocRow>
            rowKey="invoiceItemId"
            size="small"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ y: 240 }}
          />
        </>
      ) : (
        <Alert type="info" showIcon message={t('payments.pickInvoiceFirst')} />
      )}
    </Modal>
  );
}
