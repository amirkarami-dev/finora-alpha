import { App, Form, Input, InputNumber, Modal, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useChangeItemQuantity } from '@/services/queries';
import { formatMt } from '@/utils/format';
import { roundMt } from '@/utils/calc';
import type { Item } from '@/types';
import { changeQuantityMessage } from './changeQuantityErrors';

const { Text } = Typography;

interface ChangeQuantityFormValues {
  deltaMt?: number;
  note?: string;
}

interface ChangeQuantityModalProps {
  open: boolean;
  onClose: () => void;
  item: Item;
}

/** +/− MT with a required note. The server moves the quantity and writes the history row. */
export function ChangeQuantityModal({ open, onClose, item }: ChangeQuantityModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<ChangeQuantityFormValues>();
  const changeMut = useChangeItemQuantity();
  const delta = Form.useWatch('deltaMt', form) ?? 0;
  const newQuantity = roundMt(item.quantityMt + delta);

  const submit = async () => {
    let values: ChangeQuantityFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    try {
      await changeMut.mutateAsync({
        itemId: item.id,
        input: { deltaMt: values.deltaMt ?? 0, note: values.note?.trim() ?? '' },
      });
      message.success(t('contracts.quantityChanged'));
      onClose();
    } catch (err) {
      message.error(changeQuantityMessage(err, t));
    }
  };

  return (
    <Modal
      open={open}
      title={t('contracts.changeQuantityTitle', { product: item.product })}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={changeMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={item.id} form={form} layout="vertical" preserve={false}>
        <Form.Item label={t('contracts.currentQuantity')}>
          <Text strong>{formatMt(item.quantityMt)}</Text>
        </Form.Item>
        <Form.Item
          name="deltaMt"
          label={t('contracts.deltaMt')}
          rules={[
            { required: true, message: t('common.required') },
            {
              validator: async (_, v: number | undefined) => {
                if (v === undefined || v === null) return;
                if (roundMt(v) === 0) throw new Error(t('contracts.changeDeltaZero'));
                if (roundMt(item.quantityMt + v) <= 0) {
                  throw new Error(t('contracts.changeBelowZero', { mt: formatMt(item.quantityMt) }));
                }
              },
            },
          ]}
        >
          <InputNumber precision={6} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label={t('contracts.newQuantity')}>
          <Text strong type={newQuantity <= 0 ? 'danger' : undefined}>{formatMt(newQuantity)}</Text>
        </Form.Item>
        <Form.Item
          name="note"
          label={t('contracts.changeNote')}
          rules={[{ required: true, whitespace: true, message: t('contracts.changeNoteRequired') }]}
        >
          <Input.TextArea rows={3} maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
