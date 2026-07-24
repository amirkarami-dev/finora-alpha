import { useMemo } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CLAIM_TYPES,
  CURRENCIES,
  EXPENSE_TYPES,
  GENERAL_EXPENSE_CATEGORIES,
  INVOICE_EXPENSE_CATEGORIES,
} from '@/config/constants';
import {
  useCostCentres,
  useCreateExpense,
  useCustomers,
  useExpenseSourceInvoices,
  useUpdateExpense,
} from '@/services/queries';
import type { ExpenseInput } from '@/services/api';
import { useSettingsStore } from '@/store/useSettingsStore';
import type {
  ClaimType,
  Currency,
  Customer,
  Expense,
  ExpenseType,
  GeneralExpenseCategory,
  InvoiceExpenseCategory,
} from '@/types';

const { TextArea } = Input;

const KNOWN_ERROR_CODES = [
  'title-required',
  'invalid-amount',
  'invalid-fx',
  'category-required',
  'invoice-required',
  'invoice-not-found',
  'invoice-not-confirmed',
  'party-required',
  'party-invoice-mismatch',
] as const;

interface ExpenseFormValues {
  title: string;
  expenseType: ExpenseType;
  category?: InvoiceExpenseCategory | GeneralExpenseCategory;
  claimType?: ClaimType;
  partyId?: string;
  invoiceId?: string;
  amount: number;
  currency: Currency;
  fxRate: number;
  date: Dayjs;
  costCentreId?: string;
  description?: string;
}

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  expense?: Expense;
  /** Preselects the type when creating (per-tab "New…" button); ignored when editing. */
  defaultExpenseType?: ExpenseType;
}

