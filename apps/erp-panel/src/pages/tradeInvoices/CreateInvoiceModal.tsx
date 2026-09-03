import { useMemo } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useContracts, useCreateInvoice, useUpdateInvoiceHeader } from '@/services/queries';
import { useDefaultFxRate } from '@/store/useSettingsStore';
import { CURRENCIES } from '@/config/constants';
import type { Currency, Invoice, InvoiceType } from '@/types';

const { TextArea } = Input;

interface CreateInvoiceFormValues {
  contractId: string;
  invoiceDate: dayjs.Dayjs;
  currency: Currency;
  exchangeRate: number;
  description?: string;
}

interface CreateInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  invoiceType: InvoiceType;
  /** When provided the modal edits this invoice's header (contract locked); otherwise it creates. */
  invoice?: Invoice;
}

const TYPE_TITLE_KEY: Record<InvoiceType, string> = {
  PURCHASE_ORDER: 'tradeInvoices.newOrder',
  PURCHASE_PROVISIONAL: 'tradeInvoices.newProvisional',
  PURCHASE_INVOICE: 'tradeInvoices.newInvoice',
  SALE_ORDER: 'tradeInvoices.newOrder',
  SALE_PROVISIONAL: 'tradeInvoices.newProvisional',
  SALE_INVOICE: 'tradeInvoices.newInvoice',
};

export function CreateInvoiceModal({ open, onClose, invoiceType, invoice }: CreateInvoiceModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<CreateInvoiceFormValues>();
  const { data: contracts, isLoading: contractsLoading } = useContracts();
  const createMut = useCreateInvoice();
  const updateHeaderMut = useUpdateInvoiceHeader();
  const defaultFx = useDefaultFxRate();
  const isEdit = !!invoice;

  const contractType = invoiceType.startsWith('PURCHASE') ? 'PURCHASE' : 'SELL';

  const contractOptions = useMemo(() => {
    const list = (contracts ?? []).filter((c) => c.contractType === contractType);
    // ACTIVE first, then others — stable sort.
    const active = list.filter((c) => c.status === 'ACTIVE');
    const rest = list.filter((c) => c.status !== 'ACTIVE');
    return [...active, ...rest].map((c) => ({
      value: c.id,
      label: `${c.id} — ${c.customerName}`,
      customerName: c.customerName,
    }));
  }, [contracts, contractType]);

  const initialValues: Partial<CreateInvoiceFormValues> = isEdit
    ? {
        contractId: invoice.contractId,
        invoiceDate: dayjs(invoice.invoiceDate),
        currency: invoice.currency,
        exchangeRate: invoice.exchangeRate,
        description: invoice.description,
      }
    : {
        invoiceDate: dayjs(),
        currency: 'USD',
        exchangeRate: 1,
      };

  const selectedContractId = Form.useWatch('contractId', form);
  const selectedCustomerName =
    contractOptions.find((c) => c.value === selectedContractId)?.customerName ?? '';

  const currency = Form.useWatch('currency', form);

  const submit = async () => {
    let values: CreateInvoiceFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validation errors render inline
    }
    if (isEdit && invoice) {
      try {
        await updateHeaderMut.mutateAsync({
          id: invoice.id,
          patch: {
            invoiceDate: values.invoiceDate.toISOString(),
            currency: values.currency,
            exchangeRate: values.currency === 'USD' ? 1 : values.exchangeRate,
            description: values.description?.trim() || undefined,
          },
        });
        message.success(t('tradeInvoices.headerUpdated'));
        onClose();
      } catch {
        message.error(t('common.saveFailed'));
      }
      return;
    }
    try {
      const created = await createMut.mutateAsync({
        invoiceType,
        contractId: values.contractId,
        invoiceDate: values.invoiceDate.toISOString(),
        currency: values.currency,
        exchangeRate: values.currency === 'USD' ? 1 : values.exchangeRate,
        description: values.description?.trim() || undefined,
      });
      message.success(t('tradeInvoices.created'));
      onClose();
      navigate(`/app/invoices/${encodeURIComponent(created.id)}`);
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={t(isEdit ? 'tradeInvoices.editHeader' : TYPE_TITLE_KEY[invoiceType])}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateHeaderMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={`${invoiceType}-${invoice?.id ?? 'new'}-${open}`}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item
          name="contractId"
          label={t('tradeInvoices.contract')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select
            showSearch
            disabled={isEdit}
            loading={contractsLoading}
            placeholder={t('tradeInvoices.selectContract')}
            optionFilterProp="label"
            options={contractOptions}
          />
        </Form.Item>
        <Form.Item label={t('tradeInvoices.customer')}>
          <Input value={selectedCustomerName} disabled placeholder={t('tradeInvoices.customerAuto')} />
        </Form.Item>
        <Form.Item
          name="invoiceDate"
          label={t('tradeInvoices.date')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
        <Form.Item label={t('tradeInvoices.number')}>
          <Input
            value={isEdit ? invoice?.invoiceNumber : t('tradeInvoices.numberAssigned')}
            disabled
          />
        </Form.Item>
        <Form.Item
          name="currency"
          label={t('tradeInvoices.currency')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            onChange={(value: Currency) => {
              form.setFieldValue('exchangeRate', defaultFx(value));
            }}
          />
        </Form.Item>
        <Form.Item
          name="exchangeRate"
          label={t('tradeInvoices.exchangeRate')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            step={0.0001}
            disabled={currency === 'USD'}
          />
        </Form.Item>
        <Form.Item name="description" label={t('tradeInvoices.description')}>
          <TextArea rows={3} maxLength={500} showCount placeholder={t('tradeInvoices.descriptionPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
