import { App, Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreateCustomer, useUpdateCustomer } from '@/services/queries';
import { CURRENCIES } from '@/config/constants';
import type { CustomerInput } from '@/services/api';
import type { Customer, CustomerType } from '@/types';

const CUSTOMER_TYPES: CustomerType[] = ['BUYER', 'SUPPLIER', 'BOTH'];

interface CustomerFormValues {
  name: string;
  code: string;
  customerType: CustomerType;
  defaultCurrency: Customer['defaultCurrency'];
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  paymentTermsDays: number;
  creditLimit: number;
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

  const initialValues: Partial<CustomerFormValues> = customer
    ? {
        name: customer.name,
        code: customer.code,
        customerType: customer.customerType,
        defaultCurrency: customer.defaultCurrency,
        contactName: customer.contactName,
        email: customer.email,
        phone: customer.phone,
        country: customer.country,
        paymentTermsDays: customer.paymentTermsDays,
        creditLimit: customer.creditLimit,
      }
    : { defaultCurrency: 'AED', customerType: 'BUYER', paymentTermsDays: 30, creditLimit: 0 };

  const submit = async () => {
    let values: CustomerFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: CustomerInput = {
      name: values.name.trim(),
      code: values.code.trim(),
      customerType: values.customerType,
      defaultCurrency: values.defaultCurrency,
      contactName: values.contactName?.trim() || undefined,
      email: values.email?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      country: values.country?.trim() || undefined,
      paymentTermsDays: values.paymentTermsDays,
      creditLimit: values.creditLimit,
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
    } catch (e) {
      if (e instanceof Error && e.message === 'duplicate-code') {
        form.setFields([{ name: 'code', errors: [t('customers.codeTaken')] }]);
        return;
      }
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
          <Col xs={24} sm={12}>
            <Form.Item
              name="code"
              label={t('customers.code')}
              rules={[
                { required: true, message: t('common.required') },
                { pattern: /^[A-Za-z0-9-]+$/, message: t('customers.codeInvalid') },
              ]}
            >
              <Input placeholder={t('customers.codePlaceholder')} disabled={isEdit} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="customerType" label={t('customers.type')} rules={[{ required: true, message: t('common.required') }]}>
              <Select options={CUSTOMER_TYPES.map((v) => ({ value: v, label: t(`customerTypes.${v}`) }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="defaultCurrency" label={t('customers.currency')} rules={[{ required: true, message: t('common.required') }]}>
              <Select options={CURRENCIES.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
          </Col>
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
        </Row>
      </Form>
    </Modal>
  );
}