export function ExpenseFormModal({ open, onClose, expense, defaultExpenseType }: ExpenseFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<ExpenseFormValues>();
  const createMut = useCreateExpense();
  const updateMut = useUpdateExpense();
  const isEdit = !!expense;
  const settingsFxRate = useSettingsStore((s) => s.fxRate);

  const { data: purchaseInvoices } = useExpenseSourceInvoices('PURCHASE');
  const { data: saleInvoices } = useExpenseSourceInvoices('SALE');
  const { data: costCentres } = useCostCentres();
  const { data: customers } = useCustomers();

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers ?? []) map.set(c.id, c);
    return map;
  }, [customers]);

  const expenseType = Form.useWatch('expenseType', form);
  const claimType = Form.useWatch('claimType', form);
  const partyId = Form.useWatch('partyId', form);
  const currency = Form.useWatch('currency', form);

  const initialValues: Partial<ExpenseFormValues> = expense
    ? {
        title: expense.title,
        expenseType: expense.expenseType,
        category: expense.category,
        claimType: expense.claimType,
        partyId: expense.partyId,
        invoiceId: expense.invoiceId,
        amount: expense.amount,
        currency: expense.currency,
        fxRate: expense.fxRate,
        date: dayjs(expense.date),
        costCentreId: expense.costCentreId,
        description: expense.description,
      }
    : {
        expenseType: defaultExpenseType ?? 'GENERAL',
        currency: 'USD',
        fxRate: 1,
        date: dayjs(),
      };

  // Claim party list is derived FROM THE INVOICES (distinct customerId over
  // getExpenseSourceInvoices(side)), NOT from customerType — nothing in the app validates
  // customerType against contract direction, so a type-based filter would hide parties whose
  // invoices genuinely exist. customerType is used for the option label only.
  const claimSourceInvoices = claimType === 'SUPPLIER' ? purchaseInvoices : claimType === 'CUSTOMER' ? saleInvoices : undefined;

  const partyOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { value: string; label: string }[] = [];
    for (const inv of claimSourceInvoices ?? []) {
      if (seen.has(inv.customerId)) continue;
      seen.add(inv.customerId);
      const type = customerById.get(inv.customerId)?.customerType;
      list.push({ value: inv.customerId, label: type ? `${inv.customerName} (${t(`customerTypes.${type}`)})` : inv.customerName });
    }
    // Edit-mode escape hatch: keep an already-saved party selectable even if it no longer has a
    // matching source invoice (e.g. that invoice was since converted/cancelled).
    if (expense?.partyId && expense.claimType === claimType && !seen.has(expense.partyId)) {
      const name = customerById.get(expense.partyId)?.name ?? expense.partyId;
      list.unshift({ value: expense.partyId, label: name });
    }
    return list;
  }, [claimSourceInvoices, customerById, expense, claimType, t]);

  const invoiceOptions = useMemo(() => {
    const source =
      expenseType === 'CLAIM'
        ? (claimSourceInvoices ?? []).filter((inv) => inv.customerId === partyId)
        : [...(purchaseInvoices ?? []), ...(saleInvoices ?? [])];
    const list = source.map((inv) => ({ value: inv.id, label: `${inv.invoiceNumber} — ${inv.customerName}` }));
    // Edit-mode escape hatch: an already-saved invoiceId might no longer be offered (converted,
    // cancelled, or the party/claimType changed) — keep it selectable so editing never silently
    // blanks a value the record already has.
    if (expense?.invoiceId && !list.some((o) => o.value === expense.invoiceId)) {
      const known = [...(purchaseInvoices ?? []), ...(saleInvoices ?? [])].find((inv) => inv.id === expense.invoiceId);
      list.unshift({
        value: expense.invoiceId,
        label: known ? `${known.invoiceNumber} — ${known.customerName}` : expense.invoiceId,
      });
    }
    return list;
  }, [expenseType, claimSourceInvoices, partyId, purchaseInvoices, saleInvoices, expense]);

  const categoryOptions = useMemo(() => {
    const cats = expenseType === 'INVOICE' ? INVOICE_EXPENSE_CATEGORIES : expenseType === 'GENERAL' ? GENERAL_EXPENSE_CATEGORIES : [];
    return cats.map((c) => ({ value: c, label: t(`expenseCategories.${c}`) }));
  }, [expenseType, t]);

  const costCentreOptions = useMemo(() => {
    const list = (costCentres ?? [])
      .filter((c) => c.active)
      .map((c) => ({ value: c.id, label: c.name }));
    // Inactive centres are excluded from the picker but retained on already-saved expenses
    // (union idiom, spec §5) — an edit must not silently blank a now-inactive assignment.
    if (expense?.costCentreId && !list.some((o) => o.value === expense.costCentreId)) {
      const inactive = (costCentres ?? []).find((c) => c.id === expense.costCentreId);
      if (inactive) list.unshift({ value: inactive.id, label: `${inactive.name} (${t('common.inactive')})` });
    }
    return list;
  }, [costCentres, expense, t]);

  const submit = async () => {
    let values: ExpenseFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: ExpenseInput = {
      title: values.title.trim(),
      expenseType: values.expenseType,
      category: values.expenseType === 'CLAIM' ? undefined : values.category,
      claimType: values.expenseType === 'CLAIM' ? values.claimType : undefined,
      partyId: values.expenseType === 'CLAIM' ? values.partyId : undefined,
      invoiceId: values.expenseType === 'GENERAL' ? undefined : values.invoiceId,
      amount: values.amount,
      currency: values.currency,
      fxRate: values.currency === 'USD' ? 1 : values.fxRate,
      date: values.date.toISOString(),
      costCentreId: values.costCentreId,
      description: values.description?.trim() || undefined,
    };
    try {
      if (isEdit && expense) {
        await updateMut.mutateAsync({ id: expense.id, input });
        message.success(t('expenses.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('expenses.created'));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if ((KNOWN_ERROR_CODES as readonly string[]).includes(code)) {
        message.error(t(`expenses.errors.${code}`));
      } else {
        message.error(t('common.saveFailed'));
      }
    }
  };

  const showCategory = expenseType === 'INVOICE' || expenseType === 'GENERAL';
  const showClaimType = expenseType === 'CLAIM';
  const showParty = expenseType === 'CLAIM' && !!claimType;
  const showInvoice = expenseType === 'INVOICE' || (expenseType === 'CLAIM' && !!claimType && !!partyId);

  return (
    <Modal
      open={open}
      title={isEdit ? t('expenses.editExpense') : t('expenses.newExpense')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={expense?.id ?? `new-${defaultExpenseType ?? 'GENERAL'}`}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item name="title" label={t('expenses.expenseTitle')} rules={[{ required: true, message: t('common.required') }]}>
          <Input placeholder={t('expenses.titlePlaceholder')} />
        </Form.Item>

        <Form.Item name="expenseType" label={t('expenses.expenseType')} rules={[{ required: true, message: t('common.required') }]}>
          <Select
            options={EXPENSE_TYPES.map((v) => ({ value: v, label: t(`expenseTypes.${v}`) }))}
            onChange={() =>
              form.setFieldsValue({ category: undefined, claimType: undefined, partyId: undefined, invoiceId: undefined })
            }
          />
        </Form.Item>

        {showCategory && (
          <Form.Item name="category" label={t('expenses.category')} rules={[{ required: true, message: t('common.required') }]}>
            <Select options={categoryOptions} />
          </Form.Item>
        )}

        {showClaimType && (
          <Form.Item name="claimType" label={t('expenses.claimType')} rules={[{ required: true, message: t('common.required') }]}>
            <Select
              options={CLAIM_TYPES.map((v) => ({ value: v, label: t(`claimTypes.${v}`) }))}
              onChange={() => form.setFieldsValue({ partyId: undefined, invoiceId: undefined })}
            />
          </Form.Item>
        )}

        {showParty && (
          <Form.Item name="partyId" label={t('expenses.party')} rules={[{ required: true, message: t('common.required') }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={partyOptions}
              placeholder={t('expenses.partyPlaceholder')}
              onChange={() => form.setFieldValue('invoiceId', undefined)}
            />
          </Form.Item>
        )}

        {showInvoice && (
          <Form.Item name="invoiceId" label={t('expenses.invoice')} rules={[{ required: true, message: t('common.required') }]}>
            <Select showSearch optionFilterProp="label" options={invoiceOptions} placeholder={t('expenses.invoicePlaceholder')} />
          </Form.Item>
        )}

        <Form.Item label={t('expenses.amount')} required>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="amount" noStyle rules={[{ required: true, message: t('common.required') }]}>
              <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} precision={2} />
            </Form.Item>
            <Form.Item name="currency" noStyle rules={[{ required: true, message: t('common.required') }]}>
              <Select
                style={{ width: 90 }}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                onChange={(value: Currency) => form.setFieldValue('fxRate', value === 'AED' ? settingsFxRate : 1)}
              />
            </Form.Item>
          </Space.Compact>
        </Form.Item>

        <Form.Item name="fxRate" label={t('payments.fxRate')} rules={[{ required: true, message: t('common.required') }]}>
          <InputNumber style={{ width: '100%' }} min={0.0001} step={0.0001} disabled={currency !== 'AED'} />
        </Form.Item>

        <Form.Item name="date" label={t('expenses.date')} rules={[{ required: true, message: t('common.required') }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>

        <Form.Item name="costCentreId" label={t('costCentres.title')}>
          <Select allowClear options={costCentreOptions} placeholder={t('expenses.costCentrePlaceholder')} />
        </Form.Item>

        <Form.Item name="description" label={t('expenses.description')}>
          <TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
