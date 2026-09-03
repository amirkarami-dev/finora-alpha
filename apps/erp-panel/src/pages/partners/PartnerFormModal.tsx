import { App, Form, Input, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreatePartner, useUpdatePartner } from '@/services/queries';
import type { PartnerInput } from '@/services/api';
import type { Partner } from '@/types';

interface PartnerFormValues {
  name: string;
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
    ? { name: partner.name }
    : {};

  const submit = async () => {
    let values: PartnerFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: PartnerInput = { name: values.name.trim() };
    try {
      if (isEdit && partner) {
        await updateMut.mutateAsync({ id: partner.id, input });
        message.success(t('partners.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('partners.created'));
      }
      onClose();
    } catch {
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
        {isEdit && (
          <Form.Item label={t('partners.code')}>
            <Input value={partner?.code} disabled />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
