import { App, Form, Input, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreateFinancialAccount, useUpdateFinancialAccount } from '@/services/queries';
import type { FinancialAccountInput } from '@/services/api';
import type { Currency, FinancialAccount, FinancialAccountType } from '@/types';
import { CURRENCIES } from '@/config/constants';

const { TextArea } = Input;

interface FormValues {
  name: string;
  currency: Currency;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  address?: string;
  description?: string;
}

interface FinancialAccountFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Fixed by the tab that opened this — a bank form and a cash-safe form are the same modal. */
  type: FinancialAccountType;
  account?: FinancialAccount;
}

/** Server guard code → the field that should show the error. Anything not listed falls through
 *  to a generic toast, so a new server guard cannot silently vanish. */
const FIELD_FOR_ERROR: Record<string, keyof FormValues> = {
  'name-required': 'name',
  'duplicate-name': 'name',
  'account-number-required': 'accountNumber',
  'duplicate-account-number': 'accountNumber',
  'iban-required': 'iban',
};

export function FinancialAccountFormModal({ open, onClose, type, account }: FinancialAccountFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const createMut = useCreateFinancialAccount();
  const updateMut = useUpdateFinancialAccount();
  const isEdit = !!account;
  const isBank = type === 'BANK';
  const ns = isBank ? 'banks' : 'cashSafes';

  const initialValues: Partial<FormValues> = account
    ? {
        name: account.name,
        currency: account.currency,
        accountNumber: account.accountNumber,
        iban: account.iban,
        swiftCode: account.swiftCode,
        address: account.address,
        description: account.description,
      }
    : { currency: 'USD' };

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: FinancialAccountInput = {
      name: values.name.trim(),
      type,
      currency: values.currency,
      description: values.description?.trim() || undefined,
      ...(isBank
        ? {
            accountNumber: values.accountNumber?.trim(),
            iban: values.iban?.trim(),
            swiftCode: values.swiftCode?.trim() || undefined,
            address: values.address?.trim() || undefined,
          }
        : {}),
    };
    try {
      if (isEdit && account) {
        await updateMut.mutateAsync({ id: account.id, input });
        message.success(t(`${ns}.updated`));
      } else {
        await createMut.mutateAsync(input);
        message.success(t(`${ns}.created`));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      const field = FIELD_FOR_ERROR[code];
      if (field) {
        form.setFields([{ name: field, errors: [t(`financialAccounts.errors.${code}`)] }]);
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={isBank ? 640 : 520}
      title={isEdit ? t(`${ns}.editAccount`) : t(`${ns}.newAccount`)}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={account?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item name="name" label={t('financialAccounts.name')} rules={[{ required: true, message: t('common.required') }]}>
          <Input placeholder={t(`${ns}.namePlaceholder`)} />
        </Form.Item>
        <Form.Item
          name="currency"
          label={t('financialAccounts.currency')}
          rules={[{ required: true, message: t('common.required') }]}
          // Immutable after create, enforced server-side too: the currency defines what this
          // account's balance means, so changing it would reinterpret every booked transfer.
          extra={isEdit ? t('financialAccounts.currencyLocked') : undefined}
        >
          <Select disabled={isEdit} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Form.Item>

        {isBank && (
          <>
            <Form.Item
              name="accountNumber"
              label={t('banks.accountNumber')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <Input dir="ltr" placeholder={t('banks.accountNumberPlaceholder')} />
            </Form.Item>
            <Form.Item name="iban" label={t('banks.iban')} rules={[{ required: true, message: t('common.required') }]}>
              <Input dir="ltr" placeholder={t('banks.ibanPlaceholder')} />
            </Form.Item>
            <Form.Item name="swiftCode" label={t('banks.swiftCode')}>
              <Input dir="ltr" placeholder={t('banks.swiftCodePlaceholder')} />
            </Form.Item>
            <Form.Item name="address" label={t('banks.address')}>
              <Input placeholder={t('banks.addressPlaceholder')} />
            </Form.Item>
          </>
        )}

        <Form.Item name="description" label={t('financialAccounts.description')}>
          <TextArea rows={2} maxLength={300} showCount placeholder={t('financialAccounts.descriptionPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
