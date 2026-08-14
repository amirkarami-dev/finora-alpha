import { App, Form, Input, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreatePartner, useUpdatePartner } from '@/services/queries';
import type { PartnerInput } from '@/services/api';
import type { Partner } from '@/types';

interface PartnerFormValues {
  name: string;
  code: string;
}

interface PartnerFormModalProps {
  open: boolean;
  onClose: () => void;
  partner?: Partner;
}

export function PartnerFormModal({ open, onClose, partner }: PartnerFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<PartnerFormValues>();
  const createMut = useCreatePartner();
  const updateMut = useUpdatePartner();
  const isEdit = !!partner;

  const initialValues: Partial<PartnerFormValues> = partner
    ? { name: partner.name, code: partner.code }
    : {};

  const submit = async () => {
    let values: PartnerFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: PartnerInput = { name: values.name.trim(), code: values.code.trim() };
    try {
      if (isEdit && partner) {
        await updateMut.mutateAsync({ id: partner.id, input });
        message.success(t('partners.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('partners.created'));
      }
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message === 'duplicate-code') {
        form.setFields([{ name: 'code', errors: [t('partners.codeTaken')] }]);
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('partners.editPartner') : t('partners.newPartner')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={partner?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item name="name" label={t('partners.name')} rules={[{ required: true, message: t('common.required') }]}>
          <Input placeholder={t('partners.namePlaceholder')} />
        </Form.Item>
        <Form.Item
          name="code"
          label={t('partners.code')}
          rules={[
            { required: true, message: t('common.required') },
            { pattern: /^[A-Za-z0-9-]+$/, message: t('partners.codeInvalid') },
          ]}
        >
          <Input placeholder={t('partners.codePlaceholder')} disabled={isEdit} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
