import { App, DatePicker, Form, Input, InputNumber, Modal, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useCreateExchangeGainLoss, useUpdateExchangeGainLoss } from '@/services/queries';
import type { ExchangeGainLoss } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

interface FormValues {
  date: Dayjs;
  amount: number;
  notes?: string;
}

interface GainLossFormModalProps {
  open: boolean;
  onClose: () => void;
  record?: ExchangeGainLoss;
}

/**
 * Three fields. No account, no rate, no preview.
 *
 * Whether this is a gain or a loss is derived from the sign of the amount rather than picked
 * from a dropdown — a record labelled "gain" holding −500 would otherwise be possible, and the
 * label would then contradict the number.
 */
export function GainLossFormModal({ open, onClose, record }: GainLossFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const createMut = useCreateExchangeGainLoss();
  const updateMut = useUpdateExchangeGainLoss();
  const isEdit = !!record;

  const amount = Form.useWatch('amount', form);

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input = {
      date: values.date.toISOString(),
      amount: values.amount,
      notes: values.notes,
    };
    try {
      if (isEdit && record) {
        await updateMut.mutateAsync({ id: record.id, input });
        message.success(t('exchange.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('exchange.created'));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'invalid-amount' || code === 'date-required') {
        message.error(t(`exchange.errors.${code}`));
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={520}
      title={isEdit ? t('exchange.editRecord') : t('exchange.newRecord')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={record?.id ?? 'new'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={
          record
            ? { date: dayjs(record.date), amount: record.amount, notes: record.notes }
            : { date: dayjs() }
        }
      >
        <Form.Item name="date" label={t('exchange.date')} rules={[{ required: true, message: t('common.required') }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
        <Form.Item
          name="amount"
          label={t('exchange.amountLabel')}
          rules={[{ required: true, message: t('common.required') }]}
          extra={
            <Text type="secondary">
              {amount === undefined || amount === null || amount === 0
                ? t('exchange.amountHint')
                : amount > 0
                  ? t('exchange.willBeGain')
                  : t('exchange.willBeLoss')}
            </Text>
          }
        >
          <InputNumber style={{ width: '100%' }} step={100} />
        </Form.Item>
        <Form.Item name="notes" label={t('exchange.notes')}>
          <TextArea rows={3} maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
