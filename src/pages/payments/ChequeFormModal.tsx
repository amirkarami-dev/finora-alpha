import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useCreateCheque, useUpdateCheque } from '@/services/queries';
import { CURRENCIES } from '@/config/constants';
import type { ChequeInput } from '@/services/api';
import type { Cheque, ChequeType, Currency } from '@/types';

const { TextArea } = Input;

const CHEQUE_TYPES: ChequeType[] = ['NORMAL', 'SECURITY'];

interface FormValues {
  type: ChequeType;
  number: string;
  bankName: string;
  dueDate: Dayjs;
  amount: number;
  currency: Currency;
  ownerName: string;
  notes?: string;
}

interface ChequeFormModalProps {
  open: boolean;
  onClose: () => void;
  cheque?: Cheque;
}

const FIELD_FOR_ERROR: Record<string, keyof FormValues> = {
  'number-required': 'number',
  'duplicate-cheque-number': 'number',
  'bank-name-required': 'bankName',
  'owner-required': 'ownerName',
  'due-date-required': 'dueDate',
  'invalid-amount': 'amount',
};

export function ChequeFormModal({ open, onClose, cheque }: ChequeFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const createMut = useCreateCheque();
  const updateMut = useUpdateCheque();
  const isEdit = !!cheque;

  const initialValues: Partial<FormValues> = cheque
    ? {
        type: cheque.type,
        number: cheque.number,
        bankName: cheque.bankName,
        dueDate: dayjs(cheque.dueDate),
        amount: cheque.amount,
        currency: cheque.currency,
        ownerName: cheque.ownerName,
        notes: cheque.notes,
      }
    : { type: 'NORMAL', currency: 'USD', dueDate: dayjs().add(30, 'day') };

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: ChequeInput = {
      type: values.type,
      number: values.number.trim(),
      bankName: values.bankName.trim(),
      dueDate: values.dueDate.toISOString(),
      amount: values.amount,
      currency: values.currency,
      ownerName: values.ownerName.trim(),
      notes: values.notes?.trim() || undefined,
    };
    try {
      if (isEdit && cheque) {
        await updateMut.mutateAsync({ id: cheque.id, input });
        message.success(t('cheques.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('cheques.created'));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      const field = FIELD_FOR_ERROR[code];
      if (field) {
        form.setFields([{ name: field, errors: [t(`cheques.errors.${code}`)] }]);
        return;
      }
      if (code === 'cheque-paid') {
        message.error(t('cheques.errors.cheque-paid'));
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={620}
      title={isEdit ? t('cheques.editCheque') : t('cheques.newCheque')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={cheque?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Form.Item name="type" label={t('cheques.type')} rules={[{ required: true, message: t('common.required') }]}>
            <Select options={CHEQUE_TYPES.map((v) => ({ value: v, label: t(`cheques.types.${v}`) }))} />
          </Form.Item>
          <Form.Item name="number" label={t('cheques.number')} rules={[{ required: true, message: t('common.required') }]}>
            <Input dir="ltr" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item
            name="bankName"
            label={t('cheques.bankName')}
            rules={[{ required: true, message: t('common.required') }]}
            // Free text, and the uniqueness scope: numbers clash only within the same issuing
            // bank, so spelling it consistently matters.
            extra={t('cheques.bankNameHint')}
          >
            <Input />
          </Form.Item>
          <Form.Item name="ownerName" label={t('cheques.ownerName')} rules={[{ required: true, message: t('common.required') }]}>
            <Input />
          </Form.Item>
          <Form.Item name="dueDate" label={t('cheques.dueDate')} rules={[{ required: true, message: t('common.required') }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="amount" label={t('cheques.amount')} rules={[{ required: true, message: t('common.required') }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={100} />
          </Form.Item>
          <Form.Item name="currency" label={t('cheques.currency')} rules={[{ required: true, message: t('common.required') }]}>
            <Select options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
        </div>
        <Form.Item name="notes" label={t('cheques.notes')}>
          <TextArea rows={2} maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
