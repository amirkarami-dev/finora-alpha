import { App, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Money } from '@/components/common/Money';
import { useCreatePayment } from '@/services/queries';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { Currency, Invoice, PaymentMethod } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

const PAYMENT_METHODS: PaymentMethod[] = ['TT', 'Cash', 'Cheque', 'Offset', 'Credit Note'];

interface RecordPaymentFormValues {
  date: dayjs.Dayjs;
  currency: Currency;
  fxRate: number;
  amount: number;
  method: PaymentMethod;
  notes?: string;
}

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  remainingUSD: number;
}

export function RecordPaymentModal({ open, onClose, invoice, remainingUSD }: RecordPaymentModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<RecordPaymentFormValues>();
  const createMut = useCreatePayment();
  const settingsFxRate = useSettingsStore((s) => s.fxRate);

  const defaultCurrency: Currency = invoice.currency === 'AED' ? 'AED' : 'USD';

  const initialValues: Partial<RecordPaymentFormValues> = {
    date: dayjs(),
    currency: defaultCurrency,
    fxRate: defaultCurrency === 'AED' ? settingsFxRate : 1,
    method: 'TT',
  };

  const currency = Form.useWatch('currency', form);

  const submit = async () => {
    let values: RecordPaymentFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validation errors render inline
    }
    try {
      await createMut.mutateAsync({
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        date: values.date.toISOString(),
        currency: values.currency,
        fxRate: values.currency === 'AED' ? values.fxRate : 1,
        amount: values.amount,
        method: values.method,
        notes: values.notes?.trim() || undefined,
      });
      message.success(t('tradeInvoices.paymentRecorded'));
      onClose();
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={t('tradeInvoices.recordPayment')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('tradeInvoices.recordPaymentContext', { number: invoice.invoiceNumber })}
        {' · '}
        {t('tradeInvoices.remaining')}: <Money value={remainingUSD} strong />
      </Text>
      <Form
        key={`${invoice.id}-${open}`}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item
          name="date"
          label={t('payments.date')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
        <Form.Item
          name="currency"
          label={t('payments.currency')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select
            options={[
              { value: 'USD', label: 'USD' },
              { value: 'AED', label: 'AED' },
            ]}
            onChange={(value: Currency) => {
              form.setFieldValue('fxRate', value === 'AED' ? settingsFxRate : 1);
            }}
          />
        </Form.Item>
        <Form.Item
          name="fxRate"
          label={t('payments.fxRate')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <InputNumber style={{ width: '100%' }} min={0} step={0.0001} disabled={currency !== 'AED'} />
        </Form.Item>
        <Form.Item label={t('payments.amount')} required>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item
              name="amount"
              noStyle
              rules={[{ required: true, message: t('common.required') }]}
            >
              <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} precision={2} />
            </Form.Item>
            <Input style={{ width: 70, textAlign: 'center' }} value={currency} disabled />
          </Space.Compact>
        </Form.Item>
        <Form.Item
          name="method"
          label={t('payments.method')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
        </Form.Item>
        <Form.Item name="notes" label={t('payments.notes')}>
          <TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
