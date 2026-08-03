import { useEffect, useState } from 'react';
import { Alert, App, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Spin, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useCreateRevaluation, useFinancialAccounts } from '@/services/queries';
import { previewRevaluation, type RevaluationPreview } from '@/services/api';
import { formatNumber } from '@/utils/format';

const { TextArea } = Input;
const { Text } = Typography;

interface FormValues {
  accountId: string;
  date: Dayjs;
  newExchangeRate: number;
  notes?: string;
}

interface RevaluationFormModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Revalue one account at a new rate.
 *
 * Spec §19 requires the calculation to be shown BEFORE confirming, so this calls the server's
 * `previewRevaluation` — the same function `createRevaluation` runs — rather than recomputing
 * the maths client-side, which would be a second implementation free to disagree with the one
 * that actually books the entry.
 */
export function RevaluationFormModal({ open, onClose }: RevaluationFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const { data: accounts } = useFinancialAccounts();
  const createMut = useCreateRevaluation();

  const accountId = Form.useWatch('accountId', form);
  const newRate = Form.useWatch('newExchangeRate', form);

  const [preview, setPreview] = useState<RevaluationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Only non-USD accounts can be revalued — USD is the base currency, so there is nothing to
  // restate. The server rejects it too (`base-currency-account`).
  const options = (accounts ?? [])
    .filter((a) => a.active && a.currency !== 'USD')
    .map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));

  useEffect(() => {
    if (!accountId || !newRate || newRate <= 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    previewRevaluation(accountId, newRate)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setPreviewError(null);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(e.message);
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });
    // Cancelled so a slow response for an old rate cannot overwrite a newer one.
    return () => {
      cancelled = true;
    };
  }, [accountId, newRate]);

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    try {
      await createMut.mutateAsync({
        accountId: values.accountId,
        date: values.date.toISOString(),
        newExchangeRate: values.newExchangeRate,
        notes: values.notes,
      });
      message.success(t('exchange.created'));
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'no-balance' || code === 'base-currency-account' || code === 'invalid-rate') {
        message.error(t(`exchange.errors.${code}`));
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={640}
      title={t('exchange.newRevaluation')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      okButtonProps={{ disabled: !preview }}
      confirmLoading={createMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={{ date: dayjs() }}>
        <Form.Item name="accountId" label={t('exchange.account')} rules={[{ required: true, message: t('common.required') }]}>
          <Select
            showSearch
            optionFilterProp="label"
            options={options}
            placeholder={t('exchange.pickAccount')}
            notFoundContent={<Text type="secondary">{t('exchange.noRevaluableAccounts')}</Text>}
          />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Form.Item name="date" label={t('exchange.date')} rules={[{ required: true, message: t('common.required') }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="newExchangeRate" label={t('exchange.newRate')} rules={[{ required: true, message: t('common.required') }]}>
            <InputNumber style={{ width: '100%' }} min={0.000001} step={0.01} />
          </Form.Item>
        </div>

        {previewing && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Spin />
          </div>
        )}

        {previewError && !previewing && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={t(`exchange.errors.${previewError}`, { defaultValue: t('common.saveFailed') })}
          />
        )}

        {preview && !previewing && (
          <>
            <Descriptions
              bordered
              size="small"
              column={1}
              style={{ marginBottom: 12 }}
              items={[
                { key: 'bal', label: t('exchange.currentBalance'), children: `${formatNumber(preview.balance, 2)} ${preview.currency}` },
                {
                  key: 'old',
                  label: t('exchange.previousRate'),
                  children: preview.oldExchangeRate ? formatNumber(preview.oldExchangeRate, 4) : <Text type="secondary">—</Text>,
                },
                { key: 'new', label: t('exchange.newRate'), children: formatNumber(preview.newExchangeRate, 4) },
                // `fractionDigits={2}` throughout: Money rounds to whole units by default, which
                // would render a 3.33 gain as "$3" — the cents ARE the result here.
                {
                  key: 'oldBase',
                  label: t('exchange.previousBase'),
                  children: <Money value={preview.oldBaseAmount} fractionDigits={2} />,
                },
                {
                  key: 'newBase',
                  label: t('exchange.newBase'),
                  children: <Money value={preview.newBaseAmount} fractionDigits={2} />,
                },
                {
                  key: 'gl',
                  label: t(`exchange.${preview.type === 'GAIN' ? 'gain' : 'loss'}`),
                  children: (
                    <Tag color={preview.type === 'GAIN' ? 'success' : 'error'}>
                      <Money value={Math.abs(preview.gainLossAmount)} fractionDigits={2} />
                    </Tag>
                  ),
                },
              ]}
            />
            {/* Spelled out because it is the least obvious part of the module: the "previous
                rate" is what the balance is CARRIED at, not the rate of the transfer that
                created it — that is what stops repeated revaluations double-counting. */}
            <Alert type="info" showIcon message={t('exchange.bookRateHint')} style={{ marginBottom: 12 }} />
          </>
        )}

        <Form.Item name="notes" label={t('exchange.notes')}>
          <TextArea rows={2} maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
