import { App, Form, Input, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreateGood, useUpdateGood } from '@/services/queries';
import type { GoodInput } from '@/services/api';
import type { Good, GoodForm as GoodFormType, GoodUnit, MetalType } from '@/types';
import { GOOD_FORMS, GOOD_UNITS, METAL_TYPES } from '@/config/constants';

const { TextArea } = Input;

interface GoodFormValues {
  name: string;
  code: string;
  metalType: MetalType;
  form?: GoodFormType;
  unit: GoodUnit;
  hsCode?: string;
  description?: string;
}

interface GoodFormModalProps {
  open: boolean;
  onClose: () => void;
  good?: Good;
}

/** Copies `CostCentreFormModal` — same create/edit shape, same immutable `code` on edit, same
 *  server-error-to-field-error mapping. Only the field set differs. */
export function GoodFormModal({ open, onClose, good }: GoodFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<GoodFormValues>();
  const createMut = useCreateGood();
  const updateMut = useUpdateGood();
  const isEdit = !!good;

  const initialValues: Partial<GoodFormValues> = good
    ? {
        name: good.name,
        code: good.code,
        metalType: good.metalType,
        form: good.form,
        unit: good.unit,
        hsCode: good.hsCode,
        description: good.description,
      }
    : { unit: 'MT' };

  const submit = async () => {
    let values: GoodFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: GoodInput = {
      name: values.name.trim(),
      code: values.code.trim(),
      metalType: values.metalType,
      form: values.form,
      unit: values.unit,
      hsCode: values.hsCode?.trim() || undefined,
      description: values.description?.trim() || undefined,
    };
    try {
      if (isEdit && good) {
        await updateMut.mutateAsync({ id: good.id, input });
        message.success(t('goods.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('goods.created'));
      }
      onClose();
    } catch (e) {
      // Server-side guards surface on the offending field rather than as a toast, so the user
      // can see WHICH input to change (the `CostCentreFormModal` precedent).
      if (e instanceof Error) {
        if (e.message === 'duplicate-code') {
          form.setFields([{ name: 'code', errors: [t('goods.codeTaken')] }]);
          return;
        }
        if (e.message === 'duplicate-name') {
          form.setFields([{ name: 'name', errors: [t('goods.nameTaken')] }]);
          return;
        }
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('goods.editGood') : t('goods.newGood')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={good?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item
          name="name"
          label={t('goods.name')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input placeholder={t('goods.namePlaceholder')} />
        </Form.Item>
        <Form.Item
          name="code"
          label={t('goods.code')}
          rules={[
            { required: true, message: t('common.required') },
            { pattern: /^[A-Za-z0-9-]+$/, message: t('goods.codeInvalid') },
          ]}
        >
          <Input placeholder={t('goods.codePlaceholder')} disabled={isEdit} />
        </Form.Item>
        <Form.Item
          name="metalType"
          label={t('goods.metalType')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select
            placeholder={t('goods.metalTypePlaceholder')}
            options={METAL_TYPES.map((m) => ({ value: m, label: t(`metalTypes.${m}`) }))}
          />
        </Form.Item>
        <Form.Item name="form" label={t('goods.form')}>
          <Select
            allowClear
            placeholder={t('goods.formPlaceholder')}
            options={GOOD_FORMS.map((f) => ({ value: f, label: t(`goodForms.${f}`) }))}
          />
        </Form.Item>
        <Form.Item
          name="unit"
          label={t('goods.unit')}
          // Not disabled even though MT is the only option today: a disabled AntD control still
          // submits its value, but a reader would assume otherwise. `GOOD_UNITS` is the single
          // place to widen, and `Good.unit`'s doc-comment lists what else must change.
          rules={[{ required: true, message: t('common.required') }]}
          extra={t('goods.unitHint')}
        >
          <Select options={GOOD_UNITS.map((u) => ({ value: u, label: u }))} />
        </Form.Item>
        <Form.Item name="hsCode" label={t('goods.hsCode')}>
          <Input placeholder={t('goods.hsCodePlaceholder')} />
        </Form.Item>
        <Form.Item name="description" label={t('goods.description')}>
          <TextArea rows={3} maxLength={300} showCount placeholder={t('goods.descriptionPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
