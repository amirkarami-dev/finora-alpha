import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCreatePayment, useCustomers, useUpdatePaymentHeader } from '@/services/queries';
import { CURRENCIES } from '@/config/constants';
import type { Currency, Payment, PaymentType } from '@/types';

const { TextArea } = Input;

interface HeaderFormValues {
  customerId: string;
  date: Dayjs;
  amount: number;
  currency: Currency;
  notes?: string;
}

interface PaymentFormModalProps {
  open: boolean;
  onClose: () => void;
  type: PaymentType;
  payment?: Payment;
}

/**
 * The payment HEADER only — amount, date, currency, notes (spec: "not need fx rate" here).
 * Settlement lines carry their own currency and FX and are added on the detail page, so a new
 * payment navigates straight there rather than pretending it is finished.
 */
export function PaymentFormModal({ open, onClose, type, payment }: PaymentFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<HeaderFormValues>();
  const { data: persons } = useCustomers();
  const createMut = useCreatePayment();
  const updateMut = useUpdatePaymentHeader();
  const isEdit = !!payment;

  const personOptions = (persons ?? [])
    .filter((p) => p.active || p.id === payment?.customerId)
    .map((p) => ({ value: p.id, label: p.name }));

  const initialValues: Partial<HeaderFormValues> = payment
    ? {
        customerId: payment.customerId,
        date: dayjs(payment.date),
        amount: payment.amount,
        currency: payment.currency,
        notes: payment.notes,
      }
    : { currency: 'USD', date: dayjs() };

  const submit = async () => {
    let values: HeaderFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    try {
      if (isEdit && payment) {
        await updateMut.mutateAsync({
          id: payment.id,
          input: {
            customerId: values.customerId,
            date: values.date.toISOString(),
            amount: values.amount,
            currency: values.currency,
            notes: values.notes,
          },
        });
        message.success(t('payments.updated'));
        onClose();
        return;
      }
      const created = await createMut.mutateAsync({
        customerId: values.customerId,
        date: values.date.toISOString(),
        amount: values.amount,
        currency: values.currency,
        // The header has no FX by design; it is a control total. Lines convert individually.
        fxRate: 1,
        method: 'TT',
        notes: values.notes,
        type,
      });
      message.success(t('payments.created'));
      onClose();
      navigate(`/app/payments/${encodeURIComponent(created.id)}`);
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'payment-confirmed') {
        message.error(t('payments.errors.payment-confirmed'));
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={560}
      title={isEdit ? t('payments.editPayment') : t(`payments.new${type === 'INVOICE' ? 'Invoice' : 'General'}Payment`)}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={payment?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item
          name="customerId"
          label={t('payments.person')}
          rules={[{ required: true, message: t('common.required') }]}
          extra={type === 'GENERAL' ? t('payments.generalPersonHint') : undefined}
        >
          <Select showSearch optionFilterProp="label" options={personOptions} placeholder={t('payments.personPlaceholder')} />
        </Form.Item>
        <Form.Item name="date" label={t('payments.date')} rules={[{ required: true, message: t('common.required') }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
        <Form.Item
          name="amount"
          label={t('payments.amount')}
          rules={[{ required: true, message: t('common.required') }]}
          extra={type === 'INVOICE' ? t('payments.controlTotalHint') : undefined}
        >
          <InputNumber style={{ width: '100%' }} min={0.01} step={100} />
        </Form.Item>
        <Form.Item name="currency" label={t('payments.currency')} rules={[{ required: true, message: t('common.required') }]}>
          <Select options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Form.Item>
        <Form.Item name="notes" label={t('payments.notes')}>
          <TextArea rows={2} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
