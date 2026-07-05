import { useEffect, useMemo } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useContracts, useCreateInvoice } from '@/services/queries';
import { previewInvoiceNumber } from '@/services/api';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { Currency, InvoiceType } from '@/types';

const { TextArea } = Input;

interface CreateInvoiceFormValues {
  contractId: string;
  invoiceDate: dayjs.Dayjs;
  invoiceNumber: string;
  currency: Currency;
  exchangeRate: number;
  description?: string;
}

interface CreateInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  invoiceType: InvoiceType;
}

const TYPE_TITLE_KEY: Record<InvoiceType, string> = {
  PURCHASE_ORDER: 'tradeInvoices.newOrder',
  PURCHASE_PROVISIONAL: 'tradeInvoices.newProvisional',
  PURCHASE_INVOICE: 'tradeInvoices.newInvoice',
  SALE_ORDER: 'tradeInvoices.newOrder',
  SALE_PROVISIONAL: 'tradeInvoices.newProvisional',
  SALE_INVOICE: 'tradeInvoices.newInvoice',
};

export function CreateInvoiceModal({ open, onClose, invoiceType }: CreateInvoiceModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<CreateInvoiceFormValues>();
  const { data: contracts, isLoading: contractsLoading } = useContracts();
  const createMut = useCreateInvoice();
  const fxRate = useSettingsStore((s) => s.fxRate);

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

  const initialValues: Partial<CreateInvoiceFormValues> = {
    invoiceDate: dayjs(),
    currency: 'USD',
    exchangeRate: 1,
  };

  // Prefill the auto-generated number whenever the modal opens for this type.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    previewInvoiceNumber(invoiceType).then((number) => {
      if (!cancelled) form.setFieldValue('invoiceNumber', number);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceType]);

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
    try {
      const invoice = await createMut.mutateAsync({
        invoiceType,
        contractId: values.contractId,
        invoiceDate: values.invoiceDate.toISOString(),
        invoiceNumber: values.invoiceNumber,
        currency: values.currency,
        exchangeRate: values.currency === 'AED' ? values.exchangeRate : 1,
        description: values.description?.trim() || undefined,
      });
      message.success(t('tradeInvoices.created'));
      onClose();
      navigate(`/app/invoices/${encodeURIComponent(invoice.id)}`);
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={t(TYPE_TITLE_KEY[invoiceType])}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={`${invoiceType}-${open}`}
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
        <Form.Item
          name="invoiceNumber"
          label={t('tradeInvoices.number')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input placeholder={t('tradeInvoices.numberPlaceholder')} />
        </Form.Item>
        <Form.Item
          name="currency"
          label={t('tradeInvoices.currency')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select
            options={[
              { value: 'USD', label: 'USD' },
              { value: 'AED', label: 'AED' },
            ]}
            onChange={(value: Currency) => {
              form.setFieldValue('exchangeRate', value === 'AED' ? fxRate : 1);
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
            disabled={currency !== 'AED'}
          />
        </Form.Item>
        <Form.Item name="description" label={t('tradeInvoices.description')}>
          <TextArea rows={3} maxLength={500} showCount placeholder={t('tradeInvoices.descriptionPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
