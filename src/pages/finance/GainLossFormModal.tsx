import { App, DatePicker, Form, Input, InputNumber, Modal, Segmented, Typography, theme } from 'antd';
import { FallOutlined, RiseOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useCreateExchangeGainLoss, useUpdateExchangeGainLoss } from '@/services/queries';
import type { ExchangeGainLoss, ExchangeGainLossType } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

interface FormValues {
  date: Dayjs;
  type: ExchangeGainLossType;
  /** Always entered POSITIVE. The toggle carries the direction. */
  amount: number;
  notes?: string;
}

interface GainLossFormModalProps {
  open: boolean;
  onClose: () => void;
  record?: ExchangeGainLoss;
}

/**
 * Four fields: gain-or-loss, date, amount, notes.
 *
 * The user picks the direction on a toggle and types a plain positive amount — asking someone to
 * express "a loss" by remembering to type a minus sign is a trap, and a mistyped sign would be
 * indistinguishable from a real entry.
 *
 * The STORED shape is unchanged: one signed `amount`, with `type` derived from its sign
 * server-side. Converting here rather than teaching the API about a separate `type` field keeps
 * the two impossible to contradict — there is still only one place the direction lives.
 */
export function GainLossFormModal({ open, onClose, record }: GainLossFormModalProps) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const createMut = useCreateExchangeGainLoss();
  const updateMut = useUpdateExchangeGainLoss();
  const isEdit = !!record;

  const type = Form.useWatch('type', form) ?? record?.type ?? 'GAIN';

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input = {
      date: values.date.toISOString(),
      // `Math.abs` first: if a minus ever reaches this field, LOSS must still mean a loss rather
      // than negating into a gain.
      amount: values.type === 'LOSS' ? -Math.abs(values.amount) : Math.abs(values.amount),
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
            ? {
                date: dayjs(record.date),
                type: record.type,
                // Stored signed, shown positive — the toggle above says which way it goes.
                amount: Math.abs(record.amount),
                notes: record.notes,
              }
            : { date: dayjs(), type: 'GAIN' as ExchangeGainLossType }
        }
      >
        <Form.Item
          name="type"
          label={t('exchange.typeLabel')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Segmented
            block
            options={[
              { value: 'GAIN', label: t('exchange.gain'), icon: <RiseOutlined /> },
              { value: 'LOSS', label: t('exchange.loss'), icon: <FallOutlined /> },
            ]}
          />
        </Form.Item>
        <Form.Item name="date" label={t('exchange.date')} rules={[{ required: true, message: t('common.required') }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
        <Form.Item
          name="amount"
          label={t('exchange.amountLabel')}
          rules={[{ required: true, message: t('common.required') }]}
          extra={
            <Text type="secondary" style={{ color: type === 'LOSS' ? token.colorError : token.colorSuccess }}>
              {type === 'LOSS' ? t('exchange.willBeLoss') : t('exchange.willBeGain')}
            </Text>
          }
        >
          {/* min={0.01} — the sign lives on the toggle, so a negative here would be a second,
              conflicting way to say the same thing. */}
          <InputNumber style={{ width: '100%' }} min={0.01} step={100} />
        </Form.Item>
        <Form.Item name="notes" label={t('exchange.notes')}>
          <TextArea rows={3} maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
