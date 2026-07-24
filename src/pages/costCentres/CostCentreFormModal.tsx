import { App, Form, Input, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreateCostCentre, useUpdateCostCentre } from '@/services/queries';
import type { CostCentreInput } from '@/services/api';
import type { CostCentre } from '@/types';

const { TextArea } = Input;

interface CostCentreFormValues {
  name: string;
  code: string;
  description?: string;
}

interface CostCentreFormModalProps {
  open: boolean;
  onClose: () => void;
  costCentre?: CostCentre;
}

export function CostCentreFormModal({ open, onClose, costCentre }: CostCentreFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<CostCentreFormValues>();
  const createMut = useCreateCostCentre();
  const updateMut = useUpdateCostCentre();
  const isEdit = !!costCentre;

  const initialValues: Partial<CostCentreFormValues> = costCentre
    ? { name: costCentre.name, code: costCentre.code, description: costCentre.description }
    : {};

  const submit = async () => {
    let values: CostCentreFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: CostCentreInput = {
      name: values.name.trim(),
      code: values.code.trim(),
      description: values.description?.trim() || undefined,
    };
    try {
      if (isEdit && costCentre) {
        await updateMut.mutateAsync({ id: costCentre.id, input });
        message.success(t('costCentres.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('costCentres.created'));
      }
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message === 'duplicate-code') {
        form.setFields([{ name: 'code', errors: [t('costCentres.codeTaken')] }]);
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('costCentres.editCostCentre') : t('costCentres.newCostCentre')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={costCentre?.id ?? 'new'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item
          name="name"
          label={t('costCentres.name')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input placeholder={t('costCentres.namePlaceholder')} />
        </Form.Item>
        <Form.Item
          name="code"
          label={t('costCentres.code')}
          rules={[
            { required: true, message: t('common.required') },
            { pattern: /^[A-Za-z0-9-]+$/, message: t('costCentres.codeInvalid') },
          ]}
        >
          <Input placeholder={t('costCentres.codePlaceholder')} disabled={isEdit} />
        </Form.Item>
        <Form.Item name="description" label={t('costCentres.description')}>
          <TextArea rows={3} maxLength={300} showCount placeholder={t('costCentres.descriptionPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
