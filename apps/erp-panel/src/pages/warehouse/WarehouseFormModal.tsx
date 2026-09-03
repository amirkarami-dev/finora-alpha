import { App, Form, Input, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreateWarehouse, useUpdateWarehouse } from '@/services/queries';
import type { WarehouseInput } from '@/services/api';
import type { Warehouse } from '@/types';

interface WarehouseFormValues {
  name: string;
  location?: string;
}

interface WarehouseFormModalProps {
  open: boolean;
  onClose: () => void;
  warehouse?: Warehouse;
}

export function WarehouseFormModal({ open, onClose, warehouse }: WarehouseFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<WarehouseFormValues>();
  const createMut = useCreateWarehouse();
  const updateMut = useUpdateWarehouse();
  const isEdit = !!warehouse;

  const initialValues: Partial<WarehouseFormValues> = warehouse
    ? { name: warehouse.name, location: warehouse.location }
    : {};

  const submit = async () => {
    let values: WarehouseFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: WarehouseInput = {
      name: values.name.trim(),
      location: values.location?.trim() || undefined,
    };
    try {
      if (isEdit && warehouse) {
        await updateMut.mutateAsync({ id: warehouse.id, input });
        message.success(t('warehouse.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('warehouse.created'));
      }
      onClose();
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('warehouse.editWarehouse') : t('warehouse.newWarehouse')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={warehouse?.id ?? 'new'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item
          name="name"
          label={t('warehouse.name')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input placeholder={t('warehouse.namePlaceholder')} />
        </Form.Item>
        {isEdit && (
          <Form.Item label={t('warehouse.code')}>
            <Input value={warehouse?.code} disabled />
          </Form.Item>
        )}
        <Form.Item name="location" label={t('warehouse.location')}>
          <Input placeholder={t('warehouse.locationPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
