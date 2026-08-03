import { useMemo } from 'react';
import { Alert, App, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useCreateMoneyTransfer, useFinancialAccounts, useUpdateMoneyTransfer } from '@/services/queries';
import type { MoneyTransferInput, MoneyTransferRow } from '@/services/api';

const { TextArea } = Input;
const { Text } = Typography;

const KNOWN_ERROR_CODES = [
  'date-required',
  'from-account-required',
  'from-account-not-found',
  'to-account-required',
  'to-account-not-found',
  'same-account',
  'account-inactive',
  'invalid-amount',
  'invalid-rate',
  'same-currency-rate',
  'over-allocated',
  'invoice-not-found',
  'transfer-not-draft',
] as const;

interface FormValues {
  date: Dayjs;
  fromAccountId: string;
  toAccountId: string;
  fromAmount: number;
  exchangeRate: number;
  notes?: string;
}

interface TransferFormModalProps {
  open: boolean;
  onClose: () => void;
  transfer?: MoneyTransferRow;
}

/** Move money between the company's own accounts. Deliberately has NO invoice or person field:
 *  a standalone transfer is the normal case (spec §4), and optional business links are a
 *  separate concern the API accepts but this form does not force. */
export function TransferFormModal({ open, onClose, transfer }: TransferFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const { data: accounts } = useFinancialAccounts();
  const createMut = useCreateMoneyTransfer();
  const updateMut = useUpdateMoneyTransfer();
  const isEdit = !!transfer;

  const fromId = Form.useWatch('fromAccountId', form) ?? transfer?.fromAccountId;
  const toId = Form.useWatch('toAccountId', form) ?? transfer?.toAccountId;
  const fromAmount = Form.useWatch('fromAmount', form) ?? 0;
  const rate = Form.useWatch('exchangeRate', form) ?? 1;

  const active = useMemo(
    () => (accounts ?? []).filter((a) => a.active || a.id === transfer?.fromAccountId || a.id === transfer?.toAccountId),
    [accounts, transfer],
  );
  const from = active.find((a) => a.id === fromId);
  const to = active.find((a) => a.id === toId);
  const sameCurrency = !!from && !!to && from.currency === to.currency;
  const toAmount = Math.round(fromAmount * rate * 100) / 100;

  const options = active.map((a) => ({
    value: a.id,
    label: `${a.name} · ${a.currency}${a.active ? '' : ` (${t('common.inactive')})`}`,
  }));

  const initialValues: Partial<FormValues> = transfer
    ? {
        date: dayjs(transfer.date),
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        fromAmount: transfer.fromAmount,
        exchangeRate: transfer.exchangeRate,
        notes: transfer.notes,
      }
    : { date: dayjs(), exchangeRate: 1 };

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: MoneyTransferInput = {
      date: values.date.toISOString(),
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      fromAmount: values.fromAmount,
      // Two accounts in the same currency can only be 1:1; the server rejects anything else, so
      // the form sends the value it is actually allowed to send rather than a rate the user
      // cannot see the effect of.
      exchangeRate: sameCurrency ? 1 : values.exchangeRate,
      notes: values.notes,
    };
    try {
      if (isEdit && transfer) {
        await updateMut.mutateAsync({ id: transfer.id, input });
        message.success(t('transfers.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('transfers.created'));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if ((KNOWN_ERROR_CODES as readonly string[]).includes(code)) message.error(t(`transfers.errors.${code}`));
      else message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={600}
      title={isEdit ? t('transfers.editTransfer') : t('transfers.newTransfer')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={transfer?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item name="date" label={t('transfers.date')} rules={[{ required: true, message: t('common.required') }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Form.Item name="fromAccountId" label={t('transfers.fromAccount')} rules={[{ required: true, message: t('common.required') }]}>
            <Select showSearch optionFilterProp="label" options={options} placeholder={t('transfers.pickAccount')} />
          </Form.Item>
          <Form.Item name="toAccountId" label={t('transfers.toAccount')} rules={[{ required: true, message: t('common.required') }]}>
            <Select showSearch optionFilterProp="label" options={options} placeholder={t('transfers.pickAccount')} />
          </Form.Item>
          <Form.Item
            name="fromAmount"
            // Currency shown as helper text rather than `addonAfter`, which AntD deprecates on
            // InputNumber — no point adding a new console warning to a screen built today.
            label={from ? `${t('transfers.fromAmount')} (${from.currency})` : t('transfers.fromAmount')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.01} step={100} />
          </Form.Item>
          <Form.Item
            name="exchangeRate"
            label={t('transfers.exchangeRate')}
            rules={[{ required: true, message: t('common.required') }]}
            extra={sameCurrency ? t('transfers.sameCurrencyHint') : undefined}
          >
            <InputNumber style={{ width: '100%' }} min={0.000001} step={0.01} disabled={sameCurrency} />
          </Form.Item>
        </div>

        {from && to && fromAmount > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={
              <Space direction="vertical" size={0}>
                <Text>
                  {fromAmount} {from.currency} → <Text strong>{toAmount} {to.currency}</Text>
                </Text>
                <Text type="secondary">{t('transfers.confirmHint')}</Text>
              </Space>
            }
          />
        )}

        <Form.Item name="notes" label={t('transfers.notes')}>
          <TextArea rows={2} maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
