import { App, Form, Input, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreateChargeCategory, useUpdateChargeCategory } from '@/services/queries';
import type { ChargeCategoryInput } from '@/services/api';
import type { ChargeCategory, ChargeDirection, ChargeScope } from '@/types';

const { TextArea } = Input;

interface ChargeCategoryFormValues {
  name: string;
  scope: ChargeScope;
  description?: string;
}

interface ChargeCategoryFormModalProps {
  open: boolean;
  onClose: () => void;
  category?: ChargeCategory;
  /** Not a form field — fixed by which BaseInfo tab opened the modal (design spec §6). */
  direction: ChargeDirection;
}

/** Copies `CostCentreFormModal.tsx`'s idioms verbatim, adding a scope Select that (like code)
 *  is immutable after create — see `ChargeCategory` (types/index.ts, design spec §2). */
export function ChargeCategoryFormModal({ open, onClose, category, direction }: ChargeCategoryFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<ChargeCategoryFormValues>();
  const createMut = useCreateChargeCategory();
  const updateMut = useUpdateChargeCategory();
  const isEdit = !!category;

  const initialValues: Partial<ChargeCategoryFormValues> = category
    ? {
        name: category.name,
        scope: category.scope,
        description: category.description,
      }
    : { scope: 'INVOICE' };

  const submit = async () => {
    let values: ChargeCategoryFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: ChargeCategoryInput = {
      name: values.name.trim(),
      direction,
      scope: values.scope,
      description: values.description?.trim() || undefined,
    };
    try {
      if (isEdit && category) {
        await updateMut.mutateAsync({ id: category.id, input });
        message.success(t('chargeCategories.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('chargeCategories.created'));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      // The server validates name independently of this form (api.ts's
      // `createChargeCategory`/`updateChargeCategory`, spec §4) — surface that on the offending
      // field rather than as a generic "save failed". `code` is server-assigned, so the
      // matching guard can no longer fire.
      if (code === 'name-required') {
        form.setFields([{ name: 'name', errors: [t(`chargeCategories.errors.${code}`)] }]);
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('chargeCategories.editCategory') : t('chargeCategories.newCategory')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={category?.id ?? 'new'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item
          name="name"
          label={t('chargeCategories.name')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input placeholder={t('chargeCategories.namePlaceholder')} />
        </Form.Item>
        {isEdit && (
          <Form.Item label={t('chargeCategories.code')}>
            <Input value={category?.code} disabled />
          </Form.Item>
        )}
        <Form.Item
          name="scope"
          label={t('chargeCategories.scope')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select
            disabled={isEdit}
            options={[
              { value: 'INVOICE', label: t('chargeScopes.INVOICE') },
              { value: 'GENERAL', label: t('chargeScopes.GENERAL') },
            ]}
          />
        </Form.Item>
        <Form.Item name="description" label={t('chargeCategories.description')}>
          <TextArea
            rows={3}
            maxLength={300}
            showCount
            placeholder={t('chargeCategories.descriptionPlaceholder')}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
