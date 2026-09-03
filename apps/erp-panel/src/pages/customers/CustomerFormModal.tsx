import { Alert, App, Col, Form, Input, InputNumber, Modal, Row, Select, Switch } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreateCustomer, useUpdateCustomer } from '@/services/queries';
import { CURRENCIES } from '@/config/constants';
import type { CustomerInput } from '@/services/api';
import type { Customer, CustomerType } from '@/types';

const CUSTOMER_TYPES: CustomerType[] = ['BUYER', 'SUPPLIER', 'BOTH', 'EMPLOYEE', 'OTHER'];

/** Person types that never trade, so the trading fields do not apply to them. Kept as a list
 *  rather than `=== 'EMPLOYEE'` checks so adding a third such type is one entry, not a hunt. */
const NON_TRADING_TYPES: CustomerType[] = ['EMPLOYEE', 'OTHER'];

/** Values forced for a non-trading person. Their trading fields are hidden, and
 *  `preserve={false}` drops an unmounted field's value, so the form would otherwise submit
 *  `undefined` for three fields `Customer` requires. Writing them explicitly also means
 *  switching an existing buyer to Employee clears their old credit limit rather than leaving a
 *  stale number hidden behind the type. */
const NON_TRADING_DEFAULTS = {
  defaultCurrency: 'AED',
  paymentTermsDays: 0,
  creditLimit: 0,
  portalAccount: false,
} satisfies Partial<CustomerInput>;

interface CustomerFormValues {
  name: string;
  customerType: CustomerType;
  defaultCurrency: Customer['defaultCurrency'];
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  paymentTermsDays: number;
  creditLimit: number;
  portalAccount?: boolean;
}

interface CustomerFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided the modal edits this customer; otherwise it creates one. */
  customer?: Customer;
}

export function CustomerFormModal({ open, onClose, customer }: CustomerFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<CustomerFormValues>();
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();
  const isEdit = !!customer;
  const selectedType = Form.useWatch('customerType', form) ?? customer?.customerType ?? 'BUYER';
  const isNonTrading = NON_TRADING_TYPES.includes(selectedType);

  const initialValues: Partial<CustomerFormValues> = customer
    ? {
        name: customer.name,
        customerType: customer.customerType,
        defaultCurrency: customer.defaultCurrency,
        contactName: customer.contactName,
        email: customer.email,
        phone: customer.phone,
        country: customer.country,
        paymentTermsDays: customer.paymentTermsDays,
        creditLimit: customer.creditLimit,
        portalAccount: customer.portalAccount ?? false,
      }
    : { defaultCurrency: 'AED', customerType: 'BUYER', paymentTermsDays: 30, creditLimit: 0, portalAccount: false };

  const submit = async () => {
    let values: CustomerFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: CustomerInput = {
      name: values.name.trim(),
      customerType: values.customerType,
      contactName: values.contactName?.trim() || undefined,
      email: values.email?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      country: values.country?.trim() || undefined,
      // A non-trading person's trading fields are not rendered, so read them from the constant
      // rather than from `values`, where they are `undefined`.
      ...(isNonTrading
        ? NON_TRADING_DEFAULTS
        : {
            defaultCurrency: values.defaultCurrency,
            paymentTermsDays: values.paymentTermsDays,
            creditLimit: values.creditLimit,
            portalAccount: values.portalAccount ?? false,
          }),
    };
    try {
      if (isEdit && customer) {
        await updateMut.mutateAsync({ id: customer.id, input });
        message.success(t('customers.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('customers.created'));
      }
      onClose();
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={640}
      title={isEdit ? t('customers.editCustomer') : t('customers.newCustomer')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={customer?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="name" label={t('customers.nameLabel')} rules={[{ required: true, message: t('common.required') }]}>
              <Input placeholder={t('customers.namePlaceholder')} />
            </Form.Item>
          </Col>
          {isEdit && (
            <Col xs={24} sm={12}>
              <Form.Item label={t('customers.code')}>
                <Input value={customer?.code} disabled />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={12}>
            <Form.Item name="customerType" label={t('customers.type')} rules={[{ required: true, message: t('common.required') }]}>
              <Select options={CUSTOMER_TYPES.map((v) => ({ value: v, label: t(`customerTypes.${v}`) }))} />
            </Form.Item>
          </Col>
          {/* Trading fields, hidden for a non-trading person — see NON_TRADING_DEFAULTS.
              Rendering is skipped rather than the input disabled, so a required rule on an
              irrelevant field can never block the save. */}
          {!isNonTrading && (
            <Col xs={24} sm={12}>
              <Form.Item name="defaultCurrency" label={t('customers.currency')} rules={[{ required: true, message: t('common.required') }]}>
                <Select options={CURRENCIES.map((v) => ({ value: v, label: v }))} />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={12}>
            <Form.Item name="contactName" label={t('customers.contact')}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="email" label={t('auth.email')} rules={[{ type: 'email', message: t('customers.emailInvalid') }]}>
              <Input placeholder={t('customers.emailPlaceholder')} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="phone" label={t('customers.phone')}>
              <Input placeholder={t('customers.phonePlaceholder')} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="country" label={t('customers.country')}>
              <Input placeholder={t('customers.countryPlaceholder')} />
            </Form.Item>
          </Col>
          {!isNonTrading && (
            <>
              <Col xs={24} sm={12}>
                <Form.Item name="paymentTermsDays" label={t('customers.termsLabel')} rules={[{ required: true, message: t('common.required') }]}>
                  <InputNumber min={0} step={1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="creditLimit" label={t('customers.creditLimit')} rules={[{ required: true, message: t('common.required') }]}>
                  <InputNumber min={0} step={1000} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item
                  name="portalAccount"
                  label={t('customers.portalAccount')}
                  valuePropName="checked"
                  extra={t('customers.portalAccountHelp')}
                >
                  <Switch />
                </Form.Item>
              </Col>
            </>
          )}
          {isNonTrading && (
            <Col xs={24}>
              <Alert type="info" showIcon message={t('customers.nonTradingHint')} />
            </Col>
          )}
        </Row>
      </Form>
    </Modal>
  );
}
